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

async function testStorageFetch() {
  console.log('Testing storage list...');
  // List files in app-files
  const { data: files, error } = await supabase.storage.from('app-files').list('1e71840f-a4ce-4b73-bbf8-686e7235d3c9/audio');
  if (error) {
    console.error('List error:', error);
    return;
  }
  console.log('Files found:', files?.length);
  if (files && files.length > 0) {
    const testFile = `1e71840f-a4ce-4b73-bbf8-686e7235d3c9/audio/${files[0].name}`;
    console.log('Generating signed URL for:', testFile);
    const { data: signData, error: signError } = await supabase.storage.from('app-files').createSignedUrl(testFile, 60);
    if (signError) {
      console.error('Sign error:', signError);
      return;
    }
    console.log('Signed URL generated successfully');
    
    // Now test fetch from Node
    const res = await fetch(signData.signedUrl);
    console.log('Fetch status:', res.status, res.statusText);
    console.log('Content-Type:', res.headers.get('content-type'));
    const buf = await res.arrayBuffer();
    console.log('Buffer bytes received:', buf.byteLength);
  }
}

testStorageFetch();
