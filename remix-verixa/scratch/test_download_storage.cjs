const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
} else {
  dotenv.config();
}

const DEFAULT_SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(url, key);

async function testDownload() {
  const testPath = '1e71840f-a4ce-4b73-bbf8-686e7235d3c9/audio/voice_1789421138963_2tut3.webm';
  console.log('Testing download for:', testPath);
  const { data, error } = await supabase.storage.from('app-files').download(testPath);
  if (error) {
    console.error('Download error:', error);
    return;
  }
  const arrayBuf = await data.arrayBuffer();
  console.log('Download success! Bytes:', arrayBuf.byteLength, 'Type:', data.type);
}

testDownload();
