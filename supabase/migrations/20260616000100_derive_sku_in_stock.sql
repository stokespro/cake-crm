-- Migration: Derive in_stock from live inventory and vault weights
-- Description: Makes in_stock a computed boolean maintained by DB triggers rather
--              than a manually-toggled flag. Triggers fire on inventory and packages
--              changes and recompute in_stock for the affected SKU(s).
--
-- Formula (locked — do not change without product/ops sign-off):
--   vaultCases = FLOOR( SUM(active packages.current_weight
--                           WHERE packages.strain_id = sku.strain_id
--                             AND packages.type_id   = sku.product_type_id)
--                       / (sku.grams_per_unit * sku.units_per_case) )
--   in_stock = (vaultCases + inventory.staged + inventory.filled + inventory.cased) > 0
--
-- WHY orders are NOT subtracted:
--   Stock is physically deducted from inventory.cased when an order is marked
--   'packed' (app-layer deductFromCased in lib/packaging/db.ts, guarded by
--   packed_at). Subtracting order commitments here would double-count those
--   deductions and report less available stock than actually exists.

BEGIN;

-- 1. Change in_stock default from true/NULL to false.
--    New SKUs with no inventory must not appear in-stock until the trigger
--    recomputes them after the first inventory row is inserted.
ALTER TABLE public.skus
  ALTER COLUMN in_stock SET DEFAULT false,
  ALTER COLUMN in_stock SET NOT NULL;

-- Normalise any existing NULLs before we enforce NOT NULL
UPDATE public.skus SET in_stock = false WHERE in_stock IS NULL;

-- 2. Shared recompute function — called by both triggers.
--    Computes the locked formula for one SKU and writes the result back.
CREATE OR REPLACE FUNCTION public.refresh_sku_in_stock_by_id(p_sku_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_strain_id       uuid;
  v_product_type_id uuid;
  v_grams_per_unit  numeric;
  v_units_per_case  integer;
  v_vault_weight    numeric;
  v_vault_cases     bigint;
  v_staged          integer;
  v_filled          integer;
  v_cased           integer;
  v_is_in_stock     boolean;
BEGIN
  -- Fetch SKU dimensions needed for the formula
  SELECT strain_id, product_type_id, grams_per_unit, units_per_case
    INTO v_strain_id, v_product_type_id, v_grams_per_unit, v_units_per_case
    FROM public.skus
   WHERE id = p_sku_id;

  -- SKU may have been deleted between trigger fire and function execution; bail safely
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Sum active vault package weights for this strain+type combination
  SELECT COALESCE(SUM(current_weight), 0)
    INTO v_vault_weight
    FROM public.packages
   WHERE strain_id = v_strain_id
     AND type_id   = v_product_type_id
     AND is_active = true;

  -- Convert vault grams to whole cases.
  -- NULLIF guards divide-by-zero; COALESCE converts NULL result to 0 so
  -- in_stock falls back to staged+filled+cased only — never NULL, never throws.
  v_vault_cases := COALESCE(
    FLOOR(v_vault_weight / NULLIF(v_grams_per_unit * v_units_per_case, 0)),
    0
  );

  -- Fetch finished-goods inventory counts for this SKU
  SELECT COALESCE(staged, 0), COALESCE(filled, 0), COALESCE(cased, 0)
    INTO v_staged, v_filled, v_cased
    FROM public.inventory
   WHERE sku_id = p_sku_id;

  -- Default to 0 if no inventory row exists yet
  v_staged := COALESCE(v_staged, 0);
  v_filled := COALESCE(v_filled, 0);
  v_cased  := COALESCE(v_cased,  0);

  v_is_in_stock := (v_vault_cases + v_staged + v_filled + v_cased) > 0;

  UPDATE public.skus
     SET in_stock   = v_is_in_stock,
         updated_at = now()
   WHERE id = p_sku_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_sku_in_stock_by_id(uuid) IS
'Recomputes in_stock for a single SKU using vault package weights plus staged/filled/cased inventory. Called by triggers on inventory and packages tables.';

-- 3a. Trigger function: fires when inventory row changes (insert/update/delete).
--     Refreshes the single affected SKU.
CREATE OR REPLACE FUNCTION public.trg_inventory_refresh_in_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sku_id uuid;
BEGIN
  -- On DELETE, NEW is null — fall back to OLD
  v_sku_id := COALESCE(NEW.sku_id, OLD.sku_id);
  PERFORM public.refresh_sku_in_stock_by_id(v_sku_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3b. Attach trigger to inventory table
DROP TRIGGER IF EXISTS trg_inventory_refresh_in_stock ON public.inventory;
CREATE TRIGGER trg_inventory_refresh_in_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_inventory_refresh_in_stock();

-- 4a. Trigger function: fires when a vault package weight or active flag changes.
--     One package can satisfy multiple SKU variants (e.g. 1g/3.5g/7g/14g for the
--     same strain+type), so we loop over all matching SKUs.
CREATE OR REPLACE FUNCTION public.trg_packages_refresh_in_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_strain_id       uuid;
  v_product_type_id uuid;
  v_sku             record;
BEGIN
  -- Resolve strain_id and type_id from whichever row is available
  v_strain_id       := COALESCE(NEW.strain_id, OLD.strain_id);
  v_product_type_id := COALESCE(NEW.type_id,   OLD.type_id);

  -- If neither side carries a strain_id (legacy packages without it), bail early
  IF v_strain_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Refresh every SKU variant that maps to this strain+product_type combination
  -- (typically 2-4 variants: different gram sizes for the same product type)
  FOR v_sku IN
    SELECT id FROM public.skus
     WHERE strain_id       = v_strain_id
       AND product_type_id = v_product_type_id
  LOOP
    PERFORM public.refresh_sku_in_stock_by_id(v_sku.id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4b. Attach trigger to packages table
--     Only fires when the fields that affect available weight change
DROP TRIGGER IF EXISTS trg_packages_refresh_in_stock ON public.packages;
CREATE TRIGGER trg_packages_refresh_in_stock
  AFTER INSERT OR UPDATE OF current_weight, is_active OR DELETE ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_packages_refresh_in_stock();

-- 5. One-time backfill: recompute in_stock for every existing SKU using the formula.
--    Runs once at migration time; subsequent changes are handled by triggers.
DO $$
DECLARE
  v_sku record;
BEGIN
  FOR v_sku IN SELECT id FROM public.skus LOOP
    PERFORM public.refresh_sku_in_stock_by_id(v_sku.id);
  END LOOP;
END;
$$;

COMMIT;
