const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const targetIds = [
  'a8e20931-a19f-4c70-a788-7ac7a9df2372',
  '26b84324-80b6-4046-84d9-976a2882f379'
];

async function cleanupAll() {
  console.log('--- Cleaning local data/notifications.json ---');
  const notifPath = path.join(__dirname, '../data/notifications.json');
  if (fs.existsSync(notifPath)) {
    const notifs = JSON.parse(fs.readFileSync(notifPath, 'utf8'));
    const initialLen = notifs.length;
    const filtered = notifs.filter(n => !targetIds.includes(n.post_id) && !targetIds.includes(n.id));
    if (filtered.length !== initialLen) {
      fs.writeFileSync(notifPath, JSON.stringify(filtered, null, 2), 'utf8');
      console.log(`Removed ${initialLen - filtered.length} notifications referencing the target story IDs.`);
    } else {
      console.log('No matching notifications found in notifications.json');
    }
  }

  console.log('\n--- Checking Supabase tables across the database ---');
  const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');
  
  // Login with test_doc_user
  await sb.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });

  const tables = ['stories', 'story_likes', 'story_views', 'notifications', 'posts', 'reports'];
  for (const t of tables) {
    try {
      // Check as id
      const { data: byId } = await sb.from(t).select('*').in('id', targetIds);
      if (byId && byId.length > 0) {
        console.log(`Found in table ${t} by id:`, byId.map(r => r.id));
        const { error: delErr } = await sb.from(t).delete().in('id', targetIds);
        console.log(`Deleted from ${t} by id. Error:`, delErr?.message || 'none');
      }

      // Check as story_id or post_id if applicable
      if (t === 'story_likes' || t === 'story_views') {
        const { data: byStoryId } = await sb.from(t).select('*').in('story_id', targetIds);
        if (byStoryId && byStoryId.length > 0) {
          console.log(`Found in table ${t} by story_id:`, byStoryId.length);
          await sb.from(t).delete().in('story_id', targetIds);
        }
      }
      if (t === 'notifications') {
        const { data: byPostId } = await sb.from(t).select('*').in('post_id', targetIds);
        if (byPostId && byPostId.length > 0) {
          console.log(`Found in table notifications by post_id:`, byPostId.length);
          await sb.from(t).delete().in('post_id', targetIds);
        }
      }
    } catch (err) {
      console.log(`Notice on table ${t}:`, err.message);
    }
  }

  console.log('\nDatabase cleanup complete.');
}

cleanupAll();
