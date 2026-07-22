-- Add lab/COA testing fields to batches table (THC %, Terpenes %, Total Cannabinoids %)
-- These are optional percentage values entered from lab testing results.

ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS thc_percentage numeric(5,2);
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS terpenes_percentage numeric(5,2);
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS total_cannabinoids_percentage numeric(5,2);

COMMENT ON COLUMN public.batches.thc_percentage IS 'THC percentage from lab/COA testing results';
COMMENT ON COLUMN public.batches.terpenes_percentage IS 'Total terpenes percentage from lab/COA testing results';
COMMENT ON COLUMN public.batches.total_cannabinoids_percentage IS 'Total cannabinoids percentage from lab/COA testing results';
