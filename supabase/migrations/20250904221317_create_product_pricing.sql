-- Migration: Create product_pricing table with tiered pricing
-- Description: Adds support for quantity-based pricing tiers for products

BEGIN;

-- Create the product_pricing table
CREATE TABLE public.product_pricing (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    min_quantity INTEGER NOT NULL CHECK (min_quantity > 0),
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure unique pricing tiers per product
    UNIQUE(product_id, min_quantity)
);

-- Create indexes for performance
CREATE INDEX idx_product_pricing_product_id ON public.product_pricing(product_id);
CREATE INDEX idx_product_pricing_min_quantity ON public.product_pricing(min_quantity);
CREATE INDEX idx_product_pricing_product_quantity ON public.product_pricing(product_id, min_quantity DESC);

-- Add updated_at trigger
CREATE TRIGGER update_product_pricing_updated_at 
    BEFORE UPDATE ON public.product_pricing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.product_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can view pricing
CREATE POLICY "All authenticated users can view product pricing" 
    ON public.product_pricing
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);

-- RLS Policy: Only management and admin can manage pricing
CREATE POLICY "Management and admin can manage product pricing" 
    ON public.product_pricing
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin')
        )
    );

-- Migrate existing products to have default pricing tier at quantity 1
-- This preserves existing price_per_unit values as the base pricing tier
INSERT INTO public.product_pricing (product_id, min_quantity, price)
SELECT 
    id as product_id,
    1 as min_quantity,
    price_per_unit as price
FROM public.products
WHERE id NOT IN (
    -- Avoid duplicates if pricing already exists for quantity 1
    SELECT DISTINCT product_id 
    FROM public.product_pricing 
    WHERE min_quantity = 1
);

-- Create a function to get the effective price for a given product and quantity
-- This function finds the highest min_quantity tier that the requested quantity qualifies for
CREATE OR REPLACE FUNCTION get_product_price(p_product_id UUID, p_quantity INTEGER)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    effective_price DECIMAL(10,2);
BEGIN
    SELECT price INTO effective_price
    FROM public.product_pricing
    WHERE product_id = p_product_id 
        AND min_quantity <= p_quantity
    ORDER BY min_quantity DESC
    LIMIT 1;
    
    -- If no pricing tier found, return the base price from products table (fallback)
    IF effective_price IS NULL THEN
        SELECT price_per_unit INTO effective_price
        FROM public.products
        WHERE id = p_product_id;
    END IF;
    
    RETURN effective_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a comment explaining the pricing logic
COMMENT ON TABLE public.product_pricing IS 
'Tiered pricing table for products. Each row represents a minimum quantity threshold and corresponding price. The system uses the highest qualifying tier based on order quantity.';

COMMENT ON FUNCTION get_product_price(UUID, INTEGER) IS 
'Returns the effective price for a product based on quantity-based pricing tiers. Falls back to products.price_per_unit if no pricing tier is found.';

-- Create a view for easy price lookup with product details
CREATE OR REPLACE VIEW product_pricing_view AS
SELECT 
    p.id as product_id,
    p.strain_name,
    p.category,
    p.in_stock,
    pp.id as pricing_id,
    pp.min_quantity,
    pp.price,
    pp.created_at as pricing_created_at
FROM public.products p
LEFT JOIN public.product_pricing pp ON p.id = pp.product_id
ORDER BY p.strain_name, pp.min_quantity;

-- Grant appropriate permissions on the view
-- RLS policies will still apply to the underlying tables
-- Note: Views inherit RLS permissions from their underlying tables, no policy needed

COMMIT;