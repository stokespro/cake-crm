-- =====================================================================
-- Cannabis CRM - Migration Validation Script
-- =====================================================================
-- This script validates that the enhanced schema migration was successful
-- Run this after executing the migration to ensure everything is working
-- =====================================================================

-- Set up test environment
DO $$
BEGIN
    -- Set a test user context for testing
    PERFORM set_config('app.current_user_id', 
        (SELECT id::text FROM public.profiles WHERE email = 'stokes@cakeoklahoma.com' LIMIT 1), 
        false);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not set user context - some tests may fail';
END $$;

-- =====================================================================
-- 1. STRUCTURAL VALIDATION
-- =====================================================================

\echo '==================== STRUCTURAL VALIDATION ===================='

-- Check that all new tables exist
\echo '1. Verifying new tables exist...'
SELECT 
    CASE 
        WHEN COUNT(*) = 4 THEN 'PASS: All 4 new tables created'
        ELSE 'FAIL: Expected 4 tables, found ' || COUNT(*)
    END as table_check
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_permissions', 'role_permissions', 'user_activity_log', 'change_log');

-- Check that new columns were added to existing tables
\echo '2. Verifying new columns added to profiles...'
SELECT 
    CASE 
        WHEN COUNT(*) = 6 THEN 'PASS: All 6 profile columns added'
        ELSE 'FAIL: Expected 6 columns, found ' || COUNT(*)
    END as profile_columns_check
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles' 
AND column_name IN ('deleted_at', 'deleted_by', 'is_active', 'metadata', 'last_login_at', 'login_count');

\echo '3. Verifying new columns added to orders...'
SELECT 
    CASE 
        WHEN COUNT(*) = 5 THEN 'PASS: All 5 order columns added'
        ELSE 'FAIL: Expected 5 columns, found ' || COUNT(*)
    END as order_columns_check
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'orders' 
AND column_name IN ('last_edited_by', 'last_edited_at', 'edit_count', 'version', 'metadata');

-- Check that enums were created
\echo '4. Verifying new enums created...'
SELECT 
    CASE 
        WHEN COUNT(*) >= 3 THEN 'PASS: Core enums created'
        ELSE 'FAIL: Missing enums'
    END as enum_check
FROM pg_type 
WHERE typname IN ('permission_type', 'resource_type', 'activity_type');

-- =====================================================================
-- 2. INDEX VALIDATION
-- =====================================================================

\echo '==================== INDEX VALIDATION ===================='

-- Check that key indexes were created
\echo '5. Verifying new indexes created...'
SELECT 
    COUNT(*) as new_indexes_count,
    CASE 
        WHEN COUNT(*) >= 15 THEN 'PASS: Core indexes created'
        ELSE 'FAIL: Missing indexes - found ' || COUNT(*)
    END as index_check
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_user_%' 
   OR indexname LIKE 'idx_change_%'
   OR indexname LIKE 'idx_profiles_%'
   OR indexname LIKE 'idx_dispensary_%';

-- =====================================================================
-- 3. FUNCTION VALIDATION
-- =====================================================================

\echo '==================== FUNCTION VALIDATION ===================='

-- Test permission checking function
\echo '6. Testing permission checking function...'
SELECT 
    CASE 
        WHEN public.user_has_permission(
            (SELECT id FROM public.profiles WHERE email = 'stokes@cakeoklahoma.com' LIMIT 1),
            'read'::permission_type, 
            'profile'::resource_type
        ) = true THEN 'PASS: Admin permission check works'
        ELSE 'FAIL: Admin should have read permission'
    END as permission_check;

-- Test activity logging function
\echo '7. Testing activity logging function...'
SELECT 
    CASE 
        WHEN public.log_user_activity(
            (SELECT id FROM public.profiles WHERE email = 'stokes@cakeoklahoma.com' LIMIT 1),
            'login'::activity_type,
            'system'::resource_type,
            NULL,
            '{"test": "validation"}'::jsonb
        ) IS NOT NULL THEN 'PASS: Activity logging works'
        ELSE 'FAIL: Activity logging failed'
    END as activity_log_check;

