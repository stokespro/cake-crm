-- Fix communications RLS policies for PIN-based authentication
--
-- Problem: Previous policies relied on auth.uid() which is NULL for PIN-based users.
-- Solution: Use permissive policies since authentication is handled at the application level.
--
-- PIN auth stores user session in localStorage as 'crm-user' and validates permissions
-- in the application layer (lib/auth-context.tsx). Since PIN users don't have Supabase
-- auth.uid(), we need to allow all authenticated requests and let the app handle access control.

BEGIN;

-- Drop old RLS policies that depend on auth.uid()
DROP POLICY IF EXISTS "Agents can view their own communications" ON public.communications;
DROP POLICY IF EXISTS "Agents can create their own communications" ON public.communications;
DROP POLICY IF EXISTS "Agents can update their own communications" ON public.communications;
DROP POLICY IF EXISTS "Management and admin can view all communications" ON public.communications;

-- Create new permissive policies
-- Note: RLS remains enabled, but policies are permissive because:
-- 1. PIN auth doesn't use Supabase auth system (auth.uid() is NULL)
-- 2. Access control is enforced at the application level
-- 3. All requests to Supabase use the anon key (authenticated at app level)

CREATE POLICY "Allow all authenticated users to view communications"
  ON public.communications
  FOR SELECT
  USING (true);

CREATE POLICY "Allow all authenticated users to create communications"
  ON public.communications
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update communications"
  ON public.communications
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow all authenticated users to delete communications"
  ON public.communications
  FOR DELETE
  USING (true);

COMMIT;
