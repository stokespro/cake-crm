-- BankSync → Finance Phase 1: database infrastructure only.
-- NO app/UI code changes are part of this migration.
-- Applied by Stokely via MCP after review. Do NOT apply manually.
--
-- Objects created:
--   1. ALTER finance_cash_snapshots ADD COLUMN source
--   2. TABLE  finance_reconciliation_log
--   3. FUNCTION get_bank_balance()
--   4. FUNCTION get_bank_transactions(since_date)
--   5. FUNCTION get_untracked_bank_transactions()
--   6. FUNCTION sync_bank_snapshot_to_finance()
--   7. FUNCTION reconcile_cleared_checks()
--   8. pg_cron schedule for sync_bank_snapshot_to_finance
--
-- Security model: service-role ONLY for the three bank-bridge functions.
-- Rationale: lib/supabase/server.ts already exposes createServiceClient()
-- which uses SUPABASE_SERVICE_ROLE_KEY. Phase 2 server actions will call
-- these functions via a service-role client after their own admin/management
-- role check in the server action layer. Granting to `service_role` (not
-- `authenticated`) means even a compromised anon or authenticated JWT cannot
-- reach bank data directly — the only path is through the server-side action
-- that holds the service key. This is the strictest correct gate given the
-- app's dual-auth model (PIN auth never produces a Supabase auth.uid(), so
-- in-function auth.uid() guards would not work for those sessions).
-- ============================================================


-- ============================================================
-- 1. ADD source COLUMN TO finance_cash_snapshots
-- ============================================================
-- Additive only. Existing rows default to 'manual'.

ALTER TABLE public.finance_cash_snapshots
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'bank'));

