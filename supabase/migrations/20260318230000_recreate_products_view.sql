-- Migration: Recreate products VIEW over skus table
-- Description: Creates a view layer that provides backward compatibility
--              while unifying SKU-based inventory with legacy product queries
--
-- Context: The CAKE Platform evolved from separate apps with a "products" table
--          to a unified vault-based system with "skus" table. This view maintains
--          backward compatibility for existing product queries while mapping to
--          the current SKU-based schema.
--
-- Reconstructed from: types/database.ts Product interface (lines 94-114)

BEGIN;

-- Drop existing view if it exists (safe operation)
DROP VIEW IF EXISTS public.products CASCADE;

-- Create products view as a layer over skus table
CREATE VIEW public.products AS
SELECT
  -- Core SKU fields
  s.id,
  s.code,
  s.name AS item_name,              -- Primary field for current usage
  s.name AS strain_name,             -- Backward compatibility alias
  s.description,
  s.in_stock,
  s.strain_id,
  s.product_type_id,
  s.created_at,
  s.updated_at,

  -- Deprecated fields (kept for backward compatibility)
  s.price_per_unit,
  s.thc_percentage,
  s.cbd_percentage,

  -- Joined fields from product_types
  pt.name AS product_type_name,
  pt.name AS category,               -- Backward compatibility alias
  s.units_per_case,

  -- Joined fields from strains
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

COMMIT;
