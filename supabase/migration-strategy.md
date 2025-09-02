# Cannabis CRM - Enhanced Schema Migration Strategy

## Overview

This document outlines the comprehensive strategy for implementing enhanced database features including user permissions system, enhanced tracking capabilities, and audit trail functionality.

## Migration Components

### 1. Main Migration File
- **File**: `enhanced-schema-migration.sql`
- **Purpose**: Complete schema enhancement with new features
- **Estimated execution time**: 2-5 minutes depending on data volume

### 2. Rollback Script
- **File**: `rollback-enhanced-schema.sql`
- **Purpose**: Safe rollback to previous schema state
- **Use case**: Emergency rollback if issues arise

## Pre-Migration Checklist

### 1. Environment Validation
- [ ] Verify admin user access: `stokes@cakeoklahoma.com`
- [ ] Confirm database backup is available
- [ ] Test connection to Supabase instance
- [ ] Verify current schema matches expected baseline

### 2. Dependencies Check
```sql
-- Verify required extensions are available
SELECT * FROM pg_available_extensions 
WHERE name IN ('uuid-ossp', 'pg_stat_statements');

-- Check existing table structure
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'dispensary_profiles', 'products', 'communications', 'tasks', 'orders', 'order_items');
```

### 3. Performance Considerations
- Migration adds multiple indexes - expect temporary performance impact
- Activity log uses partitioning for optimal performance
- Estimated additional storage: 15-25% for audit tables

## Migration Execution Plan

### Phase 1: Schema Structure (5-10 seconds)
1. Create new enum types
2. Create new tables (permissions, activity log, change log)
3. Add columns to existing tables

### Phase 2: Indexes and Constraints (30-60 seconds)
1. Create performance indexes
2. Add data validation constraints
3. Set up partitioning for activity log

### Phase 3: Functions and Triggers (10-20 seconds)
1. Create permission checking functions
2. Create audit logging functions
3. Set up change tracking triggers

### Phase 4: Security and Policies (10-20 seconds)
1. Enable RLS on new tables
2. Create permission-based policies
3. Update existing policies for soft delete

### Phase 5: Default Data (5 seconds)
1. Insert default role permissions
2. Create utility views

## Post-Migration Verification

### 1. Structure Verification
```sql
-- Verify new tables
SELECT COUNT(*) as new_tables_count FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_permissions', 'role_permissions', 'user_activity_log', 'change_log');
-- Expected: 4

-- Verify new columns
SELECT COUNT(*) as new_columns_count FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles' 
AND column_name IN ('deleted_at', 'deleted_by', 'is_active', 'metadata', 'last_login_at', 'login_count');
-- Expected: 6
```

### 2. Function Testing
```sql
-- Test permission function
SELECT public.user_has_permission(
    (SELECT id FROM public.profiles WHERE email = 'stokes@cakeoklahoma.com'),
    'read'::permission_type, 
    'profile'::resource_type
);
-- Expected: true (admin has all permissions)

-- Test activity logging
SELECT public.log_user_activity(
    (SELECT id FROM public.profiles WHERE email = 'stokes@cakeoklahoma.com'),
    'login'::activity_type,
    'system'::resource_type,
    NULL,
    '{"test": true}'::jsonb
);
-- Expected: UUID of log entry
```

### 3. Performance Verification
```sql
-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats 
WHERE schemaname = 'public' 
AND tablename IN ('user_permissions', 'user_activity_log')
ORDER BY tablename, attname;

-- Verify partitioning
SELECT schemaname, tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'user_activity_log_%';
-- Expected: 12 monthly partitions
```

## Security Considerations

### 1. Row Level Security
- All new tables have RLS enabled
- Policies follow principle of least privilege
- Admin users have appropriate oversight capabilities

### 2. Permission System
- Granular permissions override role-based defaults
- Time-based permission expiration supported
- Audit trail for all permission changes

