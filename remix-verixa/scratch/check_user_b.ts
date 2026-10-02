import { supabase } from '../src/lib/supabase';

async function check() {
  const { data: profiles, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }
  console.log('Total profiles count:', profiles.length);
  const userB = profiles.find((p: any) => p.username === 'qa_user_b' || p.email === 'qa_user_b@verixa.internal');
  console.log('User B found:', userB ? JSON.stringify(userB, null, 2) : 'NOT_FOUND');
  console.log('All usernames:', profiles.map((p: any) => p.username));
}

check();
