import { createClient } from '@supabase/supabase-js';

const url = 'https://jnbaumemwxydjktwedtz.supabase.co';
const key = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

async function testDualClients() {
  const clientB = createClient(url, key, { auth: { persistSession: false } });
  const loginB = await clientB.auth.signInWithPassword({
    email: 'qa_user_b@verixa.internal',
    password: 'VerixaQA#2026PeerSecure',
  });
  console.log('Client B logged in:', loginB.data.user?.id);

  const clientA = createClient(url, key, { auth: { persistSession: false } });
  const loginA = await clientA.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });
  console.log('Client A login attempt:', loginA.error ? loginA.error.message : loginA.data.user?.id);
}

testDualClients();
