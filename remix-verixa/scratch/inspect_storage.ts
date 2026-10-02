import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

const USER_A_EMAIL = 'test_doc_user@verixa.com';
const USER_A_PASS = 'VerixaDoc#abase.co';

async function inspectStorage() {
  console.log('--- Inspecting Supabase Storage Buckets ---');
  const clientA = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authErr } = await clientA.auth.signInWithPassword({
    email: USER_A_EMAIL,
    password: USER_A_PASS,
  });
  if (authErr) {
    console.error('User A auth error:', authErr.message);
  } else {
    console.log('User A authenticated:', authData.user?.id);
  }

  // 1. List buckets with clientA
  const { data: bucketsA, error: bErrA } = await clientA.storage.listBuckets();
  console.log('clientA.storage.listBuckets():', { buckets: bucketsA, error: bErrA?.message });

  // 2. Unauthenticated client listBuckets
  const clientAnon = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data: bucketsAnon, error: bErrAnon } = await clientAnon.storage.listBuckets();
  console.log('clientAnon.storage.listBuckets():', { buckets: bucketsAnon, error: bErrAnon?.message });

  // 3. Test getBucket on 'app-files'
  const { data: appFilesBucket, error: afErr } = await clientA.storage.getBucket('app-files');
  console.log('clientA.storage.getBucket("app-files"):', { bucket: appFilesBucket, error: afErr?.message });

  // 4. Test listing files in 'app-files' if getBucket returned anything
  const { data: files, error: fErr } = await clientA.storage.from('app-files').list();
  console.log('clientA.storage.from("app-files").list():', { files, error: fErr?.message });

  // 5. Test if any other buckets exist (e.g. avatars, posts, default, etc.)
  for (const bName of ['avatars', 'posts', 'media', 'images', 'public', 'files']) {
    const { data: b, error: e } = await clientA.storage.getBucket(bName);
    if (!e && b) {
      console.log(`Found bucket '${bName}':`, b);
    }
  }
}

inspectStorage().catch(console.error);
