import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type MigrationResult = {
  userId: string;
  email: string;
  password: string;
  authId?: string;
  status: 'success' | 'error';
  error?: string;
};

async function migrateUsers() {
  console.log('Starting auth account migration...\n');

  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, pin, role');

  if (error || !users) {
    console.error('Failed to fetch users:', error?.message || error);
    process.exit(1);
  }

  console.log(`Found ${users.length} users to migrate\n`);

  const results: MigrationResult[] = [];

  for (const user of users) {
    const email = `${user.id}@cake.internal`;
    const password = `cake-${user.id}-${user.pin}-auth`;

    console.log(`Processing user ${user.id} (${user.name})...`);

    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          cake_user_id: user.id,
          name: user.name,
          role: user.role,
        },
      });

      if (authError || !authData?.user) {
        throw new Error(authError?.message || 'Failed to create auth user');
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ auth_id: authData.user.id })
        .eq('id', user.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      results.push({
        userId: user.id,
        email,
        password,
        authId: authData.user.id,
        status: 'success',
      });

      console.log(`✓ Success - auth_id: ${authData.user.id}\n`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`✗ Failed: ${errorMsg}\n`);

      results.push({
        userId: user.id,
        email,
        password,
        status: 'error',
        error: errorMsg,
      });
    }
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const outputFile = path.join(process.cwd(), `migration-results-${timestamp}.json`);

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  console.log(`\n=== Migration Complete ===`);
  console.log(`Total: ${users.length}`);
  console.log(`Success: ${results.filter((r) => r.status === 'success').length}`);
  console.log(`Failed: ${results.filter((r) => r.status === 'error').length}`);
  console.log(`\nResults saved to: ${outputFile}`);
  console.log('\n⚠️  IMPORTANT: Save this file securely! It contains generated passwords.');
}

migrateUsers();