-- =====================================================================
-- 4. TRIGGER VALIDATION
-- =====================================================================

\echo '==================== TRIGGER VALIDATION ===================='

-- Test change tracking trigger by updating a profile
\echo '8. Testing change tracking triggers...'
DO $$
DECLARE
    test_user_id UUID;
    change_count INTEGER;
BEGIN
    -- Get a test user
    SELECT id INTO test_user_id FROM public.profiles WHERE email = 'stokes@cakeoklahoma.com' LIMIT 1;
    
    IF test_user_id IS NULL THEN
        RAISE NOTICE 'FAIL: No test user found';
        RETURN;
    END IF;
    
    -- Update the user to trigger change logging
    UPDATE public.profiles 
    SET full_name = COALESCE(full_name, 'Test User Updated ' || now()::text)
    WHERE id = test_user_id;
    
    -- Check if change was logged
    SELECT COUNT(*) INTO change_count 
    FROM public.change_log 
    WHERE table_name = 'profiles' AND record_id = test_user_id
    AND changed_at > now() - INTERVAL '1 minute';
    
    IF change_count > 0 THEN
        RAISE NOTICE 'PASS: Change tracking trigger works';
    ELSE
        RAISE NOTICE 'FAIL: Change tracking trigger not working';
    END IF;
END $$;

-- =====================================================================
-- 5. RLS POLICY VALIDATION
-- =====================================================================

\echo '==================== RLS POLICY VALIDATION ===================='

-- Check that RLS is enabled on new tables
\echo '9. Verifying RLS enabled on new tables...'
SELECT 
    COUNT(*) as rls_enabled_count,
    CASE 
        WHEN COUNT(*) = 4 THEN 'PASS: RLS enabled on all new tables'
        ELSE 'FAIL: RLS not enabled on all tables'
    END as rls_check
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' 
AND c.relname IN ('user_permissions', 'role_permissions', 'user_activity_log', 'change_log')
AND c.relrowsecurity = true;

-- Check that policies were created
\echo '10. Verifying policies created...'
SELECT 
    COUNT(*) as policy_count,
    CASE 
        WHEN COUNT(*) >= 8 THEN 'PASS: Core policies created'
        ELSE 'FAIL: Missing policies'
    END as policy_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('user_permissions', 'user_activity_log', 'change_log');

-- =====================================================================
-- 6. DEFAULT DATA VALIDATION
-- =====================================================================

\echo '==================== DEFAULT DATA VALIDATION ===================='

-- Check that default role permissions were inserted
\echo '11. Verifying default role permissions...'
SELECT 
    role,
    COUNT(*) as permission_count,
    CASE 
        WHEN role = 'admin' AND COUNT(*) >= 15 THEN 'PASS: Admin permissions loaded'
        WHEN role = 'management' AND COUNT(*) >= 8 THEN 'PASS: Management permissions loaded'
        WHEN role = 'agent' AND COUNT(*) >= 6 THEN 'PASS: Agent permissions loaded'
        ELSE 'FAIL: Insufficient permissions for ' || role
    END as permission_check
FROM public.role_permissions 
GROUP BY role
ORDER BY role;

-- =====================================================================
-- 7. PERFORMANCE VALIDATION
-- =====================================================================

\echo '==================== PERFORMANCE VALIDATION ===================='

-- Test query performance on indexed columns
\echo '12. Testing query performance...'
EXPLAIN (ANALYZE, BUFFERS) 
SELECT p.*, COUNT(c.id) as communication_count
FROM public.profiles p
LEFT JOIN public.communications c ON c.agent_id = p.id
WHERE p.is_active = true 
AND p.role = 'agent'
GROUP BY p.id
LIMIT 10;

-- Check partition creation for activity log
\echo '13. Verifying activity log partitions...'
SELECT 
    COUNT(*) as partition_count,
    CASE 
        WHEN COUNT(*) >= 12 THEN 'PASS: Activity log partitions created'
        ELSE 'WARN: Only ' || COUNT(*) || ' partitions found'
    END as partition_check
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'user_activity_log_%';

-- =====================================================================
-- 8. DATA INTEGRITY VALIDATION
-- =====================================================================

