-- =====================================================
-- Cannabis CRM - Enhanced Database Schema Migration
-- Version: 2.0.0
-- Date: 2025-09-02
-- Author: Hive Mind Database Architect Agent
-- =====================================================

-- =====================================================
-- SECTION 1: NEW TABLES
-- =====================================================

-- User Permissions Table for Granular Control
CREATE TABLE IF NOT EXISTS public.user_permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission_name TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    granted BOOLEAN DEFAULT false,
    granted_by UUID REFERENCES public.profiles(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_permission UNIQUE(user_id, permission_name, resource_type, resource_id)
);

-- User Activity Log for Audit Trail
CREATE TABLE IF NOT EXISTS public.user_activity_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id),
    action_type TEXT NOT NULL, -- 'login', 'logout', 'create', 'update', 'delete', 'view'
    resource_type TEXT, -- 'dispensary', 'order', 'communication', 'user', etc.
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    success BOOLEAN DEFAULT true,
    error_message TEXT
);

-- Communication Edit History
CREATE TABLE IF NOT EXISTS public.communication_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    communication_id UUID REFERENCES public.communications(id) ON DELETE CASCADE,
    edited_by UUID REFERENCES public.profiles(id),
    edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    previous_values JSONB,
    new_values JSONB,
    change_reason TEXT
);

-- Order Edit History
CREATE TABLE IF NOT EXISTS public.order_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    edited_by UUID REFERENCES public.profiles(id),
    edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    previous_values JSONB,
    new_values JSONB,
    change_reason TEXT
);

-- =====================================================
-- SECTION 2: ALTER EXISTING TABLES
-- =====================================================

-- Enhance profiles table with soft delete and additional fields
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Enhance orders table with edit tracking
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_for_editing BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;

-- Enhance communications table with edit tracking
ALTER TABLE public.communications
    ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;

-- Enhance dispensary_profiles with additional tracking
ALTER TABLE public.dispensary_profiles
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS last_communication_date TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_order_date TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS total_orders_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_communications_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- =====================================================
-- SECTION 3: INDEXES FOR PERFORMANCE
-- =====================================================

