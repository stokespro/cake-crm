-- Migration: recon_matcher_v3_keyword_gated
-- Applied 2026-07-01 via mcp__cake-db__apply_migration
--
-- Changes:
--   1. (FOR THE RECORD) Idempotent re-declaration of existing banksync dedup
--      objects: function banksync.dedup_transaction_insert(), trigger
--      trg_dedup_transaction, and index idx_regent_txn_id. These were applied
--      in an earlier session and already exist on the table. Included here so
--      the migration history is complete.
--
--   2. REWRITE public.reconcile_non_check_debits() — two-phase keyword-gated
--      bill-matching engine (v3). Fixes:
--        a) Fan-out bug: old code emitted amount_only proposals against ALL
--           same-amount bills even when a keyword already matched a specific
--           vendor. New Phase 1 finds keyword matches; Phase 2 (amount-only
--           fallback) is SKIPPED entirely for that transaction.
--        b) Wrong-vendor bug: old code matched keyworded vendors (e.g., Elite
--           Element) via amount_only when their keywords did NOT match the
--           bank description. New Phase 1 includes keyworded vendors only when
--           at least one keyword matches; non-matching keyworded vendors are
--           excluded from both phases.
--        c) Future-date bug: old ABS(due_date - txn_date) <= 45 permitted
--           bills due weeks after the charge. New Phase 2 uses a directional
--           window: due_date BETWEEN (txn_date - 45 days) AND
--           (txn_date + 5 days) — never more than 5 days into the future.
--
-- Security: SECURITY DEFINER, SET search_path='public', service_role only.
-- Return signature unchanged: (scanned_count, proposed_count, skipped_count).


-- ============================================================
-- SECTION 1: DEDUP OBJECTS (idempotent, for the record)
-- ============================================================

-- Dedup function: silently drops any INSERT whose bank txn `id` already
-- exists in the table. Runs BEFORE INSERT on banksync.regent_bank_to_cake_supabase_banksync.
CREATE OR REPLACE FUNCTION banksync.dedup_transaction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NOT NULL
     AND EXISTS (SELECT 1 FROM banksync.regent_bank_to_cake_supabase_banksync t WHERE t.id = NEW.id) THEN
    RETURN NULL;  -- duplicate transaction id -> skip silently, no error to BankSync
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger wiring (BEFORE INSERT so we can suppress the row with RETURN NULL).
-- Use DROP+CREATE to be fully idempotent regardless of Postgres version.
DROP TRIGGER IF EXISTS trg_dedup_transaction
  ON banksync.regent_bank_to_cake_supabase_banksync;

CREATE TRIGGER trg_dedup_transaction
  BEFORE INSERT ON banksync.regent_bank_to_cake_supabase_banksync
  FOR EACH ROW EXECUTE FUNCTION banksync.dedup_transaction_insert();

-- Supporting index on the bank's own transaction id column.
CREATE INDEX IF NOT EXISTS idx_regent_txn_id
  ON banksync.regent_bank_to_cake_supabase_banksync (id);


-- ============================================================
-- SECTION 2: REWRITE reconcile_non_check_debits() — v3
-- ============================================================
--
-- Two-phase matching per transaction:
--
-- Phase 1 — keyword matches (confident):
--   Bills where:
--     • amount matches (±$0.01)
--     • status IN ('unpaid','partial','scheduled','paid')
--     • ABS(due_date - txn_date) <= 45 (symmetric — already-due and near-due)
--     • vendor.bank_keywords IS NOT NULL AND TRIM <> ''
--     • at least one keyword (comma-split, trimmed, case-insensitive substring)
--       matches txn description OR merchant_name
--   Insert with match_type = 'already_paid_non_check' (if bill paid) else 'card_amount_vendor'.
--   Set found_keyword_match = TRUE if any proposal was inserted this phase.
--
-- Phase 2 — amount-only fallback (ONLY when found_keyword_match is FALSE):
--   Bills where:
--     • amount matches (±$0.01)
--     • status IN ('unpaid','partial','scheduled','paid')
--     • vendor has NO keywords (bank_keywords IS NULL OR trim = '')
--     • DIRECTIONAL date window:
--         b.due_date BETWEEN (txn_date - INTERVAL '45 days')
--                        AND (txn_date + INTERVAL '5 days')
--       (never more than 5 days in the future — never matches upcoming payroll, etc.)
--   Insert with match_type = 'amount_only'.
--
-- Everything else is UNCHANGED from v2 (recon_phase2 migration):
--   • Outer scan: amount < 0, NOT a check description, NOT already auto_applied/confirmed
--   • Payment-method CASE expression
--   • ON CONFLICT (bank_bs_id, bill_id) DO NOTHING
--   • Per-(bank_bs_id,bill_id) NOT EXISTS guard in inner query
--   • SECURITY DEFINER, SET search_path = public, service_role only
--   • Return signature: (scanned_count, proposed_count, skipped_count)

