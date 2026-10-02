const https = require('https');
https.get('https://jnbaumemwxydjktwedtz.supabase.co/storage/v1/object/public/app-files/c7aa8500-26f1-4c6f-ac9d-deaf95373544/brand/verixa-neon-glass-watermark.png', (res) => {
  console.log('HTTP STATUS:', res.statusCode, res.headers['content-type']);
});
