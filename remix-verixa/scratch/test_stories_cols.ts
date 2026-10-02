import { supabase } from '../src/lib/supabase';

async function testStoriesCols() {
  const { data, error } = await supabase.from('stories').select('id, views_count, viewed_by, likes_count, liked_by').limit(1);
  console.log('Stories cols:', { data, error });
}

testStoriesCols();
