const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const targetIds = [
  'a8e20931-a19f-4c70-a788-7ac7a9df2372',
  '26b84324-80b6-4046-84d9-976a2882f379'
];

console.log('=== TARGET STORY IDS TO REMOVE ===');
console.log(targetIds);

async function run() {
  const results = {
    localJson: { found: [], deleted: [] },
    supabase: { found: [], deleted: [], errors: [] },
  };

  // 1. Check & delete from local data/stories.json
  const storiesJsonPath = path.join(__dirname, '../data/stories.json');
  if (fs.existsSync(storiesJsonPath)) {
    try {
      const raw = fs.readFileSync(storiesJsonPath, 'utf8');
      const stories = JSON.parse(raw);
      const toKeep = [];
      for (const s of stories) {
        if (targetIds.includes(s.id)) {
          results.localJson.found.push({ id: s.id, userId: s.userId || s.user_id, mediaUrl: s.mediaUrl || s.media_url });
          results.localJson.deleted.push(s.id);
        } else {
          toKeep.push(s);
        }
      }
      if (results.localJson.deleted.length > 0) {
        fs.writeFileSync(storiesJsonPath, JSON.stringify(toKeep, null, 2), 'utf8');
        console.log(`[Local JSON] Removed ${results.localJson.deleted.length} stories from data/stories.json`);
      } else {
        console.log('[Local JSON] None of the target story IDs found in data/stories.json');
      }
    } catch (err) {
      console.error('[Local JSON Error]:', err.message);
    }
  } else {
    console.log('[Local JSON] data/stories.json does not exist');
  }

  // 2. Check & delete from Supabase DB
  const sbUrl = 'https://jnbaumemwxydjktwedtz.supabase.co';
  const sbKey = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';
  const sb = createClient(sbUrl, sbKey);

  // Authenticate as test_doc_user or check with client
  try {
    const { data: authData } = await sb.auth.signInWithPassword({
      email: 'test_doc_user@verixa.com',
      password: 'VerixaDoc#abase.co',
    });
    console.log('[Supabase Auth] Logged in as:', authData?.user?.email || 'anon');
  } catch (authErr) {
    console.warn('[Supabase Auth Notice]:', authErr.message);
  }

  try {
    // Check if stories exist in Supabase
    const { data: existingStories, error: fetchErr } = await sb
      .from('stories')
      .select('*')
      .in('id', targetIds);

    if (fetchErr) {
      console.error('[Supabase Fetch Error]:', fetchErr.message);
      results.supabase.errors.push(fetchErr.message);
    } else {
      console.log(`[Supabase DB] Found ${existingStories?.length || 0} stories matching target IDs:`, existingStories);
      if (existingStories && existingStories.length > 0) {
        results.supabase.found = existingStories.map(s => s.id);
        
        // Delete related story likes / views first if tables exist
        try {
          await sb.from('story_likes').delete().in('story_id', targetIds);
        } catch (e) {}
        try {
          await sb.from('story_views').delete().in('story_id', targetIds);
        } catch (e) {}

        // Delete stories
        const { error: delErr } = await sb
          .from('stories')
          .delete()
          .in('id', targetIds);

        if (delErr) {
          console.error('[Supabase Delete Error]:', delErr.message);
          results.supabase.errors.push(delErr.message);
        } else {
          results.supabase.deleted = existingStories.map(s => s.id);
          console.log(`[Supabase DB] Successfully deleted ${results.supabase.deleted.length} stories from Supabase`);
        }
      }
    }
  } catch (err) {
    console.error('[Supabase Operation Exception]:', err.message);
    results.supabase.errors.push(err.message);
  }

  // 3. Also invoke backend API delete endpoint if server is running
  for (const id of targetIds) {
    try {
      const resp = await fetch(`http://localhost:3000/api/stories/${id}`, {
        method: 'DELETE'
      });
      const data = await resp.json();
      console.log(`[Server API DELETE /api/stories/${id}]:`, data);
    } catch (apiErr) {
      console.log(`[Server API Notice for ${id}]:`, apiErr.message);
    }
  }

  console.log('\n=== FINAL SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));
}

run();