### 3. Data Protection
- Soft delete preserves referential integrity
- Change tracking captures all modifications
- IP and user agent logging for security analysis

## Performance Optimizations

### 1. Indexing Strategy
- Composite indexes for common query patterns
- Partial indexes for filtered queries
- GIN indexes for JSONB and array columns

### 2. Partitioning
- Activity log partitioned by month for performance
- Automatic partition creation script included
- Old partition cleanup strategy needed (manual)

### 3. Query Optimization
- Utility views for common data patterns
- Functions use appropriate security context
- Trigger efficiency optimized for high-volume operations

## Monitoring and Maintenance

### 1. Performance Monitoring
```sql
-- Monitor activity log growth
SELECT 
    schemaname, tablename, 
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE tablename LIKE 'user_activity_log%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Monitor change log efficiency
SELECT table_name, COUNT(*) as change_count, 
       MIN(changed_at) as oldest_change, MAX(changed_at) as newest_change
FROM public.change_log 
GROUP BY table_name 
ORDER BY change_count DESC;
```

### 2. Maintenance Tasks
- **Monthly**: Create new activity log partitions
- **Quarterly**: Archive old activity logs (>90 days)
- **Yearly**: Review and optimize permission structure

## Rollback Procedure

### When to Rollback
- Application errors after migration
- Severe performance degradation
- Unexpected data integrity issues

### Rollback Steps
1. **Immediate**: Execute `rollback-enhanced-schema.sql`
2. **Verify**: Run verification queries to ensure clean rollback
3. **Monitor**: Check application functionality
4. **Investigate**: Analyze logs to determine migration issues

### Rollback Verification
```sql
-- Ensure new tables are removed
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_permissions', 'role_permissions', 'user_activity_log', 'change_log');
-- Expected: 0

-- Ensure added columns are removed
SELECT COUNT(*) FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles' 
AND column_name IN ('deleted_at', 'deleted_by', 'is_active', 'metadata');
-- Expected: 0
```

## Data Migration Considerations

### 1. Existing Data Preservation
- All existing data remains unchanged
- New columns added with safe defaults
- Historical relationships maintained

### 2. Default Values
- `is_active = true` for all existing users
- `edit_count = 0` and `version = 1` for tracked tables
- Empty JSONB objects for metadata columns

### 3. Permission Assignment
- Existing roles automatically get appropriate permissions
- Admin users retain full system access
- Agent permissions match current functional access

## Testing Strategy

### 1. Unit Tests
- Test each new function individually
- Verify permission logic accuracy
- Validate audit trail completeness

### 2. Integration Tests
- Test application functionality with new schema
- Verify RLS policies work correctly
- Check performance under normal load

### 3. User Acceptance Testing
- Admin user management functionality
- Agent workflow with new tracking
- Management reporting capabilities

## Success Criteria

### 1. Functional Requirements
- [ ] Granular permission system operational
- [ ] User activity logging captures all actions
- [ ] Soft delete functionality works correctly
- [ ] Edit tracking provides audit trail
- [ ] Enhanced indexes improve query performance

### 2. Non-Functional Requirements
- [ ] No degradation in existing functionality
- [ ] Response times remain acceptable (<200ms for typical queries)
- [ ] Security policies enforce proper access control
- [ ] Data integrity maintained throughout system

### 3. Business Requirements
- [ ] Admin can manage user permissions effectively
- [ ] Audit trail provides compliance support
- [ ] Dispensary-specific queries perform efficiently
- [ ] System supports enhanced tracking needs

## Emergency Contacts

- **Database Administrator**: [Contact Info]
- **Application Developer**: [Contact Info]
- **System Administrator**: [Contact Info]

## Migration Log Template

```
Migration Date: ___________
Migration Start Time: ___________
Migration End Time: ___________
Executed By: ___________
Verification Status: [ ] PASS [ ] FAIL
Issues Encountered: ___________
Rollback Required: [ ] YES [ ] NO
Notes: ___________
```