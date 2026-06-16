-- Safety guard: a non-active SKU (staged/discontinued) must never read in_stock=true.
-- Not sellable regardless of vault/inventory material; also defense-in-depth so a
-- non-catalog SKU can never leak as orderable even if a query forgets the status filter.
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
  v_status          text;
  v_vault_weight    numeric;
  v_vault_cases     bigint;
  v_staged          integer;
  v_filled          integer;
  v_cased           integer;
  v_is_in_stock     boolean;
BEGIN
  SELECT strain_id, product_type_id, grams_per_unit, units_per_case, status
    INTO v_strain_id, v_product_type_id, v_grams_per_unit, v_units_per_case, v_status
    FROM public.skus
   WHERE id = p_sku_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Non-active SKUs are never in stock (controls picker visibility)
  IF v_status IS DISTINCT FROM 'active' THEN
    UPDATE public.skus
       SET in_stock = false, updated_at = now()
     WHERE id = p_sku_id;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(current_weight), 0)
    INTO v_vault_weight
    FROM public.packages
   WHERE strain_id = v_strain_id
     AND type_id   = v_product_type_id
     AND is_active = true;

  v_vault_cases := COALESCE(
    FLOOR(v_vault_weight / NULLIF(v_grams_per_unit * v_units_per_case, 0)),
    0
  );

  SELECT COALESCE(staged, 0), COALESCE(filled, 0), COALESCE(cased, 0)
    INTO v_staged, v_filled, v_cased
    FROM public.inventory
   WHERE sku_id = p_sku_id;

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

-- Recompute all SKUs so the guard takes effect
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.skus LOOP
    PERFORM public.refresh_sku_in_stock_by_id(r.id);
  END LOOP;
END;
$$;
