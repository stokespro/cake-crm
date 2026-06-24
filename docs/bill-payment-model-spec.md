# Bill Payment Model Rework — Cipher Build Spec

> Design by Nova, reviewed + amended by Stokely. COO-approved.
> **Deploy gate: do NOT git commit/push or run vercel. Leave uncommitted for review.**
> **Migration: Cipher EMITS the .sql file only. Stokely applies via MCP.**

## Locked decisions
1. **Status set**: finance_bills.status → `{unpaid, partial, paid, void}` (drop `scheduled`; `void` already in the DB constraint). Migrate any `scheduled` → `unpaid`.
2. **Payment method** (on Paid/Partial): `card` (Debit Card) / `ach` (ACH) / `check` (Check) / `cash` (Cash). If `check` → check number (payment_ref) REQUIRED.
3. **Partial**: amount_paid + method (+check# if check); balance owed = amount − amount_paid; paid_date always set.
4. **Void**: excluded from ALL financials (summary, bills-this-month, outstanding, cash-flow, reconciliation). Record only.
5. **Two-path fix (STOKELY/Nova decision = Option A)**: the Edit form's status dropdown offers ONLY `unpaid` + `void`. Recording a payment (method/check#/amount) happens ONLY via the "Mark Paid" action. `updateBill` must REJECT status=paid/partial.
6. **Cash-flow clearance = Option B, STOKELY-REFINED**: a paid bill is RESERVED in the cash projection **ONLY if `payment_method='check' AND NOT bank_confirmed`** (uncleared check = real float). Everything else — cash, card, ACH, or any bank-confirmed payment — is **cleared** (dropped from the projection the moment it's marked paid). This is the ONLY change from Nova's draft rule (Nova reserved all non-cash; we reserve only uncleared checks, so card/ACH that already hit the bank aren't double-counted). `bank_confirmed` = the bill has a `confirmed` or `auto_applied` row in finance_reconciliation_log.
7. **Reconciliation**: `reconcile_cleared_checks()` reworked (no `scheduled` target) — see migration. Cleared check → paid bill = already_paid link (which flips it bank_confirmed → cleared); unpaid/partial bill + exact amount → auto-pay (method='check'); mismatch → review. Void excluded.

## Verified facts (Nova)
- `void` is ALREADY in the status CHECK; only `scheduled` needs removing. `payment_method` is free-text (no constraint). Existing payment_method values (confirmed by Stokely): only `card` (39), `check` (32), null (4) — all already valid, migration value-map is a no-op.
- Two current paths to paid: Edit status dropdown (`updateBill`) + "Mark Paid" sheet (`markBillPaid`). `markBillPaid` is also called by `confirmReconciliationMatch`.
- Cash-flow `buildCashFlow` bill loop ~lib/finance/cash-flow.ts:94-125; `BillInput` ~43-51. getMonthSummary bills query ~actions/finance.ts:679-686, billInputs ~793-801 (does NOT currently fetch payment_method).

---

## WAVE 0 — migration (Cipher emits; Stokely applies via MCP)
Create `supabase/migrations/20260624000000_bill_payment_model.sql`:

```sql
-- Bill payment model rework. Stokely applies via mcp__cake-db__apply_migration.

UPDATE public.finance_bills SET status='unpaid', updated_at=now() WHERE status='scheduled';

ALTER TABLE public.finance_bills DROP CONSTRAINT IF EXISTS finance_bills_status_check;
ALTER TABLE public.finance_bills ADD CONSTRAINT finance_bills_status_check
  CHECK (status IN ('unpaid','partial','paid','void'));

ALTER TABLE public.finance_bills DROP CONSTRAINT IF EXISTS finance_bills_payment_method_check;
ALTER TABLE public.finance_bills ADD CONSTRAINT finance_bills_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('card','ach','check','cash'));

UPDATE public.finance_bills SET payment_method='card'
  WHERE payment_method IN ('credit_card','debit_card','debit card');
UPDATE public.finance_bills SET payment_method=NULL
  WHERE payment_method IS NOT NULL AND payment_method NOT IN ('card','ach','check','cash');

-- Reworked check reconciler (no 'scheduled'; match by check# regardless of status)
CREATE OR REPLACE FUNCTION public.reconcile_cleared_checks()
RETURNS TABLE (checked_count INTEGER, auto_applied_count INTEGER, mismatch_count INTEGER,
               already_paid_count INTEGER, no_bill_match INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_txn RECORD; v_bill RECORD; v_check_num TEXT; v_tolerance NUMERIC := 0.01;
  v_checked INTEGER := 0; v_auto_applied INTEGER := 0; v_mismatch INTEGER := 0;
  v_already_paid INTEGER := 0; v_no_match INTEGER := 0;
BEGIN
  FOR v_txn IN
    SELECT t.__bs_id AS bs_id, t.date AS txn_date, t.amount, t.description
    FROM banksync.regent_bank_to_cake_supabase_banksync t
    WHERE t.amount < 0 AND t.description ~* 'CHECK\s*#\s*[0-9]+'
    ORDER BY t.date ASC, t.__bs_id ASC
  LOOP
    v_checked := v_checked + 1;
    v_check_num := (regexp_match(v_txn.description, 'CHECK\s*#\s*0*([0-9]+)', 'i'))[1];
    IF v_check_num IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.finance_reconciliation_log
               WHERE bank_bs_id = v_txn.bs_id AND status='auto_applied') THEN CONTINUE; END IF;

    SELECT * INTO v_bill FROM public.finance_bills
    WHERE LTRIM(payment_ref,'0') = v_check_num AND status != 'void'
    ORDER BY CASE status WHEN 'unpaid' THEN 1 WHEN 'partial' THEN 2 WHEN 'paid' THEN 3 ELSE 4 END, due_date ASC
    LIMIT 1;
    IF NOT FOUND THEN v_no_match := v_no_match + 1; CONTINUE; END IF;

    IF v_bill.status = 'paid' THEN
      INSERT INTO public.finance_reconciliation_log
        (bank_bs_id, bill_id, match_type, bank_amount, bill_amount, bank_date, bank_description, status)
      VALUES (v_txn.bs_id, v_bill.id, 'already_paid', v_txn.amount, v_bill.amount, v_txn.txn_date, v_txn.description, 'pending_review')
      ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;
      v_already_paid := v_already_paid + 1; CONTINUE;
    END IF;

    IF ABS(ABS(v_txn.amount) - v_bill.amount) <= v_tolerance THEN
      UPDATE public.finance_bills SET status='paid', paid_date=v_txn.txn_date,
        amount_paid=ABS(v_txn.amount), payment_method='check', updated_at=now() WHERE id=v_bill.id;
      INSERT INTO public.finance_reconciliation_log
        (bank_bs_id, bill_id, match_type, bank_amount, bill_amount, bank_date, bank_description, status, applied_at)
      VALUES (v_txn.bs_id, v_bill.id, 'check_exact', v_txn.amount, v_bill.amount, v_txn.txn_date, v_txn.description, 'auto_applied', now())
      ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;
      v_auto_applied := v_auto_applied + 1;
    ELSE
      INSERT INTO public.finance_reconciliation_log
        (bank_bs_id, bill_id, match_type, bank_amount, bill_amount, bank_date, bank_description, status)
      VALUES (v_txn.bs_id, v_bill.id, 'check_amount_mismatch', v_txn.amount, v_bill.amount, v_txn.txn_date, v_txn.description, 'pending_review')
      ON CONFLICT (bank_bs_id, bill_id) DO NOTHING;
      v_mismatch := v_mismatch + 1;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_checked, v_auto_applied, v_mismatch, v_already_paid, v_no_match;
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_cleared_checks() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_cleared_checks() TO service_role;
```
**Verify after apply:** status constraint = {unpaid,partial,paid,void}; payment_method constraint present; 0 `scheduled` rows; `has_function_privilege('anon',...)` false.

---

## WAVE 2 — types (after migration)
- `actions/finance.ts`: `BillStatus = 'unpaid'|'paid'|'partial'|'void'` (drop scheduled).
- `lib/finance/cash-flow.ts` `BillInput`: add `payment_method: string | null` and `bank_confirmed: boolean`.
- Remove any remaining `'scheduled'` literal usages. Verify type-check.

## WAVE 3 — server actions (`actions/finance.ts`, one pass)
- **markBillPaid**: validate `payment_method ∈ {card,ach,check,cash}`; if `check` require non-empty `payment_ref`; ALWAYS set paid_date (incl. partial).
- **updateBill**: reject `status IN ('paid','partial')` → `{ success:false, error:'Use Mark Paid to record payments. Edit only sets unpaid or void.' }`.
- **getMonthSummary**: add a (non-fatal) query for bill_ids with a `confirmed`/`auto_applied` reconciliation_log row → build `confirmedBillIds` Set; set `bank_confirmed: confirmedBillIds.has(b.id)` and `payment_method: b.payment_method ?? null` on each billInput (add payment_method to the bills `.select`).

## WAVE 4 — cash-flow engine (`lib/finance/cash-flow.ts`, one pass) — THE REFINED RULE
In the bill loop, after the existing `if (bill.status==='void') continue`:
```ts
if (bill.status === 'paid') {
  // STOKELY-REFINED Option B: reserve ONLY uncleared checks.
  const isUnclearedCheck = bill.payment_method === 'check' && !bill.bank_confirmed
  if (!isUnclearedCheck) continue   // cash/card/ach/cleared-check → already out of the bank, drop from projection
  // else: uncleared check → stays RESERVED (full amount) as a future outflow
}
```
Partial bills: unchanged — always reserve remaining balance (amount − amount_paid) regardless of method.

## WAVE 5 — bills UI (`app/dashboard/finance/bills/page.tsx`, one pass)
- `PAYMENT_METHODS` → `[{card,'Debit Card'},{ach,'ACH'},{check,'Check'},{cash,'Cash'}]`.
- `BILL_STATUSES` (edit form) → only `[{unpaid,'Unpaid'},{void,'Void'}]`.
- Status FILTER dropdown: options unpaid/partial/paid/void (remove `scheduled`).
- `BillStatusBadge`: remove `scheduled` case (keep void).
- Mark Paid sheet: payment_method REQUIRED (client validate); when method=`check`, the ref field label→"Check Number *" and required; block submit if check w/o number, or no method.
- Summary "Total Bills" card: exclude void (`filter(b=>b.status!=='void')`).

## WAVE 6 — finance overview (`app/dashboard/finance/page.tsx`)
Confirm no void-bill leakage in any card; cash-flow already skips void. Add `filter(status!=='void')` only if a card shows void bills.

## Gate
After all: `npm run type-check` + `npm run build` pass. STOP — no commit/push/deploy. Report files changed, deviations, and the acceptance-test result.

## Acceptance test (after migration + build)
- Edit a bill → status dropdown shows only Unpaid/Void.
- Mark Paid → method required; pick Check → check# required; save → bill paid, method=check.
- Cash-flow: a check-paid bill (no recon) stays in the projection (reserved); a card/cash-paid bill drops out immediately. Confirm the check's bank clearance (or it auto-applies) → it drops out.
- Void a bill → it leaves all totals.
