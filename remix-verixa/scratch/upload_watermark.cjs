const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function uploadWatermark() {
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });
  if (authErr || !authData?.user) {
    console.error('Login failed:', authErr);
    return;
  }
  
  const fileBuffer = fs.readFileSync(path.join(__dirname, '../public/verixa-watermark.png'));
  const uploadRes = await sb.storage
    .from('app-files')
    .upload(`${authData.user.id}/brand/verixa-watermark.png`, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    });
  console.log('Upload result:', uploadRes);
  const { data: pubUrl } = sb.storage.from('app-files').getPublicUrl(`${authData.user.id}/brand/verixa-watermark.png`);
  console.log('FINAL PUBLIC WATERMARK URL:', pubUrl?.publicUrl);
}

uploadWatermark();
