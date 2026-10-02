const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function test() {
  const { data, error } = await sb.storage.listBuckets();
  console.log('Buckets:', data, 'Error:', error);
}

test();
