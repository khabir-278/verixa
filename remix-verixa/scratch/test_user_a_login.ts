import { supabase } from '../src/lib/supabase';

async function testUserA() {
  const email = 'test_doc_user@verixa.com';
  const supabaseUrl = 'https://jnbaumemwxydjktwedtz.supabase.co';
  const passwords = [
    'VerixaDoc#' + supabaseUrl.slice(-8),
    'VerixaQA#2026PeerSecure',
    'VerixaDoc#2026',
  ];

  for (const pw of passwords) {
    console.log(`Trying ${email} with password: ${pw}...`);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });
    if (error) {
      console.log('Error:', error.message);
    } else {
      console.log('SUCCESS! Authenticated as User A:', data.user.id, data.user.email);
      return data;
    }
  }
}

testUserA();
