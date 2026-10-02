import { supabase } from '../src/lib/supabase';

async function testAuth() {
  console.log('Testing User B login...');
  const resB = await supabase.auth.signInWithPassword({
    email: 'qa_user_b@verixa.internal',
    password: 'VerixaQA#2026PeerSecure',
  });
  console.log('User B login result:', resB.error ? resB.error.message : `SUCCESS! (id: ${resB.data.user?.id})`);

  console.log('\nTesting User A login...');
  const candidates = [
    'VerixaQA#2026PeerSecure',
    'VerixaDoc#pase.co',
    'VerixaDoc#2026',
    'Auditor#2026!',
    'Password123!',
    'Verixa123!',
  ];
  for (const pw of candidates) {
    const resA = await supabase.auth.signInWithPassword({
      email: 'test_auditor@verixa.com',
      password: pw,
    });
    if (!resA.error) {
      console.log(`User A login SUCCESS with password: ${pw} (id: ${resA.data.user?.id})`);
      return;
    }
  }
  console.log('User A login failed with test candidates.');
}

testAuth();
