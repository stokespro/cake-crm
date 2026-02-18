-- Rollback Phase 1: Remove auth_id column and delete auth accounts
-- Run auth account deletion via Supabase dashboard or admin API first
ALTER TABLE users DROP COLUMN IF EXISTS auth_id;
DROP INDEX IF EXISTS idx_users_auth_id;