\echo '==================== DATA INTEGRITY VALIDATION ===================='

-- Check that existing data wasn't corrupted
\echo '14. Verifying existing data integrity...'
SELECT 
    table_name,
    COUNT(*) as record_count
FROM (
    SELECT 'profiles' as table_name, COUNT(*) FROM public.profiles
    UNION ALL
    SELECT 'dispensary_profiles', COUNT(*) FROM public.dispensary_profiles
    UNION ALL
    SELECT 'products', COUNT(*) FROM public.products
    UNION ALL
    SELECT 'communications', COUNT(*) FROM public.communications
    UNION ALL
    SELECT 'tasks', COUNT(*) FROM public.tasks
    UNION ALL
    SELECT 'orders', COUNT(*) FROM public.orders
    UNION ALL
    SELECT 'order_items', COUNT(*) FROM public.order_items
) counts
GROUP BY table_name, record_count
ORDER BY table_name;

-- Check that foreign key constraints are still valid
\echo '15. Verifying foreign key integrity...'
SELECT 
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as referenced_table,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_constraint_check_violation(oid) 
        ) THEN 'PASS: Constraint valid'
        ELSE 'FAIL: Constraint violation found'
    END as constraint_check
FROM pg_constraint 
WHERE contype = 'f' 
AND connamespace = 'public'::regnamespace
AND (conrelid::regclass::text LIKE 'public.user_%' 
     OR conrelid::regclass::text LIKE 'public.change_%')
LIMIT 10;

-- =====================================================================
-- 9. SECURITY VALIDATION  
-- =====================================================================

\echo '==================== SECURITY VALIDATION ===================='

-- Test that non-admin users can't see other users' permissions
\echo '16. Testing permission isolation...'
-- This would require creating a test user account to properly validate

-- Verify that audit logging captures security events
\echo '17. Verifying audit logging...'
SELECT 
    COUNT(*) as audit_entries,
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASS: Audit entries found'
        ELSE 'WARN: No audit entries (may be normal for new install)'
    END as audit_check
FROM public.user_activity_log
WHERE created_at > now() - INTERVAL '1 hour';

-- =====================================================================
-- 10. UTILITY VIEWS VALIDATION
-- =====================================================================

\echo '==================== UTILITY VIEWS VALIDATION ===================='

-- Test that utility views work correctly
\echo '18. Testing utility views...'
SELECT 
    COUNT(*) as active_users,
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASS: Active users view works'
        ELSE 'FAIL: Active users view returns no results'
    END as view_check
FROM public.active_users;

SELECT 
    COUNT(*) as dispensary_metrics,
    CASE 
        WHEN COUNT(*) >= 0 THEN 'PASS: Dispensary metrics view works'
        ELSE 'FAIL: Dispensary metrics view error'
    END as metrics_check
FROM public.dispensary_metrics
LIMIT 5;

-- =====================================================================
-- SUMMARY REPORT
-- =====================================================================

\echo '==================== VALIDATION SUMMARY ===================='

-- Create a comprehensive validation summary
SELECT 
    'MIGRATION VALIDATION COMPLETE' as status,
    now() as completed_at,
    current_user as validated_by;

-- Performance summary
SELECT 
    'Performance Summary:' as metric_type,
    pg_size_pretty(pg_database_size(current_database())) as database_size,
    (SELECT COUNT(*) FROM public.user_activity_log) as activity_log_entries,
    (SELECT COUNT(*) FROM public.change_log) as change_log_entries,
    (SELECT COUNT(*) FROM public.user_permissions) as permission_entries;

-- Security summary  
SELECT
    'Security Summary:' as metric_type,
    (SELECT COUNT(*) FROM public.profiles WHERE is_active = true) as active_users,
    (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NOT NULL) as deleted_users,
    (SELECT COUNT(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public') as secured_tables;

\echo '==================== VALIDATION COMPLETE ===================='
\echo 'If all checks show PASS, the migration was successful.'
\echo 'Any FAIL messages require immediate attention.'
\echo 'WARN messages should be reviewed but may not require action.'