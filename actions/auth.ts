'use server';

import { createClient } from '@/lib/supabase/server';

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

  const { data, error } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('pin', pin)
    .single();

  if (error || !data) {
    return { success: false, error: 'Invalid PIN' };
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
