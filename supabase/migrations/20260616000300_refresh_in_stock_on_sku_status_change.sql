-- Recompute in_stock when a SKU is created or its status changes (e.g. staged->active
-- relaunch). Without this a relaunched product stays in_stock=false (left by the guard)
-- until the next inventory/packages change. Recursion-safe: the recompute updates only
-- in_stock + updated_at (never status), so an "UPDATE OF status" trigger can't re-fire.
CREATE OR REPLACE FUNCTION public.trg_skus_refresh_in_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.refresh_sku_in_stock_by_id(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skus_refresh_in_stock ON public.skus;
CREATE TRIGGER trg_skus_refresh_in_stock
  AFTER INSERT OR UPDATE OF status ON public.skus
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_skus_refresh_in_stock();