COMMENT ON COLUMN public.finance_cash_snapshots.source IS
  '''manual'' = entered by a staff member; ''bank'' = auto-populated from BankSync via sync_bank_snapshot_to_finance()';


-- ============================================================
-- 2. CREATE finance_reconciliation_log
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_reconciliation_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_bs_id       BIGINT      NOT NULL,   -- banksync.__bs_id — stable transaction identity
  bill_id          UUID        REFERENCES public.finance_bills(id) ON DELETE SET NULL,
  match_type       TEXT        NOT NULL
                     CHECK (match_type IN (
                       'check_exact',
                       'check_amount_mismatch',
                       'fuzzy_suggested',
                       'untracked',
                       'already_paid'
                     )),
  bank_amount      NUMERIC(12,2),
  bill_amount      NUMERIC(12,2),
  bank_date        DATE,
  bank_description TEXT,
  status           TEXT        NOT NULL
                     CHECK (status IN (
                       'auto_applied',
                       'pending_review',
                       'confirmed',
                       'dismissed'
                     )),
  applied_at       TIMESTAMPTZ,
  applied_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency: one log row per (bank transaction, bill) pair.
  -- NULL bill_id rows (untracked) are excluded from this unique constraint
  -- so multiple untracked rows for the same bank_bs_id are allowed.
  CONSTRAINT uq_reconciliation_bank_bill UNIQUE (bank_bs_id, bill_id)
);

-- Prevent a single bank transaction from being auto-applied more than once.
-- Partial unique index: only enforced for auto_applied rows.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_reconciliation_bank_auto_applied
  ON public.finance_reconciliation_log (bank_bs_id)
  WHERE status = 'auto_applied';

CREATE INDEX IF NOT EXISTS idx_recon_log_bill_id     ON public.finance_reconciliation_log (bill_id);
CREATE INDEX IF NOT EXISTS idx_recon_log_bank_bs_id  ON public.finance_reconciliation_log (bank_bs_id);
CREATE INDEX IF NOT EXISTS idx_recon_log_status      ON public.finance_reconciliation_log (status);
CREATE INDEX IF NOT EXISTS idx_recon_log_bank_date   ON public.finance_reconciliation_log (bank_date);

COMMENT ON TABLE public.finance_reconciliation_log IS
  'Audit trail linking BankSync transactions to finance_bills. '
  'Drives the reconciliation UI and auto-apply logic. '
  'bank_bs_id is the stable __bs_id from banksync.regent_bank_to_cake_supabase_banksync.';


-- ============================================================
-- 3. BANK-BRIDGE SECURITY GRANTS (schema access for DEFINER owner)
-- ============================================================
-- The SECURITY DEFINER functions below run as their owner (postgres/supabase_admin).
-- That owner must have SELECT access to the banksync schema objects.

GRANT USAGE  ON SCHEMA banksync TO postgres;
GRANT SELECT ON banksync.v_latest_balance                           TO postgres;
GRANT SELECT ON banksync.regent_bank_to_cake_supabase_banksync      TO postgres;

-- Revoke any incidental public/anon grants on the bridge functions
-- (handled per-function below with explicit REVOKE + targeted GRANT).


-- ============================================================
-- 4. FUNCTION: get_bank_balance()
-- ============================================================
-- Returns the latest row from banksync.v_latest_balance.
-- SECURITY DEFINER so the DEFINER owner (postgres) can see the banksync schema.
-- Access locked to service_role only — anon and authenticated are blocked.

CREATE OR REPLACE FUNCTION public.get_bank_balance()
RETURNS TABLE (
  current_balance   NUMERIC,
  available_balance NUMERIC,
  pending_balance   NUMERIC,
  account_number    TEXT,
  as_of_date        DATE,
  account_name      TEXT,
  bank              TEXT,
  account_id        TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    current_balance,
    available_balance,
    pending_balance,
    account_number,
    as_of_date,
    account_name,
    bank,
    account_id
  FROM banksync.v_latest_balance
  LIMIT 1;
$$;

-- Lock down: revoke from PUBLIC (which implicitly includes anon + authenticated),
-- then grant only to service_role.
REVOKE ALL ON FUNCTION public.get_bank_balance() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_bank_balance() TO service_role;

COMMENT ON FUNCTION public.get_bank_balance() IS
  'Bridge to banksync.v_latest_balance. '
  'Callable by service_role only (Phase 2 server actions use createServiceClient()). '
  'Returns current_balance — the reconciled ledger balance — used as the cash-flow anchor.';


-- ============================================================
-- 5. FUNCTION: get_bank_transactions(since_date date)
-- ============================================================
-- Returns posted transactions from banksync, optionally filtered by date.
-- since_date is inclusive. NULL = return all records.

CREATE OR REPLACE FUNCTION public.get_bank_transactions(
  since_date DATE DEFAULT NULL
)
RETURNS TABLE (
  bs_id                BIGINT,
  id                   TEXT,
  txn_date             DATE,
  amount               NUMERIC,
  description          TEXT,
  original_description TEXT,
  merchant_name        TEXT,
  category             TEXT,
  type                 TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    t.__bs_id          AS bs_id,
    t.id,
    t.date             AS txn_date,
    t.amount,
    t.description,
    t.original_description,
    t.merchant_name,
    t.category,
    t.type
  FROM banksync.regent_bank_to_cake_supabase_banksync t
  WHERE (since_date IS NULL OR t.date >= since_date)
  ORDER BY t.date DESC, t.__bs_id DESC;
$$;

REVOKE ALL ON FUNCTION public.get_bank_transactions(DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_bank_transactions(DATE) TO service_role;

COMMENT ON FUNCTION public.get_bank_transactions(DATE) IS
  'Bridge to banksync transaction table. '
  'Callable by service_role only. '
  'since_date is inclusive; NULL returns all posted transactions.';


-- ============================================================
-- 6. FUNCTION: get_untracked_bank_transactions()
-- ============================================================
-- Outflows (amount < 0) not yet reconciled as auto_applied or confirmed,
-- and not already matched to a bill as a check.

CREATE OR REPLACE FUNCTION public.get_untracked_bank_transactions()
RETURNS TABLE (
  bs_id                BIGINT,
  id                   TEXT,
  txn_date             DATE,
  amount               NUMERIC,
  description          TEXT,
  original_description TEXT,
  merchant_name        TEXT,
  category             TEXT,
  type                 TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    t.__bs_id          AS bs_id,
    t.id,
    t.date             AS txn_date,
    t.amount,
    t.description,
    t.original_description,
    t.merchant_name,
    t.category,
    t.type
  FROM banksync.regent_bank_to_cake_supabase_banksync t
  WHERE t.amount < 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_reconciliation_log r
      WHERE r.bank_bs_id = t.__bs_id
        AND r.status IN ('auto_applied', 'confirmed')
    )
  ORDER BY t.date DESC, t.__bs_id DESC;
$$;

REVOKE ALL ON FUNCTION public.get_untracked_bank_transactions() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_untracked_bank_transactions() TO service_role;

COMMENT ON FUNCTION public.get_untracked_bank_transactions() IS
  'Outflows not yet reconciled (no auto_applied or confirmed log row). '
  'Callable by service_role only. '
  'Used by the Phase 2 untracked-spend review UI.';


-- ============================================================
-- 7. FUNCTION: sync_bank_snapshot_to_finance()
-- ============================================================
-- Reads the latest bank balance and upserts today's cash snapshot
-- (source='bank') unless a manual snapshot for today already exists
-- or the bank data is stale (> 1 day old).

CREATE OR REPLACE FUNCTION public.sync_bank_snapshot_to_finance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance        NUMERIC;
  v_as_of_date     DATE;
  v_account_number TEXT;
  v_today          DATE := CURRENT_DATE;
BEGIN
  -- Fetch the latest balance row
  SELECT current_balance, as_of_date, account_number
  INTO   v_balance, v_as_of_date, v_account_number
  FROM   banksync.v_latest_balance
  LIMIT  1;

  -- Guard: no bank data at all
  IF v_balance IS NULL THEN
    RAISE NOTICE 'sync_bank_snapshot_to_finance: no bank balance data available, skipping';
    RETURN;
  END IF;

  -- Guard: stale data — bank sync has not run recently
  IF v_as_of_date < v_today - INTERVAL '1 day' THEN
    RAISE NOTICE 'sync_bank_snapshot_to_finance: bank data is stale (as_of_date=%), skipping', v_as_of_date;
    RETURN;
  END IF;

  -- Guard: a manual snapshot for today already exists — respect it, do not overwrite
  IF EXISTS (
    SELECT 1 FROM public.finance_cash_snapshots
    WHERE snapshot_date = v_today
      AND source = 'manual'
  ) THEN
    RAISE NOTICE 'sync_bank_snapshot_to_finance: manual snapshot exists for %, skipping bank upsert', v_today;
    RETURN;
  END IF;

  -- Upsert: insert or update today's bank snapshot
  -- On conflict (uq_finance_cash_snapshots_date), update only if source='bank'
  -- (manual rows are excluded by the guard above, but belt-and-suspenders).
  INSERT INTO public.finance_cash_snapshots (
    snapshot_date,
    cash_on_hand,
    source,
    notes
  ) VALUES (
    v_today,
    v_balance,
    'bank',
    'Auto-synced from Regent Bank ****' || RIGHT(v_account_number, 4)
      || ' — bank as_of_date: ' || v_as_of_date::text
  )
  ON CONFLICT ON CONSTRAINT uq_finance_cash_snapshots_date
  DO UPDATE SET
    cash_on_hand = EXCLUDED.cash_on_hand,
    source       = 'bank',
    notes        = EXCLUDED.notes
  WHERE public.finance_cash_snapshots.source = 'bank';  -- never overwrite a manual row

  RAISE NOTICE 'sync_bank_snapshot_to_finance: upserted snapshot for % — balance %', v_today, v_balance;
END;
$$;

-- This function is triggered by pg_cron (runs as postgres/superuser), not by app users.
-- No GRANT to application roles needed. Revoke from PUBLIC for hygiene.
REVOKE ALL ON FUNCTION public.sync_bank_snapshot_to_finance() FROM PUBLIC;

COMMENT ON FUNCTION public.sync_bank_snapshot_to_finance() IS
  'Reads banksync.v_latest_balance and upserts today''s finance_cash_snapshots row (source=''bank''). '
  'Skips if: bank data is stale (>1 day old), or a manual snapshot for today exists. '
  'Scheduled by pg_cron at 13:00 UTC (≈7–8am Central) daily, safely after the 6am-Central BankSync run. '
  'Uses current_balance — the reconciled ledger balance — as the cash-flow anchor per the two-balance design.';


-- ============================================================
-- 8. FUNCTION: reconcile_cleared_checks()
-- ============================================================
-- Scans banksync for CHECK transactions, matches them to bills by check
-- number (payment_ref, leading-zeros stripped both sides), and auto-applies
-- or flags for review.
-- Returns a summary row of counts.
-- Idempotent: the unique constraint on reconciliation_log prevents reprocessing.
--
-- Bill-lookup logic (FIX 1):
--   Look up by check number regardless of bill status, then branch:
--   - status='scheduled' → process (auto-pay on exact amount, else review)
--   - status='paid'      → log already_paid audit row, skip
--   - any other status   → skip silently, no log
--   The previous version filtered WHERE status='scheduled' in the lookup,
--   making the already_paid branch dead code.
--
-- No-match behaviour (FIX 2):
--   When no bill matches the check number, do NOT insert a log row.
--   Inserting NULL bill_id rows caused duplicate flood on every re-run
--   (NULLs are distinct in the UNIQUE constraint). Unmatched outflows are
--   already surfaced by get_untracked_bank_transactions().
--
-- Check-number extraction (hardening):
--   Uses regexp_match to pull only the digit group, so trailing text
--   or extra spaces in the description can't break matching.

CREATE OR REPLACE FUNCTION public.reconcile_cleared_checks()
RETURNS TABLE (
  checked_count      INTEGER,
  auto_applied_count INTEGER,
  mismatch_count     INTEGER,
  already_paid_count INTEGER,
  no_bill_match      INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn              RECORD;
  v_bill             RECORD;
  v_check_num        TEXT;
  v_tolerance        NUMERIC := 0.01;  -- $0.01 exact-match tolerance for checks
  v_checked          INTEGER := 0;
  v_auto_applied     INTEGER := 0;
  v_mismatch         INTEGER := 0;
  v_already_paid     INTEGER := 0;
  v_no_match         INTEGER := 0;
BEGIN
  -- Iterate over banksync transactions that look like checks (posted outflows)
  FOR v_txn IN
    SELECT
      t.__bs_id    AS bs_id,
      t.date       AS txn_date,
      t.amount,
      t.description
    FROM banksync.regent_bank_to_cake_supabase_banksync t
    WHERE t.amount < 0
      AND t.description ~* 'CHECK\s*#\s*[0-9]+'
    ORDER BY t.date ASC, t.__bs_id ASC
  LOOP
    v_checked := v_checked + 1;

    -- Extract the digit group only, stripping leading zeros.
    -- regexp_match returns the first captured group or NULL if no match.
    v_check_num := (regexp_match(v_txn.description, 'CHECK\s*#\s*0*([0-9]+)', 'i'))[1];

    IF v_check_num IS NULL THEN
      -- Malformed description — skip without logging
      CONTINUE;
    END IF;

    -- Skip if already auto_applied (idempotency check for count accuracy;
    -- the INSERT below also uses ON CONFLICT DO NOTHING as belt-and-suspenders).
    IF EXISTS (
      SELECT 1 FROM public.finance_reconciliation_log
      WHERE bank_bs_id = v_txn.bs_id
        AND status = 'auto_applied'
    ) THEN
      CONTINUE;
    END IF;

    -- Look up the matching bill by check number regardless of status (FIX 1).
    -- Strip leading zeros from payment_ref to match the extracted check number.
    SELECT *
    INTO   v_bill
    FROM   public.finance_bills
    WHERE  LTRIM(payment_ref, '0') = v_check_num
    ORDER BY due_date ASC
    LIMIT 1;

    IF NOT FOUND THEN
      -- No bill matches this check number at all — do NOT log (FIX 2).
      -- Unmatched outflows are surfaced by get_untracked_bank_transactions().
      v_no_match := v_no_match + 1;
      CONTINUE;
    END IF;

    -- Branch on the matched bill's actual status (FIX 1):

    IF v_bill.status = 'paid' THEN
      -- Bill was manually marked paid before this check cleared — audit log only.
      -- bill_id is non-null here, so ON CONFLICT (bank_bs_id, bill_id) is effective.
      INSERT INTO public.finance_reconciliation_log (
        bank_bs_id, bill_id, match_type, bank_amount, bill_amount,
        bank_date, bank_description, status
      ) VALUES (
        v_txn.bs_id, v_bill.id, 'already_paid', v_txn.amount, v_bill.amount,
        v_txn.txn_date, v_txn.description, 'pending_review'
      )
      ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;

      v_already_paid := v_already_paid + 1;
      CONTINUE;

    ELSIF v_bill.status != 'scheduled' THEN
      -- Bill is unpaid, partial, void, etc. — skip silently, no log.
      CONTINUE;
    END IF;

    -- Bill is 'scheduled' — check amount match within $0.01.
    IF ABS(ABS(v_txn.amount) - v_bill.amount) <= v_tolerance THEN
      -- Exact match (within tolerance) — auto-apply.
      UPDATE public.finance_bills SET
        status       = 'paid',
        paid_date    = v_txn.txn_date,
        amount_paid  = ABS(v_txn.amount),
        updated_at   = now()
      WHERE id = v_bill.id;

      INSERT INTO public.finance_reconciliation_log (
        bank_bs_id, bill_id, match_type, bank_amount, bill_amount,
        bank_date, bank_description, status, applied_at
      ) VALUES (
        v_txn.bs_id, v_bill.id, 'check_exact', v_txn.amount, v_bill.amount,
        v_txn.txn_date, v_txn.description, 'auto_applied', now()
      )
      ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;

      v_auto_applied := v_auto_applied + 1;

    ELSE
      -- Amount differs by more than $0.01 — do NOT pay; flag for review.
      INSERT INTO public.finance_reconciliation_log (
        bank_bs_id, bill_id, match_type, bank_amount, bill_amount,
        bank_date, bank_description, status
      ) VALUES (
        v_txn.bs_id, v_bill.id, 'check_amount_mismatch', v_txn.amount, v_bill.amount,
        v_txn.txn_date, v_txn.description, 'pending_review'
      )
      ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;

      v_mismatch := v_mismatch + 1;
    END IF;

  END LOOP;

  RETURN QUERY SELECT v_checked, v_auto_applied, v_mismatch, v_already_paid, v_no_match;
END;
$$;

-- reconcile_cleared_checks is triggered manually by admin/management via a server action
-- (Phase 2). No cron schedule for MVP. Revoke PUBLIC for hygiene.
REVOKE ALL ON FUNCTION public.reconcile_cleared_checks() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reconcile_cleared_checks() TO service_role;

COMMENT ON FUNCTION public.reconcile_cleared_checks() IS
  'Scans banksync for CHECK transactions and reconciles them against finance_bills by check number (payment_ref). '
  'Bill lookup is status-agnostic: scheduled → process; paid → already_paid audit log; other → skip silently. '
  'Exact amount match (within $0.01): marks scheduled bill paid, logs auto_applied. '
  'Amount mismatch (>$0.01): logs pending_review, does NOT pay. '
  'No bill match: increments no_bill_match counter only — no log row (prevents NULL-bill_id flood on re-runs). '
  'Idempotent via unique constraint — safe to re-run. '
  'NOTE: NOT scheduled via cron for MVP; triggered manually by admin/management (Phase 2 server action).';


-- ============================================================
-- 9. pg_cron: schedule sync_bank_snapshot_to_finance daily
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant pg_cron usage to postgres role (required on some Supabase tiers)
GRANT USAGE ON SCHEMA cron TO postgres;

-- 13:00 UTC ≈ 7–8am Central (CDT/CST), safely after the 6am-Central BankSync run.
-- pg_cron always interprets cron expressions as UTC.
-- Stokely should confirm the exact bank-sync timezone and may tweak this hour.
SELECT cron.schedule(
  'sync-bank-snapshot-daily',
  '0 13 * * *',
  'SELECT public.sync_bank_snapshot_to_finance()'
);

-- NOTE: reconcile_cleared_checks() is intentionally NOT scheduled via cron.
-- It is a manual-trigger function for MVP (Phase 2 will expose it via a server action
-- callable by admin/management roles using the service-role client).
