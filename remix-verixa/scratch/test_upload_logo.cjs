const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient('https://jnbaumemwxydjktwedtz.supabase.co', 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2');

async function uploadLogo() {
  const fileBuffer = fs.readFileSync(path.join(__dirname, '../public/verixa-logo.jpg'));
  const { data, error } = await sb.storage
    .from('app-files')
    .upload('assets/verixa-logo.jpg', fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  
  console.log('Upload result:', data, 'Error:', error);
  const { data: publicData } = sb.storage.from('app-files').getPublicUrl('assets/verixa-logo.jpg');
  console.log('Public URL:', publicData?.publicUrl);
}

uploadLogo();
