'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

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

  return {
    success: true,
    user: {
      id: data.id,
      name: data.name,
      role: data.role,
    },
  };
}
