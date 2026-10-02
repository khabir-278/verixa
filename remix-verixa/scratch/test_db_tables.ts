import { supabase } from '../src/lib/supabase';

async function testTables() {
  console.log('Testing table accessibility...');
  const tables = ['posts', 'comments', 'likes', 'post_likes', 'follows', 'stories', 'messages', 'notifications', 'reports', 'saved_posts'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('id').limit(1);
    console.log(`Table ${t}:`, error ? `ERROR: ${error.message}` : `OK (count >= ${data?.length})`);
  }
}

testTables();
