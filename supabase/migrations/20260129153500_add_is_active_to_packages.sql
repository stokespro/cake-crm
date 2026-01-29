-- Add is_active column to packages table for soft-delete/deactivation functionality
-- This column was missing but referenced in vault.ts actions

ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Ensure all existing packages are marked as active
UPDATE packages SET is_active = true WHERE is_active IS NULL;
