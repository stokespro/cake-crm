-- Commission System: rates and tracking tables
-- Note: profiles is a VIEW over users table, so FKs reference users

-- 1. Commission rates table (flexible configuration)
CREATE TABLE IF NOT EXISTS public.commission_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id UUID REFERENCES public.users(id) ON DELETE CASCADE,  -- NULL = global default
  product_type_id UUID REFERENCES public.product_types(id) ON DELETE CASCADE,  -- NULL = all products
  sku_id UUID REFERENCES public.skus(id) ON DELETE CASCADE,  -- NULL = all SKUs
  rate_percent DECIMAL(5,2) NOT NULL,  -- e.g., 10.00 = 10%
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,  -- NULL = no end date
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_rate CHECK (rate_percent >= 0 AND rate_percent <= 100),
  CONSTRAINT valid_date_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- 2. Commissions ledger (calculated per order)
CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  salesperson_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_date DATE NOT NULL,
  order_total DECIMAL(10,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  rate_applied DECIMAL(5,2) NOT NULL,  -- snapshot of rate used
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, paid
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'paid')),
  CONSTRAINT unique_order_commission UNIQUE (order_id)  -- one commission per order
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_rates_salesperson ON public.commission_rates(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_commission_rates_product_type ON public.commission_rates(product_type_id);
CREATE INDEX IF NOT EXISTS idx_commission_rates_sku ON public.commission_rates(sku_id);
CREATE INDEX IF NOT EXISTS idx_commission_rates_effective ON public.commission_rates(effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_commissions_salesperson ON public.commissions(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order_date ON public.commissions(order_date);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON public.commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_paid_at ON public.commissions(paid_at) WHERE paid_at IS NOT NULL;

-- Function to get applicable commission rate for a salesperson
-- Priority: SKU-specific > product_type > salesperson default > global default
CREATE OR REPLACE FUNCTION public.get_commission_rate(
  p_salesperson_id UUID,
  p_sku_id UUID DEFAULT NULL,
  p_product_type_id UUID DEFAULT NULL,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_rate DECIMAL(5,2);
BEGIN
  -- Try SKU-specific rate for this salesperson
  IF p_sku_id IS NOT NULL THEN
    SELECT rate_percent INTO v_rate
    FROM public.commission_rates
    WHERE salesperson_id = p_salesperson_id
      AND sku_id = p_sku_id
      AND effective_from <= p_date
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY effective_from DESC
    LIMIT 1;
    
    IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  END IF;
  
  -- Try product type rate for this salesperson
  IF p_product_type_id IS NOT NULL THEN
    SELECT rate_percent INTO v_rate
    FROM public.commission_rates
    WHERE salesperson_id = p_salesperson_id
      AND product_type_id = p_product_type_id
      AND sku_id IS NULL
      AND effective_from <= p_date
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY effective_from DESC
    LIMIT 1;
    
    IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  END IF;
  
  -- Try salesperson default rate (no product/sku specified)
  SELECT rate_percent INTO v_rate
  FROM public.commission_rates
  WHERE salesperson_id = p_salesperson_id
    AND product_type_id IS NULL
    AND sku_id IS NULL
    AND effective_from <= p_date
    AND (effective_to IS NULL OR effective_to >= p_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;
  
  -- Fall back to global default (salesperson_id IS NULL)
  SELECT rate_percent INTO v_rate
  FROM public.commission_rates
  WHERE salesperson_id IS NULL
    AND product_type_id IS NULL
    AND sku_id IS NULL
    AND effective_from <= p_date
    AND (effective_to IS NULL OR effective_to >= p_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  RETURN COALESCE(v_rate, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate commission for an order
CREATE OR REPLACE FUNCTION public.calculate_order_commission(p_order_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_order RECORD;
  v_rate DECIMAL(5,2);
  v_commission DECIMAL(10,2);
BEGIN
  -- Get order details
  SELECT id, agent_id, order_date, total_price, status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;
  
  IF v_order.agent_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get the salesperson's default rate (simplified - uses default rate)
  v_rate := public.get_commission_rate(v_order.agent_id, NULL, NULL, v_order.order_date::DATE);
  
  -- Calculate commission
  v_commission := v_order.total_price * (v_rate / 100);
  
  RETURN ROUND(v_commission, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger function to auto-create commission when order is delivered
CREATE OR REPLACE FUNCTION public.create_commission_on_delivery()
RETURNS TRIGGER AS $$
DECLARE
  v_rate DECIMAL(5,2);
  v_commission DECIMAL(10,2);
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
    
    -- Get rate and calculate commission
    v_rate := public.get_commission_rate(NEW.agent_id, NULL, NULL, NEW.order_date::DATE);
    v_commission := ROUND(NEW.total_price * (v_rate / 100), 2);
    
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
      v_commission,
      v_rate,
      'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS order_commission_trigger ON public.orders;
CREATE TRIGGER order_commission_trigger
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.create_commission_on_delivery();

-- Updated_at trigger for commission tables
CREATE OR REPLACE FUNCTION public.update_commission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS commission_rates_updated_at ON public.commission_rates;
CREATE TRIGGER commission_rates_updated_at
BEFORE UPDATE ON public.commission_rates
FOR EACH ROW EXECUTE FUNCTION public.update_commission_updated_at();

DROP TRIGGER IF EXISTS commissions_updated_at ON public.commissions;
CREATE TRIGGER commissions_updated_at
BEFORE UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.update_commission_updated_at();

-- Comments
COMMENT ON TABLE public.commission_rates IS 'Configurable commission rates by salesperson, product type, or SKU';
COMMENT ON TABLE public.commissions IS 'Commission ledger tracking earned commissions per order';
COMMENT ON FUNCTION public.get_commission_rate IS 'Returns applicable commission rate using priority: SKU > product_type > salesperson > global';
COMMENT ON FUNCTION public.calculate_order_commission IS 'Calculates commission amount for a given order';
