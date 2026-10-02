const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function uploadNeonGlassWatermark() {
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: 'test_doc_user@verixa.com',
    password: 'VerixaDoc#abase.co',
  });
  if (authErr || !authData?.user) {
    console.error('Login failed:', authErr);
    return;
  }
  
  const fileBuffer = fs.readFileSync(path.join(__dirname, 'preview_treatment_2_neon_glass.png'));
  const res = await sb.storage
    .from('app-files')
    .upload(`${authData.user.id}/brand/verixa-neon-glass-watermark.png`, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    });
  console.log('Upload result:', res);
  const { data: pubUrl } = sb.storage.from('app-files').getPublicUrl(`${authData.user.id}/brand/verixa-neon-glass-watermark.png`);
  console.log('PUBLIC URL NEON GLASS:', pubUrl?.publicUrl);
}

uploadNeonGlassWatermark();
