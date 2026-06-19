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
