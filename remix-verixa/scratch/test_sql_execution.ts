import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

async function testRpc() {
  const c = createClient(SUPABASE_URL, SUPABASE_KEY);
  for (const fn of ['exec_sql', 'execute_sql', 'run_sql', 'exec', 'query']) {
    const { data, error } = await c.rpc(fn, { query: 'SELECT 1;' });
    console.log(`RPC ${fn}:`, { data, error: error?.message });
  }
}

testRpc().catch(console.error);
