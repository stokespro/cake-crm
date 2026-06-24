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
