-- PROMOTE CURRENT USER TO ADMIN ROLE
-- Execute this after running the RLS policy fixes

-- Replace 'your-email@domain.com' with the actual email address of the user who should be admin
SELECT public.promote_user_to_admin('stokes@cakeoklahoma.com');

-- Verify the promotion worked
SELECT id, email, role, full_name, created_at, updated_at 
FROM public.profiles 
WHERE email = 'stokes@cakeoklahoma.com';

-- Alternative: If you know the user's UUID, you can update directly
-- UPDATE public.profiles SET role = 'admin', updated_at = now() WHERE id = 'USER_UUID_HERE';