# Bank Reconciliation Phase 2 — Non-Check Matching Engine (Cipher Build Spec)

> Source of truth for this build. Design by Nova, reviewed + amended by Stokely. COO-approved.
> **Deploy gate: do NOT git commit/push or run vercel. Leave changes uncommitted for review.**
> **Migration: Cipher EMITS the .sql file only. Stokely applies it via MCP (Cipher has no MCP tools).**

## Locked decisions (COO)
1. **Checks** stay fully automatic (exact check# + amount within $0.01 → auto-paid). No change to `reconcile_cleared_checks()`.
2. **Card/ACH / any non-check debit** → never auto-pair. Discover candidates, drop into the review queue, human confirms.
3. **Flag amount-only matches even with no keyword** (COO chose the aggressive option). So `amount_only` is an ACTIVE tier, not suppressed.
4. **Pre-seeded keywords**: vendor `bank_keywords` are mined + COO-approved separately; seeded by Stokely. The engine works without them (amount_only) but keywords raise confidence.
5. Daily cron runs both reconcilers.

## Stokely's amendments to Nova's draft (MUST be honored)
- **A. Security**: every new function must `REVOKE ALL ON FUNCTION … FROM anon, authenticated, PUBLIC` then `GRANT EXECUTE … TO service_role`. (Revoking only PUBLIC is insufficient — Supabase grants anon/authenticated directly; this was a real hole we already had to fix once.)
- **B. amount_only is active**: for each non-check debit, propose EVERY amount-matching bill within a date window. Keyword match → `card_amount_vendor`; no keyword match → `amount_only`. Both `pending_review`.
- **C. Date-window bound** on all non-check proposals to prevent flooding: only consider bills where `ABS(b.due_date - t.date) <= 45` days. (A round-number charge must not propose against same-amount bills from months away.)
- **D. Confirm dismisses conflicts on BOTH sides**: confirming a (txn,bill) pair dismisses other `pending_review` rows for the same `bank_bs_id` AND the same `bill_id` (one txn ↔ one bill).
- **E. Backfill `amount_paid`** too (not just date/method) — the anchor ROYPACK bill has amount_paid=$0.00.
- **F. Confirm action keys off the bill's CURRENT status**, not the stored match_type: if the bill is already `paid` → backfill missing payment fields only; else → mark it paid with the bank amount/date/method. (Robust across card_amount_vendor / amount_only / already_paid_non_check.)

---

## TASK 1 — Migration file (Cipher writes; Stokely applies via MCP)

Create `supabase/migrations/20260619120000_recon_phase2.sql`:

```sql
-- Phase 2 reconciliation: non-check matching engine.
-- Stokely applies via mcp__cake-db__apply_migration after review.

-- 1) Vendor bank-description keywords (comma-separated, OR logic, case-insensitive)
ALTER TABLE public.finance_vendors
  ADD COLUMN IF NOT EXISTS bank_keywords TEXT;
COMMENT ON COLUMN public.finance_vendors.bank_keywords IS
  'Comma-separated substrings matched (case-insensitive) in bank tx descriptions, e.g. ''ROYPACK'' or ''KABOTA,KUBOTA''. NULL = not configured.';

-- 2) Widen match_type + status checks; add suggested_payment_method
ALTER TABLE public.finance_reconciliation_log
  DROP CONSTRAINT IF EXISTS finance_reconciliation_log_match_type_check;
ALTER TABLE public.finance_reconciliation_log
  ADD CONSTRAINT finance_reconciliation_log_match_type_check
    CHECK (match_type IN (
      'check_exact','check_amount_mismatch','fuzzy_suggested','untracked','already_paid',
      'card_amount_vendor','amount_only','already_paid_non_check'));
ALTER TABLE public.finance_reconciliation_log
  ADD COLUMN IF NOT EXISTS suggested_payment_method TEXT;

-- 3) Non-check reconciler — proposes only, never auto-applies
CREATE OR REPLACE FUNCTION public.reconcile_non_check_debits()
RETURNS TABLE (scanned_count INTEGER, proposed_count INTEGER, skipped_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_txn RECORD; v_bill RECORD; v_keyword TEXT; v_keywords TEXT[];
  v_pay_method TEXT; v_kw_matched BOOLEAN; v_match_type TEXT;
  v_scanned INTEGER := 0; v_proposed INTEGER := 0; v_skipped INTEGER := 0;
BEGIN
  FOR v_txn IN
    SELECT t.__bs_id AS bs_id, t.date AS txn_date, t.amount, t.description, t.merchant_name
    FROM banksync.regent_bank_to_cake_supabase_banksync t
    WHERE t.amount < 0
      AND NOT (t.description ~* 'CHECK\s*#\s*[0-9]+')
      AND NOT EXISTS (SELECT 1 FROM public.finance_reconciliation_log r
                      WHERE r.bank_bs_id = t.__bs_id AND r.status IN ('auto_applied','confirmed'))
    ORDER BY t.date ASC, t.__bs_id ASC
  LOOP
    v_scanned := v_scanned + 1;
    v_pay_method := CASE
      WHEN v_txn.description ~* '^(DBT\s*CRD|DEBIT\s*CARD)' THEN 'card'
      WHEN v_txn.description ~* '(ACH|ELECTRONIC|UTIL_PMNT|UTIL PAYMT|PAYMENT|BILL PAY)' THEN 'ach'
      WHEN v_txn.description ~* '^(WIRE|FEDWIRE)' THEN 'wire'
      WHEN v_txn.description ~* '^TRANSFER' THEN 'transfer'
      ELSE 'other' END;

    FOR v_bill IN
      SELECT b.id AS bill_id, b.amount AS bill_amount, b.status AS bill_status,
             v.bank_keywords AS bank_keywords
      FROM public.finance_bills b
      JOIN public.finance_vendors v ON v.id = b.vendor_id
      WHERE ABS(ABS(v_txn.amount) - b.amount) <= 0.01
        AND b.status IN ('unpaid','partial','scheduled','paid')
        AND ABS(b.due_date - v_txn.txn_date) <= 45            -- amendment C: date window
        AND NOT EXISTS (SELECT 1 FROM public.finance_reconciliation_log r2
                        WHERE r2.bank_bs_id = v_txn.bs_id AND r2.bill_id = b.id)
      ORDER BY ABS(b.due_date - v_txn.txn_date) ASC, b.period_month DESC
    LOOP
      -- keyword match?
      v_kw_matched := FALSE;
      IF v_bill.bank_keywords IS NOT NULL THEN
        v_keywords := string_to_array(v_bill.bank_keywords, ',');
        FOREACH v_keyword IN ARRAY v_keywords LOOP
          IF LOWER(v_txn.description) LIKE '%' || LOWER(TRIM(v_keyword)) || '%'
             OR (v_txn.merchant_name IS NOT NULL
                 AND LOWER(v_txn.merchant_name) LIKE '%' || LOWER(TRIM(v_keyword)) || '%') THEN
            v_kw_matched := TRUE; EXIT;
          END IF;
        END LOOP;
      END IF;

      -- amendment B: keyword → high-confidence; else amount_only (flag anyway)
      IF v_kw_matched THEN
        v_match_type := CASE WHEN v_bill.bill_status = 'paid'
                             THEN 'already_paid_non_check' ELSE 'card_amount_vendor' END;
      ELSE
        v_match_type := 'amount_only';
      END IF;

      INSERT INTO public.finance_reconciliation_log
        (bank_bs_id, bill_id, match_type, bank_amount, bill_amount, bank_date,
         bank_description, status, suggested_payment_method)
      VALUES (v_txn.bs_id, v_bill.bill_id, v_match_type, v_txn.amount, v_bill.bill_amount,
              v_txn.txn_date, v_txn.description, 'pending_review', v_pay_method)
      ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;
      v_proposed := v_proposed + 1;
    END LOOP;
  END LOOP;
  RETURN QUERY SELECT v_scanned, v_proposed, v_skipped;
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_non_check_debits() FROM anon, authenticated, PUBLIC;  -- amendment A
GRANT EXECUTE ON FUNCTION public.reconcile_non_check_debits() TO service_role;

-- 4) Orchestrator: checks first (may flip scheduled→paid), then non-check
CREATE OR REPLACE FUNCTION public.run_daily_reconciliation()
RETURNS TABLE (check_auto_applied INTEGER, check_mismatch INTEGER, noncheck_proposed INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chk RECORD; v_nc RECORD;
BEGIN
  SELECT * INTO v_chk FROM public.reconcile_cleared_checks() LIMIT 1;
  SELECT * INTO v_nc  FROM public.reconcile_non_check_debits() LIMIT 1;
  RETURN QUERY SELECT v_chk.auto_applied_count, v_chk.mismatch_count, v_nc.proposed_count;
END; $$;
REVOKE ALL ON FUNCTION public.run_daily_reconciliation() FROM anon, authenticated, PUBLIC;  -- amendment A
GRANT EXECUTE ON FUNCTION public.run_daily_reconciliation() TO service_role;

-- 5) Daily cron, 5 min after the snapshot cron (0 13 * * *)
SELECT cron.schedule('reconcile-daily', '5 13 * * *', 'SELECT public.run_daily_reconciliation()');
```

**Verify after Stokely applies:** `bank_keywords` column exists; `SELECT public.run_daily_reconciliation();` runs; `SELECT jobname FROM cron.job` shows `reconcile-daily`; `has_function_privilege('anon','public.reconcile_non_check_debits()','EXECUTE')` = false.

---

## TASK 2 — Vendor type + actions (`actions/finance.ts`)
- Add `bank_keywords: string | null` to the `Vendor` interface.
- Add `bank_keywords` to `updateVendor`'s input type + update payload. `createVendor` unchanged (defaults NULL).

## TASK 3 — Vendors edit sheet (`app/dashboard/finance/vendors/page.tsx`)
- Add `bank_keywords` to `VendorFormState`, `blankForm`, `openEdit` initializer, and the `updateVendor` submit call.
- Add an `Input` labeled **"Bank Description Keywords"**, placeholder `e.g. ROYPACK or KABOTA,KUBOTA (comma-separated)`, helper text "Substrings that identify this vendor in bank statements. Used to auto-propose bill matches."

## TASK 4 — New server actions + types (`app/dashboard/finance/_actions/bank.ts`)
- Add `card_amount_vendor`, `amount_only`, `already_paid_non_check` to `ReconMatchType`.
- Add `suggested_payment_method: string | null` to `ReconciliationLogRow`; add it to the `getReconciliationLog` select + row mapping.
- Add `runDailyReconciliation()` (calls rpc `run_daily_reconciliation`) and `runNonCheckReconciliation()` (calls rpc `reconcile_non_check_debits`) — both gated by `requireFinance()`, service client, return the single row.
- Add `getProposedTransactions()` — return the `pending_review` rows from `finance_reconciliation_log` joined to `finance_bills(name)` (so the UI can show "charge X → proposed bill Y"). **Do NOT** re-fetch from `get_bank_transactions` — the log rows already carry `bank_amount/bank_date/bank_description/bill_id/match_type/suggested_payment_method`.

## TASK 5 — `confirmReconciliationMatch` rewrite (`bank.ts`) — amendments D/E/F
Fetch the log row (incl. `suggested_payment_method`, `bill_id`, `bank_amount`, `bank_date`). Then:
```ts
const bankAmount = Math.abs(logRow.bank_amount ?? 0)
const bankDate   = logRow.bank_date ?? new Date().toISOString().substring(0,10)
const payMethod  = logRow.suggested_payment_method ?? 'other'

if (logRow.bill_id) {
  // read the bill's CURRENT status (amendment F)
  const { data: bill } = await supabase.from('finance_bills')
    .select('status, paid_date, amount_paid, payment_method').eq('id', logRow.bill_id).single()

  if (bill?.status === 'paid') {
    // backfill only what's missing (amendments E + F)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (!bill.paid_date) patch.paid_date = bankDate
    if (!bill.payment_method) patch.payment_method = payMethod
    if (!bill.amount_paid || Number(bill.amount_paid) === 0) patch.amount_paid = bankAmount
    await supabase.from('finance_bills').update(patch).eq('id', logRow.bill_id)
  } else {
    // mark paid from the bank tx
    await markBillPaid(logRow.bill_id, { amount_paid: bankAmount, paid_date: bankDate, payment_method: payMethod })
  }
}

// set this row confirmed
await supabase.from('finance_reconciliation_log')
  .update({ status: 'confirmed', applied_by: auth.session.userId, applied_at: new Date().toISOString() })
  .eq('id', logId)

// amendment D: dismiss conflicting pending rows on BOTH sides
await supabase.from('finance_reconciliation_log')
  .update({ status: 'dismissed', applied_at: new Date().toISOString() })
  .eq('status','pending_review').neq('id', logId)
  .or(`bank_bs_id.eq.${logRow.bank_bs_id},bill_id.eq.${logRow.bill_id}`)
```
Keep the existing `check_amount_mismatch` / `already_paid` (check) behavior intact if it's separate; the block above should also cover them via the status-based logic (a mismatch bill is not 'paid' → markBillPaid at bank amount). Confirm with `markBillPaid`'s real signature — adapt field names to match.

## TASK 6 — Reconciliation panel UI (`app/dashboard/finance/page.tsx`)
- Wire the existing "Reconcile Now" button to `runDailyReconciliation()`; toast both check + non-check counts.
- `ReconMatchBadge`: add `card_amount_vendor` ("Card/ACH match"), `amount_only` ("Amount only — verify"), `already_paid_non_check` ("Paid — link only"). Import any new lucide icon used.
- Show `suggested_payment_method` (card/ach/wire/transfer) in the pending-review row.
- For `already_paid_non_check`, the action button reads **"Link"** (not "Confirm") — label-only.

## TASK 7 — Untracked panel distinguishes proposed (`page.tsx` `UntrackedExpensesPanel`)
- Also call `getProposedTransactions()` (scoped to the same selected `month`).
- A charge that has a `pending_review` proposal renders muted with a badge **"Match proposed — see reconciliation"** and NO "Create Bill" button. Truly-untracked charges keep the "Create Bill" button.
- Keep the month scoping already in place.

---

## Waves
- **Wave 1:** Task 1 — Cipher writes the migration file, then STOPS and tells Stokely to apply it. (Tasks 2-7 need the new columns/functions live.)
- **Wave 2 (after migration applied):** Tasks 2, 3, 4 in parallel (distinct files).
- **Wave 3:** Task 5 (depends on 4), then Tasks 6+7 together (same file `page.tsx`).
- After all: `npm run type-check` + `npm run build` must pass. **STOP — no commit/push.** Report files changed, deviations, and the anchor-case verification result.

## Anchor-case acceptance test (run after build + keyword seeded)
With ROYPACK keyword `ROYPACK` seeded: run `run_daily_reconciliation()` → expect a `pending_review` `already_paid_non_check` row for bs_id 792 ↔ bill a465830f. Confirm it in the UI → bill a465830f gets `paid_date=2026-06-17`, `payment_method=card`, `amount_paid=876.00`; the charge leaves untracked.