-- User permissions indexes
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_name ON public.user_permissions(permission_name);
CREATE INDEX IF NOT EXISTS idx_user_permissions_resource ON public.user_permissions(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_expires ON public.user_permissions(expires_at) WHERE expires_at IS NOT NULL;

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON public.user_activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.user_activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_resource ON public.user_activity_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_session ON public.user_activity_log(session_id);

-- Soft delete indexes
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_deleted ON public.profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- Edit tracking indexes
CREATE INDEX IF NOT EXISTS idx_orders_edited ON public.orders(last_edited_at) WHERE last_edited_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_edited ON public.communications(last_edited_at) WHERE last_edited_at IS NOT NULL;

-- Dispensary analytics indexes
CREATE INDEX IF NOT EXISTS idx_dispensary_last_comm ON public.dispensary_profiles(last_communication_date);
CREATE INDEX IF NOT EXISTS idx_dispensary_last_order ON public.dispensary_profiles(last_order_date);
CREATE INDEX IF NOT EXISTS idx_dispensary_active ON public.dispensary_profiles(is_active);

-- History table indexes
CREATE INDEX IF NOT EXISTS idx_comm_history_comm_id ON public.communication_history(communication_id);
CREATE INDEX IF NOT EXISTS idx_comm_history_edited_at ON public.communication_history(edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON public.order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_edited_at ON public.order_history(edited_at DESC);

-- =====================================================
-- SECTION 4: FUNCTIONS
-- =====================================================

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION public.user_has_permission(
    p_user_id UUID,
    p_permission_name TEXT,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_permission BOOLEAN;
    v_user_role TEXT;
BEGIN
    -- Check if user is admin (admins have all permissions)
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = p_user_id AND deleted_at IS NULL;
    
    IF v_user_role = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Check specific permission
    SELECT EXISTS(
        SELECT 1
        FROM public.user_permissions
        WHERE user_id = p_user_id
        AND permission_name = p_permission_name
        AND granted = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (
            (p_resource_type IS NULL AND p_resource_id IS NULL) OR
            (resource_type = p_resource_type AND (resource_id = p_resource_id OR resource_id IS NULL))
        )
    ) INTO v_has_permission;
    
    -- Check role-based defaults if no specific permission found
    IF NOT v_has_permission THEN
        -- Management role default permissions
        IF v_user_role = 'management' AND p_permission_name IN (
            'view_all_orders', 'create_dispensaries', 'edit_dispensaries',
            'view_all_communications', 'view_all_tasks', 'approve_orders'
        ) THEN
            RETURN TRUE;
        END IF;
        
        -- Agent role default permissions
        IF v_user_role = 'agent' AND p_permission_name IN (
            'view_own_orders', 'view_own_communications', 'view_own_tasks',
            'create_orders', 'create_communications', 'create_tasks'
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;
    
    RETURN v_has_permission;
END;
$$;

-- Function to log user activity
CREATE OR REPLACE FUNCTION public.log_user_activity(
    p_user_id UUID,
    p_action_type TEXT,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}',
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.user_activity_log (
        user_id, action_type, resource_type, resource_id,
        details, ip_address, user_agent, session_id,
        success, error_message
    ) VALUES (
        p_user_id, p_action_type, p_resource_type, p_resource_id,
        p_details, p_ip_address, p_user_agent, p_session_id,
        p_success, p_error_message
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- Function to soft delete user
CREATE OR REPLACE FUNCTION public.soft_delete_user(
    p_user_id UUID,
    p_deleted_by UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if deleter has permission
    IF NOT public.user_has_permission(p_deleted_by, 'delete_users') THEN
        RAISE EXCEPTION 'Insufficient permissions to delete users';
    END IF;
    
    -- Perform soft delete
    UPDATE public.profiles
    SET deleted_at = NOW(),
        deleted_by = p_deleted_by
    WHERE id = p_user_id
    AND deleted_at IS NULL;
    
    -- Log the activity
    PERFORM public.log_user_activity(
        p_deleted_by,
        'delete',
        'user',
        p_user_id,
        jsonb_build_object('action', 'soft_delete')
    );
    
    RETURN FOUND;
END;
$$;

-- Function to track order edits
CREATE OR REPLACE FUNCTION public.track_order_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Record the edit history
        INSERT INTO public.order_history (
            order_id,
            edited_by,
            previous_values,
            new_values
        ) VALUES (
            NEW.id,
            NEW.last_edited_by,
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
        
        -- Update edit count
        NEW.edit_count = COALESCE(OLD.edit_count, 0) + 1;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Function to track communication edits
CREATE OR REPLACE FUNCTION public.track_communication_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Check if significant fields changed
        IF OLD.notes != NEW.notes OR OLD.follow_up_required != NEW.follow_up_required THEN
            -- Record the edit history
            INSERT INTO public.communication_history (
                communication_id,
                edited_by,
                previous_values,
                new_values
            ) VALUES (
                NEW.id,
                NEW.last_edited_by,
                to_jsonb(OLD),
                to_jsonb(NEW)
            );
            
            -- Update edit tracking fields
            NEW.edit_count = COALESCE(OLD.edit_count, 0) + 1;
            NEW.is_edited = true;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Function to update dispensary statistics
CREATE OR REPLACE FUNCTION public.update_dispensary_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'orders' THEN
        UPDATE public.dispensary_profiles
        SET 
            last_order_date = NOW(),
            total_orders_count = total_orders_count + 1,
            total_revenue = total_revenue + NEW.total_price
        WHERE id = NEW.dispensary_id;
    ELSIF TG_TABLE_NAME = 'communications' THEN
        UPDATE public.dispensary_profiles
        SET 
            last_communication_date = NOW(),
            total_communications_count = total_communications_count + 1
        WHERE id = NEW.dispensary_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- =====================================================
-- SECTION 5: TRIGGERS
-- =====================================================

-- Trigger for order edit tracking
DROP TRIGGER IF EXISTS track_order_edits ON public.orders;
CREATE TRIGGER track_order_edits
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION public.track_order_edit();

-- Trigger for communication edit tracking
DROP TRIGGER IF EXISTS track_communication_edits ON public.communications;
CREATE TRIGGER track_communication_edits
    BEFORE UPDATE ON public.communications
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION public.track_communication_edit();

-- Trigger to update dispensary stats on new order
DROP TRIGGER IF EXISTS update_dispensary_order_stats ON public.orders;
CREATE TRIGGER update_dispensary_order_stats
    AFTER INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_dispensary_stats();

-- Trigger to update dispensary stats on new communication
DROP TRIGGER IF EXISTS update_dispensary_comm_stats ON public.communications;
CREATE TRIGGER update_dispensary_comm_stats
    AFTER INSERT ON public.communications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_dispensary_stats();

-- =====================================================
-- SECTION 6: ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

-- User Permissions Policies
CREATE POLICY "Admins can manage all permissions" ON public.user_permissions
    FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view their own permissions" ON public.user_permissions
    FOR SELECT USING (user_id = auth.uid());

-- Activity Log Policies
CREATE POLICY "Admins can view all activity logs" ON public.user_activity_log
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Management can view activity logs" ON public.user_activity_log
    FOR SELECT USING (public.is_management_or_admin());

CREATE POLICY "Users can view their own activity" ON public.user_activity_log
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert activity logs" ON public.user_activity_log
    FOR INSERT WITH CHECK (true);

-- Communication History Policies
CREATE POLICY "View communication history based on communication access" ON public.communication_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.communications c
            WHERE c.id = communication_history.communication_id
            AND (c.agent_id = auth.uid() OR public.is_management_or_admin())
        )
    );

-- Order History Policies
CREATE POLICY "View order history based on order access" ON public.order_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_history.order_id
            AND (o.agent_id = auth.uid() OR public.is_management_or_admin())
        )
    );

-- Update existing profiles policies to respect soft delete
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all active profiles" ON public.profiles
    FOR SELECT USING (public.is_admin() OR (auth.uid() = id AND deleted_at IS NULL));

-- =====================================================
-- SECTION 7: INITIAL PERMISSION GRANTS
-- =====================================================

-- Grant default permissions based on roles
-- This is a one-time setup for existing users
DO $$
DECLARE
    v_user RECORD;
BEGIN
    -- Grant permissions to admin users
    FOR v_user IN SELECT id FROM public.profiles WHERE role = 'admin' AND deleted_at IS NULL
    LOOP
        INSERT INTO public.user_permissions (user_id, permission_name, granted, granted_by)
        VALUES 
            (v_user.id, 'manage_users', true, v_user.id),
            (v_user.id, 'delete_users', true, v_user.id),
            (v_user.id, 'manage_permissions', true, v_user.id),
            (v_user.id, 'view_system_logs', true, v_user.id),
            (v_user.id, 'system_admin', true, v_user.id)
        ON CONFLICT (user_id, permission_name, resource_type, resource_id) DO NOTHING;
    END LOOP;
    
    -- Grant permissions to management users
    FOR v_user IN SELECT id FROM public.profiles WHERE role = 'management' AND deleted_at IS NULL
    LOOP
        INSERT INTO public.user_permissions (user_id, permission_name, granted, granted_by)
        VALUES 
            (v_user.id, 'view_all_orders', true, v_user.id),
            (v_user.id, 'approve_orders', true, v_user.id),
            (v_user.id, 'create_dispensaries', true, v_user.id),
            (v_user.id, 'edit_dispensaries', true, v_user.id),
            (v_user.id, 'view_all_communications', true, v_user.id),
            (v_user.id, 'view_all_tasks', true, v_user.id)
        ON CONFLICT (user_id, permission_name, resource_type, resource_id) DO NOTHING;
    END LOOP;
END $$;

-- =====================================================
-- SECTION 8: VIEWS FOR EASIER QUERYING
-- =====================================================

-- View for active users with their permissions count
CREATE OR REPLACE VIEW public.active_users_with_permissions AS
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.last_login_at,
    p.login_count,
    COUNT(DISTINCT up.permission_name) as permission_count,
    MAX(up.granted_at) as last_permission_granted
FROM public.profiles p
LEFT JOIN public.user_permissions up ON p.id = up.user_id AND up.granted = true
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.email, p.full_name, p.role, p.last_login_at, p.login_count;

-- View for dispensary analytics
CREATE OR REPLACE VIEW public.dispensary_analytics AS
SELECT 
    dp.id,
    dp.business_name,
    dp.is_active,
    dp.last_communication_date,
    dp.last_order_date,
    dp.total_orders_count,
    dp.total_communications_count,
    dp.total_revenue,
    COUNT(DISTINCT o.id) as recent_orders_count,
    COUNT(DISTINCT c.id) as recent_communications_count
FROM public.dispensary_profiles dp
LEFT JOIN public.orders o ON dp.id = o.dispensary_id 
    AND o.order_date >= NOW() - INTERVAL '30 days'
LEFT JOIN public.communications c ON dp.id = c.dispensary_id 
    AND c.interaction_date >= NOW() - INTERVAL '30 days'
GROUP BY dp.id, dp.business_name, dp.is_active, dp.last_communication_date, 
         dp.last_order_date, dp.total_orders_count, dp.total_communications_count, 
         dp.total_revenue;

-- =====================================================
-- SECTION 9: GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT ON public.user_permissions TO authenticated;
GRANT SELECT ON public.user_activity_log TO authenticated;
GRANT SELECT ON public.communication_history TO authenticated;
GRANT SELECT ON public.order_history TO authenticated;
GRANT SELECT ON public.active_users_with_permissions TO authenticated;
GRANT SELECT ON public.dispensary_analytics TO authenticated;

-- Grant insert permissions for activity logging
GRANT INSERT ON public.user_activity_log TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.user_has_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_activity TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_user TO authenticated;

-- =====================================================
-- Migration Complete
-- =====================================================
-- This migration enhances the Cannabis CRM with:
-- 1. Granular user permissions system
-- 2. Comprehensive audit trail and activity logging
-- 3. Soft delete functionality for users
-- 4. Edit tracking for orders and communications
-- 5. Enhanced dispensary analytics
-- 6. Performance optimizations with strategic indexes
-- 7. Security improvements with updated RLS policies
-- =====================================================