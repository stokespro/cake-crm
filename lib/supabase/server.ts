import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || supabaseUrl === 'your_supabase_project_url') {
    throw new Error(
      'Missing or invalid NEXT_PUBLIC_SUPABASE_URL. Please check your .env.local file and follow the setup instructions in SETUP.md'
    )
  }

  if (!supabaseAnonKey || supabaseAnonKey === 'your_supabase_anon_key') {
    throw new Error(
      'Missing or invalid NEXT_PUBLIC_SUPABASE_ANON_KEY. Please check your .env.local file and follow the setup instructions in SETUP.md'
    )
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// Returns a true service-role client that is never scoped to a user session.
// Uses @supabase/supabase-js directly (not @supabase/ssr) so the SSR cookie
// layer cannot override the Authorization header with a user JWT.
// Kept async so all existing `await createServiceClient()` callers work unchanged.
export async function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || url === 'your_supabase_project_url') {
    throw new Error(
      'Missing or invalid NEXT_PUBLIC_SUPABASE_URL. Please check your .env.local file and follow the setup instructions in SETUP.md'
    )
  }

  if (!serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Please check your .env.local file and follow the setup instructions in SETUP.md'
    )
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Explicit Authorization header guarantees service_role regardless of
    // any ambient session state in the Node.js environment.
    global: { headers: { Authorization: `Bearer ${serviceKey}` } },
  })
}
