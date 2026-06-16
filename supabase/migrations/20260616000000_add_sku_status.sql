-- Migration: Add lifecycle status column to skus
-- Description: Introduces a 3-state lifecycle column (active/staged/discontinued)
--              so product visibility can be managed independently of stock levels.
--              Recreates the products view to pass through the new column.

BEGIN;

-- 1. Add status column to skus
--    'active'       — live product, visible on orders
--    'staged'       — coming soon / pre-release, not yet orderable
--    'discontinued' — retired, hide from new orders but kept on historical ones
ALTER TABLE public.skus
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'staged', 'discontinued'));

-- 2. Index — order pages filter by status on every load
CREATE INDEX idx_skus_status ON public.skus (status);

-- 3. Recreate products view to include the new status column.
--    Pattern mirrors 20260318230000_recreate_products_view.sql exactly —
--    DROP CASCADE then CREATE with the one added column.
DROP VIEW IF EXISTS public.products CASCADE;

CREATE VIEW public.products AS
SELECT
  s.id,
  s.code,
  s.name AS item_name,
  s.name AS strain_name,
  s.description,
  s.in_stock,
  s.status,
  s.strain_id,
  s.product_type_id,
  s.created_at,
  s.updated_at,
  s.price_per_unit,
  s.thc_percentage,
  s.cbd_percentage,
  pt.name AS product_type_name,
  pt.name AS category,
  s.units_per_case,
  s.grams_per_unit,
  st.name AS strain_raw_name
FROM public.skus s
  LEFT JOIN public.product_types pt ON s.product_type_id = pt.id
  LEFT JOIN public.strains st ON s.strain_id = st.id;

-- Add helpful comment
COMMENT ON VIEW public.products IS
'Read-only view over skus table providing backward compatibility for legacy product queries. Joins product_types and strains for complete product information.';

-- Grant SELECT permission to authenticated users
-- Note: RLS policies from underlying skus table will still apply
GRANT SELECT ON public.products TO authenticated;

-- 4. Backfill: mark known future/staged products
--    SKUs whose code ends in -A-14 are pre-release 14g variants not yet in circulation
UPDATE public.skus
  SET status = 'staged'
  WHERE code LIKE '%-A-14';

COMMIT;
