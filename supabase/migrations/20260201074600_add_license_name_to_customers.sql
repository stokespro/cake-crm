-- Add license_name field to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS license_name TEXT;

-- Add comment
COMMENT ON COLUMN public.customers.license_name IS 'Legal entity name on the license (e.g., LLC name), often different from business/DBA name';