CREATE OR REPLACE FUNCTION public.reconcile_non_check_debits()
RETURNS TABLE (scanned_count INTEGER, proposed_count INTEGER, skipped_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn              RECORD;
  v_bill             RECORD;
  v_keyword          TEXT;
  v_keywords         TEXT[];
  v_pay_method       TEXT;
  v_kw_matched       BOOLEAN;
  v_match_type       TEXT;
  v_found_keyword    BOOLEAN;  -- TRUE when Phase 1 produced at least one proposal for this txn
  v_scanned          INTEGER := 0;
  v_proposed         INTEGER := 0;
  v_skipped          INTEGER := 0;
BEGIN
  -- Outer loop: non-check debit transactions not yet auto_applied or confirmed
  FOR v_txn IN
    SELECT
      t.__bs_id        AS bs_id,
      t.date           AS txn_date,
      t.amount,
      t.description,
      t.merchant_name
    FROM banksync.regent_bank_to_cake_supabase_banksync t
    WHERE t.amount < 0
      AND NOT (t.description ~* 'CHECK\s*#\s*[0-9]+')
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_reconciliation_log r
        WHERE r.bank_bs_id = t.__bs_id
          AND r.status IN ('auto_applied', 'confirmed')
      )
    ORDER BY t.date ASC, t.__bs_id ASC
  LOOP
    v_scanned       := v_scanned + 1;
    v_found_keyword := FALSE;

    -- Payment method classification (unchanged from v2)
    v_pay_method := CASE
      WHEN v_txn.description ~* '^(DBT\s*CRD|DEBIT\s*CARD)'                          THEN 'card'
      WHEN v_txn.description ~* '(ACH|ELECTRONIC|UTIL_PMNT|UTIL PAYMT|PAYMENT|BILL PAY)' THEN 'ach'
      WHEN v_txn.description ~* '^(WIRE|FEDWIRE)'                                     THEN 'wire'
      WHEN v_txn.description ~* '^TRANSFER'                                            THEN 'transfer'
      ELSE 'other'
    END;

    -- ----------------------------------------------------------
    -- PHASE 1: keyword-matched vendors (confident proposals)
    -- Only considers vendors with a non-empty bank_keywords value.
    -- Keyword check is done in PL/pgSQL after fetching the row so
    -- that comma-split / LIKE matching is easier.  Bills whose vendor
    -- has keywords but NONE of them match this txn are silently skipped
    -- (CONTINUE) and do NOT set v_found_keyword.
    -- ----------------------------------------------------------
    FOR v_bill IN
      SELECT
        b.id          AS bill_id,
        b.amount      AS bill_amount,
        b.status      AS bill_status,
        b.period_month,
        b.due_date,
        v.bank_keywords
      FROM public.finance_bills b
      JOIN public.finance_vendors v ON v.id = b.vendor_id
      WHERE ABS(ABS(v_txn.amount) - b.amount) <= 0.01
        AND b.status IN ('unpaid', 'partial', 'scheduled', 'paid')
        AND ABS(b.due_date - v_txn.txn_date) <= 45
        AND v.bank_keywords IS NOT NULL
        AND TRIM(v.bank_keywords) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.finance_reconciliation_log r2
          WHERE r2.bank_bs_id = v_txn.bs_id AND r2.bill_id = b.id
        )
      ORDER BY ABS(b.due_date - v_txn.txn_date) ASC, b.period_month DESC
    LOOP
      -- Test each comma-separated keyword against description and merchant_name
      v_kw_matched := FALSE;
      v_keywords   := string_to_array(v_bill.bank_keywords, ',');
      FOREACH v_keyword IN ARRAY v_keywords LOOP
        IF LOWER(v_txn.description) LIKE '%' || LOWER(TRIM(v_keyword)) || '%'
           OR (v_txn.merchant_name IS NOT NULL
               AND LOWER(v_txn.merchant_name) LIKE '%' || LOWER(TRIM(v_keyword)) || '%')
        THEN
          v_kw_matched := TRUE;
          EXIT;
        END IF;
      END LOOP;

      -- Vendor has keywords but none matched this transaction — skip entirely.
      -- Do NOT set v_found_keyword; Phase 2 may still run.
      IF NOT v_kw_matched THEN
        CONTINUE;
      END IF;

      -- At least one keyword matched — insert a confident proposal.
      v_match_type := CASE WHEN v_bill.bill_status = 'paid'
                           THEN 'already_paid_non_check'
                           ELSE 'card_amount_vendor'
                      END;

      INSERT INTO public.finance_reconciliation_log
        (bank_bs_id, bill_id, match_type, bank_amount, bill_amount,
         bank_date, bank_description, status, suggested_payment_method)
      VALUES
        (v_txn.bs_id, v_bill.bill_id, v_match_type, v_txn.amount, v_bill.bill_amount,
         v_txn.txn_date, v_txn.description, 'pending_review', v_pay_method)
      ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;

      v_proposed      := v_proposed + 1;
      v_found_keyword := TRUE;   -- suppress Phase 2 for this transaction
    END LOOP;

    -- ----------------------------------------------------------
    -- PHASE 2: amount-only fallback
    -- SKIPPED entirely when Phase 1 found at least one keyword match.
    -- Only considers vendors WITHOUT any bank_keywords (truly un-mapped).
    -- Directional date window: bill due within 45 days BEFORE the charge
    -- or at most 5 days AFTER — never weeks into the future.
    -- ----------------------------------------------------------
    IF NOT v_found_keyword THEN
      FOR v_bill IN
        SELECT
          b.id          AS bill_id,
          b.amount      AS bill_amount,
          b.status      AS bill_status,
          b.period_month,
          b.due_date
        FROM public.finance_bills b
        JOIN public.finance_vendors v ON v.id = b.vendor_id
        WHERE ABS(ABS(v_txn.amount) - b.amount) <= 0.01
          AND b.status IN ('unpaid', 'partial', 'scheduled', 'paid')
          AND (v.bank_keywords IS NULL OR TRIM(v.bank_keywords) = '')
          AND b.due_date BETWEEN (v_txn.txn_date - INTERVAL '45 days')
                             AND (v_txn.txn_date + INTERVAL '5 days')
          AND NOT EXISTS (
            SELECT 1 FROM public.finance_reconciliation_log r2
            WHERE r2.bank_bs_id = v_txn.bs_id AND r2.bill_id = b.id
          )
        ORDER BY ABS(b.due_date - v_txn.txn_date) ASC, b.period_month DESC
      LOOP
        INSERT INTO public.finance_reconciliation_log
          (bank_bs_id, bill_id, match_type, bank_amount, bill_amount,
           bank_date, bank_description, status, suggested_payment_method)
        VALUES
          (v_txn.bs_id, v_bill.bill_id, 'amount_only', v_txn.amount, v_bill.bill_amount,
           v_txn.txn_date, v_txn.description, 'pending_review', v_pay_method)
        ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;

        v_proposed := v_proposed + 1;
      END LOOP;
    END IF;

  END LOOP;

  RETURN QUERY SELECT v_scanned, v_proposed, v_skipped;
END;
$$;

-- Revoke from all roles; grant only to service_role (same as v1/v2).
REVOKE ALL ON FUNCTION public.reconcile_non_check_debits() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reconcile_non_check_debits() TO service_role;

COMMENT ON FUNCTION public.reconcile_non_check_debits() IS
  'v3 (2026-07-01): keyword-gated two-phase non-check reconciler. '
  'Phase 1: keyword-matched vendor bills (confident; card_amount_vendor / already_paid_non_check). '
  'Phase 2: amount-only fallback against un-keyworded vendors only, '
  'with directional date window (due_date <= txn_date + 5 days). '
  'Phase 2 is suppressed entirely when Phase 1 found at least one keyword match. '
  'Vendors with keywords that do NOT match the bank description are excluded from both phases. '
  'Callable by service_role only. Never auto-applies — all proposals go to pending_review.';
