-- Payment Terms for orders — Phase 1. Stokely applies via mcp__cake-db__apply_migration.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_terms BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terms_payment_date DATE,
  ADD COLUMN IF NOT EXISTS terms_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.payment_terms IS 'TRUE = sold on terms; revenue+commission deferred until terms_paid_at set.';
COMMENT ON COLUMN public.orders.terms_payment_date IS 'Expected payment date (required when payment_terms=TRUE; editable).';
COMMENT ON COLUMN public.orders.terms_paid_at IS 'Actual payment receipt; NULL until received. Set only via markTermsOrderPaid.';

CREATE INDEX IF NOT EXISTS idx_orders_terms_unrecognized
  ON public.orders (terms_payment_date)
  WHERE payment_terms = TRUE AND terms_paid_at IS NULL;

-- Terms-aware commission trigger function (replaces existing body).
CREATE OR REPLACE FUNCTION public.create_commission_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_line_item RECORD; v_rate DECIMAL(5,2);
  v_total_commission DECIMAL(10,2) := 0; v_avg_rate DECIMAL(5,2);
BEGIN
  -- PATH A: non-terms order → delivered (unchanged behavior for all existing orders)
  IF NEW.status = 'delivered'
     AND (OLD.status IS NULL OR OLD.status != 'delivered')
     AND (NEW.payment_terms = FALSE OR NEW.payment_terms IS NULL)
  THEN
    IF NEW.agent_id IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.commissions WHERE order_id = NEW.id) THEN RETURN NEW; END IF;
    FOR v_line_item IN
      SELECT oi.*, s.product_type_id FROM public.order_items oi
      LEFT JOIN public.skus s ON oi.sku_id = s.id WHERE oi.order_id = NEW.id
    LOOP
      v_rate := public.get_commission_rate(NEW.agent_id, v_line_item.sku_id, v_line_item.product_type_id,
                                           v_line_item.unit_price, NEW.order_date::DATE);
      v_total_commission := v_total_commission + ROUND(v_line_item.line_total * (v_rate / 100), 2);
    END LOOP;
    v_avg_rate := CASE WHEN NEW.total_price > 0 THEN ROUND((v_total_commission/NEW.total_price)*100,2) ELSE 0 END;
    INSERT INTO public.commissions (order_id, salesperson_id, order_date, order_total, commission_amount, rate_applied, status)
    VALUES (NEW.id, NEW.agent_id, NEW.order_date::DATE, NEW.total_price, v_total_commission, v_avg_rate, 'pending');

  -- PATH B: terms order → terms_paid_at goes NULL→value (and order delivered)
  ELSIF NEW.payment_terms = TRUE
        AND NEW.terms_paid_at IS NOT NULL
        AND (OLD.terms_paid_at IS NULL OR OLD.terms_paid_at IS DISTINCT FROM NEW.terms_paid_at)
  THEN
    IF NEW.agent_id IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.commissions WHERE order_id = NEW.id) THEN RETURN NEW; END IF;
    IF NEW.status != 'delivered' THEN RETURN NEW; END IF;
    FOR v_line_item IN
      SELECT oi.*, s.product_type_id FROM public.order_items oi
      LEFT JOIN public.skus s ON oi.sku_id = s.id WHERE oi.order_id = NEW.id
    LOOP
      v_rate := public.get_commission_rate(NEW.agent_id, v_line_item.sku_id, v_line_item.product_type_id,
                                           v_line_item.unit_price, NEW.order_date::DATE);
      v_total_commission := v_total_commission + ROUND(v_line_item.line_total * (v_rate / 100), 2);
    END LOOP;
    v_avg_rate := CASE WHEN NEW.total_price > 0 THEN ROUND((v_total_commission/NEW.total_price)*100,2) ELSE 0 END;
    INSERT INTO public.commissions (order_id, salesperson_id, order_date, order_total, commission_amount, rate_applied, status)
    VALUES (NEW.id, NEW.agent_id, NEW.terms_paid_at::DATE, NEW.total_price, v_total_commission, v_avg_rate, 'pending');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS order_commission_trigger ON public.orders;
CREATE TRIGGER order_commission_trigger AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_commission_on_delivery();
