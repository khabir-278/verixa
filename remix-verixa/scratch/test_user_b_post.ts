import { supabase } from '../src/lib/supabase';

async function testUserBPost() {
  const loginRes = await supabase.auth.signInWithPassword({
    email: 'qa_user_b@verixa.internal',
    password: 'VerixaQA#2026PeerSecure',
  });
  if (loginRes.error) {
    console.error('User B login error:', loginRes.error.message);
    return;
  }
  console.log('User B logged in successfully! User ID:', loginRes.data.user.id);

  // Test inserting a post as User B
  const testPostId = crypto.randomUUID();
  const { data, error } = await supabase.from('posts').insert({
    id: testPostId,
    user_id: loginRes.data.user.id,
    caption: '[VERIXA-QA] Temporary RLS write test for User B',
    visibility: 'public',
    moderation_status: 'approved',
    ai_safety_score: 99,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select();

  console.log('User B post insert result:', { data, error });

  if (!error) {
    // Clean up immediately
    await supabase.from('posts').delete().eq('id', testPostId);
    console.log('Temporary test post cleaned up.');
  }
}

testUserBPost();
