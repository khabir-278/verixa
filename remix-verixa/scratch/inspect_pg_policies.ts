import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

async function inspectPolicies() {
  const clientA = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  await clientA.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });

  // Try querying pg_policies
  const { data: pData, error: pErr } = await clientA.from('pg_policies').select('*');
  console.log('from(pg_policies):', { pData, pErr: pErr?.message });

  // Try querying pg_tables
  const { data: tData, error: tErr } = await clientA.from('pg_tables').select('*');
  console.log('from(pg_tables):', { tData, tErr: tErr?.message });
}

inspectPolicies().catch(console.error);
