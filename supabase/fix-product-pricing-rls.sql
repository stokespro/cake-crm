-- FIX: Product pricing RLS policy issues
-- The migration had an incorrect policy on a view which would cause errors

BEGIN;

-- Drop the incorrect policy on the view (views can't have RLS policies directly)
DROP POLICY IF EXISTS "All authenticated users can view pricing view" ON product_pricing_view;

-- Update the existing product_pricing RLS policy to use the security definer function
-- First drop the existing problematic policy
DROP POLICY IF EXISTS "Management and admin can manage product pricing" ON public.product_pricing;

-- Create new policy using the security definer function
CREATE POLICY "Management and admin can manage product pricing" 
    ON public.product_pricing
    FOR ALL 
    USING (public.is_management_or_admin());

-- Grant SELECT permission on the view to authenticated users
-- The underlying table policies will still apply
GRANT SELECT ON product_pricing_view TO authenticated;

COMMIT;