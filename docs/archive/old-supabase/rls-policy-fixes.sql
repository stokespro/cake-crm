-- RLS POLICY FIXES FOR CIRCULAR DEPENDENCY ISSUE
-- Execute this script in Supabase SQL Editor

-- 1. DROP PROBLEMATIC ADMIN POLICIES
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Management and admin can manage dispensaries" ON public.dispensary_profiles;
DROP POLICY IF EXISTS "Management and admin can manage products" ON public.products;
DROP POLICY IF EXISTS "Management and admin can view all communications" ON public.communications;
DROP POLICY IF EXISTS "Management and admin can manage all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Management and admin can manage all orders" ON public.orders;

-- 2. CREATE SECURITY DEFINER FUNCTION TO CHECK ADMIN STATUS
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id AND role = 'admin'
    );
END;
$$;

-- 3. CREATE SECURITY DEFINER FUNCTION TO CHECK MANAGEMENT OR ADMIN STATUS
CREATE OR REPLACE FUNCTION public.is_management_or_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id AND role IN ('management', 'admin')
    );
END;
$$;

-- 4. CREATE NEW ADMIN POLICIES USING SECURITY DEFINER FUNCTIONS

-- Profiles - Admin can view all profiles
CREATE POLICY "Admin can view all profiles" ON public.profiles
    FOR SELECT USING (public.is_admin());

-- Profiles - Admin can update all profiles  
CREATE POLICY "Admin can update all profiles" ON public.profiles
    FOR UPDATE USING (public.is_admin());

-- Profiles - Admin can insert profiles
CREATE POLICY "Admin can insert profiles" ON public.profiles
    FOR INSERT WITH CHECK (public.is_admin());

-- Dispensaries - Management and admin can manage
CREATE POLICY "Management and admin can manage dispensaries" ON public.dispensary_profiles
    FOR ALL USING (public.is_management_or_admin());

-- Products - Management and admin can manage
CREATE POLICY "Management and admin can manage products" ON public.products
    FOR ALL USING (public.is_management_or_admin());

-- Communications - Management and admin can view all
CREATE POLICY "Management and admin can view all communications" ON public.communications
    FOR SELECT USING (public.is_management_or_admin());

-- Tasks - Management and admin can manage all
CREATE POLICY "Management and admin can manage all tasks" ON public.tasks
    FOR ALL USING (public.is_management_or_admin());

-- Orders - Management and admin can manage all
CREATE POLICY "Management and admin can manage all orders" ON public.orders
    FOR ALL USING (public.is_management_or_admin());

-- 5. CREATE FUNCTION TO PROMOTE USER TO ADMIN
CREATE OR REPLACE FUNCTION public.promote_user_to_admin(user_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count integer;
BEGIN
    UPDATE public.profiles 
    SET role = 'admin', updated_at = now()
    WHERE email = user_email;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    IF updated_count = 0 THEN
        RETURN 'User not found: ' || user_email;
    ELSE
        RETURN 'Successfully promoted ' || user_email || ' to admin role';
    END IF;
END;
$$;

-- 6. CREATE FUNCTION TO GET USER PROFILE SAFELY
CREATE OR REPLACE FUNCTION public.get_user_profile(user_id uuid DEFAULT auth.uid())
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    profile_data json;
BEGIN
    SELECT to_json(p.*) INTO profile_data
    FROM public.profiles p
    WHERE p.id = user_id;
    
    IF profile_data IS NULL THEN
        RETURN json_build_object(
            'id', user_id,
            'email', (SELECT email FROM auth.users WHERE id = user_id),
            'role', 'agent',
            'full_name', null,
            'phone', null,
            'created_at', now(),
            'updated_at', now()
        );
    END IF;
    
    RETURN profile_data;
END;
$$;

-- 7. GRANT EXECUTE PERMISSIONS ON FUNCTIONS
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_management_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(text) TO service_role;