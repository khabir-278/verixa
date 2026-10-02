import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

async function checkPolicies() {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY);
  // Test if we can read storage.buckets or storage.objects
  const { data: bData, error: bErr } = await client.from('buckets').select('*');
  console.log('Query buckets:', { bData, bErr: bErr?.message });

  // Test RPC or public functions
  const { data: rpcData, error: rpcErr } = await client.rpc('get_storage_policies');
  console.log('RPC get_storage_policies:', { rpcData, rpcErr: rpcErr?.message });
}

checkPolicies().catch(console.error);
