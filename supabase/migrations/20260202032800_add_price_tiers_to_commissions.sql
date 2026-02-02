-- Add price tier support to commission rates

-- Add min_unit_price column for price-based tiers
ALTER TABLE public.commission_rates 
ADD COLUMN IF NOT EXISTS min_unit_price DECIMAL(10,2) DEFAULT NULL;

-- Add index for price tier lookups
CREATE INDEX IF NOT EXISTS idx_commission_rates_min_price 
ON public.commission_rates(product_type_id, min_unit_price DESC NULLS LAST);

COMMENT ON COLUMN public.commission_rates.min_unit_price IS 
'Minimum unit price for this tier. NULL means this is the floor/default rate for this product.';

-- Update the get_commission_rate function to handle price tiers
CREATE OR REPLACE FUNCTION public.get_commission_rate(
  p_salesperson_id UUID,
  p_sku_id UUID DEFAULT NULL,
  p_product_type_id UUID DEFAULT NULL,
  p_unit_price DECIMAL DEFAULT NULL,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_rate DECIMAL(5,2);
  v_product_type_id UUID;
BEGIN
  -- If SKU provided but not product_type, look up the product_type
  IF p_sku_id IS NOT NULL AND p_product_type_id IS NULL THEN
    SELECT product_type_id INTO v_product_type_id FROM public.skus WHERE id = p_sku_id;
  ELSE
    v_product_type_id := p_product_type_id;
  END IF;

  -- 1. Try SKU-specific rate for this salesperson with price tier
  IF p_sku_id IS NOT NULL THEN
    SELECT rate_percent INTO v_rate
    FROM public.commission_rates
    WHERE salesperson_id = p_salesperson_id
      AND sku_id = p_sku_id
      AND (min_unit_price IS NULL OR min_unit_price <= COALESCE(p_unit_price, 0))
      AND effective_from <= p_date
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY min_unit_price DESC NULLS LAST
    LIMIT 1;
    
    IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  END IF;
  
  -- 2. Try product type rate for this salesperson with price tier
  IF v_product_type_id IS NOT NULL THEN
    SELECT rate_percent INTO v_rate
    FROM public.commission_rates
    WHERE salesperson_id = p_salesperson_id
      AND product_type_id = v_product_type_id
      AND sku_id IS NULL
      AND (min_unit_price IS NULL OR min_unit_price <= COALESCE(p_unit_price, 0))
      AND effective_from <= p_date
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY min_unit_price DESC NULLS LAST
    LIMIT 1;
    
    IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  END IF;
  
  -- 3. Try salesperson default rate (no product/sku/price specified)
  SELECT rate_percent INTO v_rate
  FROM public.commission_rates
  WHERE salesperson_id = p_salesperson_id
    AND product_type_id IS NULL
    AND sku_id IS NULL
    AND min_unit_price IS NULL
    AND effective_from <= p_date
    AND (effective_to IS NULL OR effective_to >= p_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  
  -- 4. Try default SKU-specific rate (no salesperson) with price tier
  IF p_sku_id IS NOT NULL THEN
    SELECT rate_percent INTO v_rate
    FROM public.commission_rates
    WHERE salesperson_id IS NULL
      AND sku_id = p_sku_id
      AND (min_unit_price IS NULL OR min_unit_price <= COALESCE(p_unit_price, 0))
      AND effective_from <= p_date
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY min_unit_price DESC NULLS LAST
    LIMIT 1;
    
    IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  END IF;
  
  -- 5. Try default product type rate (no salesperson) with price tier
  IF v_product_type_id IS NOT NULL THEN
    SELECT rate_percent INTO v_rate
    FROM public.commission_rates
    WHERE salesperson_id IS NULL
      AND product_type_id = v_product_type_id
      AND sku_id IS NULL
      AND (min_unit_price IS NULL OR min_unit_price <= COALESCE(p_unit_price, 0))
      AND effective_from <= p_date
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY min_unit_price DESC NULLS LAST
    LIMIT 1;
    
    IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  END IF;
  
  -- 6. Fall back to global default (salesperson_id IS NULL, no product/price)
  SELECT rate_percent INTO v_rate
  FROM public.commission_rates
  WHERE salesperson_id IS NULL
    AND product_type_id IS NULL
    AND sku_id IS NULL
    AND min_unit_price IS NULL
    AND effective_from <= p_date
    AND (effective_to IS NULL OR effective_to >= p_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  RETURN COALESCE(v_rate, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Update the commission calculation to work per line item
CREATE OR REPLACE FUNCTION public.create_commission_on_delivery()
RETURNS TRIGGER AS $$
DECLARE
  v_line_item RECORD;
  v_rate DECIMAL(5,2);
  v_total_commission DECIMAL(10,2) := 0;
  v_avg_rate DECIMAL(5,2);
  v_sku_product_type UUID;
BEGIN
  -- Only trigger when status changes TO 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    -- Skip if no agent assigned
    IF NEW.agent_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Check if commission already exists
    IF EXISTS (SELECT 1 FROM public.commissions WHERE order_id = NEW.id) THEN
      RETURN NEW;
    END IF;
    
    -- Calculate commission per line item
    FOR v_line_item IN 
      SELECT oi.*, s.product_type_id 
      FROM public.order_items oi
      LEFT JOIN public.skus s ON oi.sku_id = s.id
      WHERE oi.order_id = NEW.id
    LOOP
      -- Get rate for this line item based on unit price
      v_rate := public.get_commission_rate(
        NEW.agent_id, 
        v_line_item.sku_id, 
        v_line_item.product_type_id,
        v_line_item.unit_price,
        NEW.order_date::DATE
      );
      
      -- Add to total commission (rate * line total)
      v_total_commission := v_total_commission + ROUND(v_line_item.line_total * (v_rate / 100), 2);
    END LOOP;
    
    -- Calculate average rate for display (weighted by line total)
    IF NEW.total_price > 0 THEN
      v_avg_rate := ROUND((v_total_commission / NEW.total_price) * 100, 2);
    ELSE
      v_avg_rate := 0;
    END IF;
    
    -- Insert commission record
    INSERT INTO public.commissions (
      order_id,
      salesperson_id,
      order_date,
      order_total,
      commission_amount,
      rate_applied,
      status
    ) VALUES (
      NEW.id,
      NEW.agent_id,
      NEW.order_date::DATE,
      NEW.total_price,
      v_total_commission,
      v_avg_rate,  -- This is now the effective/average rate
      'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (in case function signature changed)
DROP TRIGGER IF EXISTS order_commission_trigger ON public.orders;
CREATE TRIGGER order_commission_trigger
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.create_commission_on_delivery();
