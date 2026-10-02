const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function uploadV7() {
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });
  if (authErr || !authData?.user) {
    console.error('Login failed:', authErr);
    return;
  }
  
  // 1. Upload high-fidelity solid white baked watermark
  const fileSolid = fs.readFileSync(path.join(__dirname, 'preview_opacity_70.png'));
  const res1 = await sb.storage
    .from('app-files')
    .upload(`${authData.user.id}/brand/verixa-studio-watermark-v7.png`, fileSolid, {
      contentType: 'image/png',
      upsert: true,
    });
  console.log('Upload v7 solid result:', res1);
  const { data: url1 } = sb.storage.from('app-files').getPublicUrl(`${authData.user.id}/brand/verixa-studio-watermark-v7.png`);
  console.log('PUBLIC URL V7 SOLID:', url1?.publicUrl);
}

uploadV7();
