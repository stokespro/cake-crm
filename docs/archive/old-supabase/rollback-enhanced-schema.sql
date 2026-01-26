-- =====================================================================
-- Cannabis CRM - Enhanced Features Rollback Script
-- =====================================================================
-- This script safely rolls back the enhanced schema migration
-- Use with caution - this will remove all new functionality and data
-- =====================================================================

-- Drop triggers first to prevent cascading issues
DROP TRIGGER IF EXISTS track_profiles_changes ON public.profiles;
DROP TRIGGER IF EXISTS track_orders_changes ON public.orders;
DROP TRIGGER IF EXISTS track_communications_changes ON public.communications;
DROP TRIGGER IF EXISTS track_tasks_changes ON public.tasks;
DROP TRIGGER IF EXISTS track_dispensary_profiles_changes ON public.dispensary_profiles;
DROP TRIGGER IF EXISTS update_user_permissions_updated_at ON public.user_permissions;

-- Drop views
DROP VIEW IF EXISTS public.active_users;
DROP VIEW IF EXISTS public.dispensary_metrics;

-- Drop partitioned tables (activity log partitions)
DO $$
DECLARE
    partition_name TEXT;
BEGIN
    FOR partition_name IN 
        SELECT schemaname||'.'||tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'user_activity_log_%'
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || partition_name;
    END LOOP;
END $$;

-- Drop new tables (in reverse dependency order)
DROP TABLE IF EXISTS public.change_log;
DROP TABLE IF EXISTS public.user_activity_log;
DROP TABLE IF EXISTS public.user_permissions;
DROP TABLE IF EXISTS public.role_permissions;

-- Drop functions
DROP FUNCTION IF EXISTS public.user_has_permission(UUID, permission_type, resource_type, UUID);
DROP FUNCTION IF EXISTS public.log_user_activity(UUID, activity_type, resource_type, UUID, JSONB, INET, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.soft_delete_user(UUID, UUID);
DROP FUNCTION IF EXISTS public.track_changes();
DROP FUNCTION IF EXISTS public.update_login_tracking(UUID);

-- Remove added columns from existing tables
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS deleted_by,
DROP COLUMN IF EXISTS last_login_at,
DROP COLUMN IF EXISTS login_count,
DROP COLUMN IF EXISTS is_active,
DROP COLUMN IF EXISTS metadata;

ALTER TABLE public.orders
DROP COLUMN IF EXISTS last_edited_by,
DROP COLUMN IF EXISTS last_edited_at,
DROP COLUMN IF EXISTS edit_count,
DROP COLUMN IF EXISTS version,
DROP COLUMN IF EXISTS metadata;

ALTER TABLE public.communications
DROP COLUMN IF EXISTS last_edited_by,
DROP COLUMN IF EXISTS last_edited_at,
DROP COLUMN IF EXISTS edit_count,
DROP COLUMN IF EXISTS version,
DROP COLUMN IF EXISTS metadata;

ALTER TABLE public.dispensary_profiles
DROP COLUMN IF EXISTS last_contact_date,
DROP COLUMN IF EXISTS contact_frequency_days,
DROP COLUMN IF EXISTS status,
DROP COLUMN IF EXISTS metadata,
DROP COLUMN IF EXISTS tags;

ALTER TABLE public.tasks
DROP COLUMN IF EXISTS last_edited_by,
DROP COLUMN IF EXISTS last_edited_at,
DROP COLUMN IF EXISTS assigned_by,
DROP COLUMN IF EXISTS time_spent_minutes,
DROP COLUMN IF EXISTS metadata;

-- Revert contact_method column to TEXT (if it was changed)
ALTER TABLE public.communications 
ALTER COLUMN contact_method TYPE TEXT;

-- Drop new indexes
DROP INDEX IF EXISTS idx_user_permissions_user_id;
DROP INDEX IF EXISTS idx_user_permissions_active;
DROP INDEX IF EXISTS idx_user_permissions_resource;
DROP INDEX IF EXISTS idx_user_permissions_expires;
DROP INDEX IF EXISTS idx_user_activity_user_id;
DROP INDEX IF EXISTS idx_user_activity_created_at;
DROP INDEX IF EXISTS idx_user_activity_type;
DROP INDEX IF EXISTS idx_user_activity_resource;
DROP INDEX IF EXISTS idx_user_activity_failed;
DROP INDEX IF EXISTS idx_change_log_table_record;
DROP INDEX IF EXISTS idx_change_log_changed_at;
DROP INDEX IF EXISTS idx_change_log_changed_by;
DROP INDEX IF EXISTS idx_profiles_active;
DROP INDEX IF EXISTS idx_profiles_role_active;
DROP INDEX IF EXISTS idx_profiles_last_login;
DROP INDEX IF EXISTS idx_profiles_deleted;
DROP INDEX IF EXISTS idx_dispensary_profiles_status;
DROP INDEX IF EXISTS idx_dispensary_profiles_tags;
DROP INDEX IF EXISTS idx_dispensary_profiles_last_contact;
DROP INDEX IF EXISTS idx_dispensary_profiles_business_name_trgm;
DROP INDEX IF EXISTS idx_communications_dispensary_date;
DROP INDEX IF EXISTS idx_communications_follow_up;
DROP INDEX IF EXISTS idx_communications_method;
DROP INDEX IF EXISTS idx_tasks_priority_due;
DROP INDEX IF EXISTS idx_tasks_status_due;
DROP INDEX IF EXISTS idx_tasks_assigned_by;
DROP INDEX IF EXISTS idx_orders_status_date;
DROP INDEX IF EXISTS idx_orders_approved_by;
DROP INDEX IF EXISTS idx_orders_delivery_date;

-- Drop constraints
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_email_format,
DROP CONSTRAINT IF EXISTS profiles_phone_format;

ALTER TABLE public.dispensary_profiles
DROP CONSTRAINT IF EXISTS dispensary_status_valid,
DROP CONSTRAINT IF EXISTS dispensary_contact_frequency_positive;

-- Drop new enums
DROP TYPE IF EXISTS permission_type;
DROP TYPE IF EXISTS resource_type;
DROP TYPE IF EXISTS activity_type;
DROP TYPE IF EXISTS contact_method; -- Only if it was created by migration

-- Restore original RLS policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Note: Original schema should now be restored
COMMENT ON SCHEMA public IS 'Enhanced schema migration has been rolled back successfully';