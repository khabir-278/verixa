import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

async function verify() {
  const c = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });

  const a = await c.storage.from('app-files').list('c7aa8500-26f1-4c6f-ac9d-deaf95373544/posts');
  const b = await c.storage.from('app-files').list('9cd3413e-94ae-4bc8-b64d-ba42c21599be/posts');
  const root = await c.storage.from('app-files').list();

  console.log('User A posts folder:', a.data);
  console.log('User B posts folder:', b.data);
  console.log('Root folder items:', root.data?.map((o) => o.name));
}

verify().catch(console.error);
