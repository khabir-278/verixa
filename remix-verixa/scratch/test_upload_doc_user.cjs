const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function test() {
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });
  console.log('Login result:', authData?.user?.id, 'Error:', authErr?.message);
  if (authData?.user) {
    const fileBuffer = fs.readFileSync(path.join(__dirname, '../public/verixa-logo.jpg'));
    const uploadRes = await sb.storage
      .from('app-files')
      .upload(`${authData.user.id}/brand/verixa-logo.jpg`, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    console.log('Upload result:', uploadRes);
    const { data: pubUrl } = sb.storage.from('app-files').getPublicUrl(`${authData.user.id}/brand/verixa-logo.jpg`);
    console.log('FINAL PUBLIC LOGO URL:', pubUrl?.publicUrl);
  }
}

test();
