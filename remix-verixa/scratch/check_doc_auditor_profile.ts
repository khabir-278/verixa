import { supabase } from '../src/lib/supabase';

async function check() {
  const { data, error } = await supabase.from('profiles').select('*').eq('username', 'doc_auditor').single();
  console.log('doc_auditor profile data:', data);
  console.log('doc_auditor profile error:', error);
}

check();
