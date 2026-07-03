'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { setSessionCookie, clearSessionCookie, verifySession } from '@/lib/auth/session';

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

/**
 * Server action: return the CURRENT authenticated user's id/name/role, read
 * fresh from `public.users` via the signed `crm-session` cookie.
 *
 * Why this exists: the client-side session (`localStorage['crm-user']`) is
 * only ever populated once, at PIN-login time (see `authenticateByPin`
 * above). If an admin changes a user's role directly in the database (e.g.
 * via the Users admin page or a one-off SQL update) while that user is
 * already logged in — which is the normal case for long-lived kiosk/wall-
 * display sessions — their cached client-side role goes stale and never
 * self-corrects until they explicitly log out and back in. Server actions
 * always re-verify the role fresh (via `requireRole`/`verifySession`), so
 * reads/writes that are actually gated stay correct; but client-side UI
 * gates (e.g. "does this role see the Mark Complete button?") were relying
 * on the stale cached value and could hide controls a user's role now
 * legitimately has access to (or, in principle, keep showing controls a
 * demoted role should no longer see).
 *
 * Callers should use this to periodically reconcile their cached session
 * (see `AuthProvider` and the cultivation wall-display pages) rather than
 * trusting `localStorage['crm-user']` indefinitely.
 */
export async function getCurrentSession(): Promise<SessionUser | null> {
  const session = await verifySession();
  if (!session) return null;
  return {
    id: session.userId,
    name: session.name,
    role: session.role,
  };
}
