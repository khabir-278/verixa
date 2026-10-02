const { createClient } = require('@supabase/supabase-js');

const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function listAllStories() {
  const { data, error } = await sb.from('stories').select('id, user_id, created_at, expires_at');
  if (error) {
    console.error('Anon query error:', error.message);
  } else {
    console.log(`Anon query returned ${data?.length || 0} stories:`, data);
  }

  // Also query after login with test_doc_user
  await sb.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });
  const { data: authStories, error: authErr } = await sb.from('stories').select('id, user_id, created_at, expires_at');
  if (authErr) {
    console.error('Auth query error:', authErr.message);
  } else {
    console.log(`Auth query returned ${authStories?.length || 0} stories:`, authStories);
  }
}

listAllStories();
