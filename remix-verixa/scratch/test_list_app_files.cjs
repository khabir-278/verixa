const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function listFiles() {
  const { data, error } = await sb.storage.from('app-files').list('');
  console.log('Root files in app-files:', data, 'Error:', error);
}

listFiles();
