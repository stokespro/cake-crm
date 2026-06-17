'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { setSessionCookie, clearSessionCookie } from '@/lib/auth/session';

export interface SessionUser {
  id: string;
  name: string;
  role: string;
}

export async function authenticateByPin(pin: string): Promise<{ success: boolean; user?: SessionUser; error?: string }> {
  if (!/^\d{4}$/.test(pin)) {
    return { success: false, error: 'Invalid PIN format' };
  }

  const supabase = await createClient();
  const serviceSupabase = await createServiceClient();

  const { data, error } = await serviceSupabase
    .from('users')
    .select('id, name, role')
    .eq('pin', pin)
    .single();

  if (error || !data) {
    return { success: false, error: 'Invalid PIN' };
  }

  const email = `${data.id}@cake.internal`;
  const password = `cake-${data.id}-${pin}-auth`;

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    console.error('Shadow auth sign-in failed:', authError);
  }

  // Set a secure, HttpOnly, server-readable session cookie containing the
  // user's id signed with SESSION_SECRET. The role is never baked in — it is
  // re-read from public.users on every verifySession() call.
  // Belt-and-suspenders guard: cookie failure must never block a successful login.
  try {
    await setSessionCookie(data.id);
  } catch (err) {
    console.error('[auth] setSessionCookie threw unexpectedly — login will continue without server cookie:', err);
  }

  return {
    success: true,
    user: {
      id: data.id,
      name: data.name,
      role: data.role,
    },
  };
}

/**
 * Server action: clear the crm-session cookie.
 * Call this from the client-side logout handler alongside localStorage clearing.
 */
export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
}
