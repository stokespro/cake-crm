import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
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

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}