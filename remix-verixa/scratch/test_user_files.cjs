const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function testPublic() {
  const { data: list } = await sb.storage.from('app-files').list('05d45ada-a9af-440a-9f0f-c09d73139521/profileImages');
  console.log('Profile images:', list);
  if (list && list.length > 0) {
    const { data } = sb.storage.from('app-files').getPublicUrl(`05d45ada-a9af-440a-9f0f-c09d73139521/profileImages/${list[0].name}`);
    console.log('Public URL:', data.publicUrl);
  }
}

testPublic();
