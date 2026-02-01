-- Add filter/performance columns to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS has_orders BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS first_order_date DATE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_order_date DATE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;

-- Indexes for filter performance
CREATE INDEX IF NOT EXISTS idx_customers_city ON public.customers(city);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_sales_id ON public.customers(assigned_sales_id);
CREATE INDEX IF NOT EXISTS idx_customers_has_orders ON public.customers(has_orders) WHERE has_orders = TRUE;
CREATE INDEX IF NOT EXISTS idx_customers_last_order_date ON public.customers(last_order_date);
CREATE INDEX IF NOT EXISTS idx_customers_first_order_date ON public.customers(first_order_date);
-- Enable pg_trgm extension for fuzzy text search (optional)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_customers_business_name_trgm ON public.customers USING gin(business_name gin_trgm_ops);

-- Indexes on orders for join performance
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON public.orders(order_date);

-- Function to update customer order stats
CREATE OR REPLACE FUNCTION public.update_customer_order_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_customer_id UUID;
BEGIN
  -- Determine which customer to update
  IF TG_OP = 'DELETE' THEN
    target_customer_id := OLD.customer_id;
  ELSE
    target_customer_id := NEW.customer_id;
  END IF;
  
  -- Update the customer's order statistics
  UPDATE public.customers SET
    has_orders = EXISTS(SELECT 1 FROM public.orders WHERE customer_id = target_customer_id),
    first_order_date = (SELECT MIN(order_date)::DATE FROM public.orders WHERE customer_id = target_customer_id),
    last_order_date = (SELECT MAX(order_date)::DATE FROM public.orders WHERE customer_id = target_customer_id),
    order_count = (SELECT COUNT(*) FROM public.orders WHERE customer_id = target_customer_id),
    updated_at = NOW()
  WHERE id = target_customer_id;
  
  -- Handle customer_id change (update old customer too)
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    UPDATE public.customers SET
      has_orders = EXISTS(SELECT 1 FROM public.orders WHERE customer_id = OLD.customer_id),
      first_order_date = (SELECT MIN(order_date)::DATE FROM public.orders WHERE customer_id = OLD.customer_id),
      last_order_date = (SELECT MAX(order_date)::DATE FROM public.orders WHERE customer_id = OLD.customer_id),
      order_count = (SELECT COUNT(*) FROM public.orders WHERE customer_id = OLD.customer_id),
      updated_at = NOW()
    WHERE id = OLD.customer_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to keep order stats current
DROP TRIGGER IF EXISTS orders_customer_stats_trigger ON public.orders;
CREATE TRIGGER orders_customer_stats_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_customer_order_stats();

-- Comments
COMMENT ON COLUMN public.customers.city IS 'Normalized city name extracted from address';
COMMENT ON COLUMN public.customers.has_orders IS 'Denormalized flag: TRUE if customer has any orders';
COMMENT ON COLUMN public.customers.first_order_date IS 'Denormalized: date of first order';
COMMENT ON COLUMN public.customers.last_order_date IS 'Denormalized: date of most recent order';
COMMENT ON COLUMN public.customers.order_count IS 'Denormalized: total number of orders';
