// SERVER-ONLY — never import this from a client component or 'use client' file.
// This module uses next/headers and Node.js crypto, which are not available in
// the browser bundle. If you accidentally import it client-side, Next.js will
// throw at build time because of the `cookies()` import.

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = 'crm-session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ---------------------------------------------------------------------------
// Secret key
// ---------------------------------------------------------------------------

/**
 * Returns the SESSION_SECRET from env.
 *
 * REQUIRED: Add SESSION_SECRET to your Vercel environment variables.
 * Generate a strong secret: `openssl rand -hex 32`
 *
 * If the variable is missing we throw — fail closed, never silently use a
 * weak default.
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'SESSION_SECRET environment variable is not set. ' +
      'Add it to your .env.local and Vercel environment variables. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// HMAC signing
// ---------------------------------------------------------------------------

// Cookie payload format: <userId>.<hmac-hex>
// The HMAC covers only the userId so the cookie expands minimally.
// The actual role is always re-fetched from the DB on each verifySession() call.

function signUserId(userId: string): string {
  const secret = getSecret();
  const sig = createHmac('sha256', secret).update(userId).digest('hex');
  return `${userId}.${sig}`;
}

function verifySignature(cookieValue: string): string | null {
  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const userId = cookieValue.slice(0, dotIndex);
  const receivedSig = cookieValue.slice(dotIndex + 1);

  if (!userId || !receivedSig) return null;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    // SESSION_SECRET missing — deny access rather than crash the request
    console.error('[session] SESSION_SECRET is not set — all sessions are invalid');
    return null;
  }

  const expectedSig = createHmac('sha256', secret).update(userId).digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    const expected = Buffer.from(expectedSig, 'hex');
    const received = Buffer.from(receivedSig, 'hex');
    if (expected.length !== received.length) return null;
    if (!timingSafeEqual(expected, received)) return null;
  } catch {
    return null;
  }

  return userId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VerifiedSession {
  userId: string;
  role: string;
  name: string;
}

/**
 * Set the crm-session cookie after a successful PIN login.
 * Call this from a server action only.
 *
 * Fail-soft: if SESSION_SECRET is missing we log a warning and return without
 * setting the cookie — login still succeeds. verifySession() will return null
 * (fail closed) until the secret is configured, so protected actions stay
 * denied while the app remains usable.
 */
export async function setSessionCookie(userId: string): Promise<void> {
  let signed: string;
  try {
    signed = signUserId(userId);
  } catch (err) {
    console.error(
      '[session] setSessionCookie: could not sign cookie — SESSION_SECRET may be missing. ' +
      'Server-side session will not be set until the secret is configured. Error:',
      err
    );
    return; // do not throw — let login proceed without the server cookie
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Clear the crm-session cookie on logout.
 * Call this from a server action only.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Verify the current crm-session cookie and return the authenticated user.
 *
 * - Validates the HMAC signature (tamper detection)
 * - Re-fetches the user's current role from public.users (never trusts a
 *   role baked into the cookie)
 * - Returns null on any failure — FAIL CLOSED
 */
export async function verifySession(): Promise<VerifiedSession | null> {
  let cookieStore: Awaited<ReturnType<typeof cookies>>;
  try {
    cookieStore = await cookies();
  } catch {
    return null;
  }

  const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookieValue) return null;

  const userId = verifySignature(cookieValue);
  if (!userId) return null;

  // Re-read role from DB — do not trust anything in the cookie beyond userId
  let serviceClient: Awaited<ReturnType<typeof createServiceClient>>;
  try {
    serviceClient = await createServiceClient();
  } catch (err) {
    console.error('[session] Failed to create service client:', err);
    return null;
  }

  const { data, error } = await serviceClient
    .from('users')
    .select('id, name, role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    userId: data.id,
    role: data.role,
    name: data.name,
  };
}

// ---------------------------------------------------------------------------
// Role guards
// ---------------------------------------------------------------------------

export type UnauthorizedResult = { authorized: false; reason: string };
export type AuthorizedResult<T> = { authorized: true; session: T };

/**
 * Verify session and assert the user's role is in the allowed list.
 * Returns { authorized: true, session } or { authorized: false, reason }.
 *
 * Usage in a server action:
 *   const auth = await requireRole(['admin', 'management']);
 *   if (!auth.authorized) return { error: auth.reason };
 *   // auth.session.role, auth.session.userId are safe to use
 */
export async function requireRole(
  allowedRoles: string[]
): Promise<AuthorizedResult<VerifiedSession> | UnauthorizedResult> {
  const session = await verifySession();
  if (!session) {
    return { authorized: false, reason: 'No valid session' };
  }
  if (!allowedRoles.includes(session.role)) {
    return {
      authorized: false,
      reason: `Role '${session.role}' is not authorized for this action`,
    };
  }
  return { authorized: true, session };
}

/**
 * Convenience guard for finance/management screens.
 * Allowed roles: admin, management.
 */
export async function requireFinance(): Promise<
  AuthorizedResult<VerifiedSession> | UnauthorizedResult
> {
  return requireRole(['admin', 'management']);
}
