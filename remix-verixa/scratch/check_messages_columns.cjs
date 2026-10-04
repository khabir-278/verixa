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

async function checkColumns() {
  const candidateColumns = [
    'id', 'conversation_id', 'sender_id', 'receiver_id', 'text', 'media_url',
    'is_ai_verified', 'created_at', 'status', 'delivered_at', 'read_at',
    'is_voice', 'voice_duration', 'reply_to_message_id', 'is_forwarded',
    'forwarded_from_message_id', 'message_type', 'media_name', 'media_size',
    'reactions', 'edited_at', 'deleted_at'
  ];

  for (const col of candidateColumns) {
    const { error } = await supabase.from('messages').select(col).limit(1);
    if (error) {
      console.log(`Column '${col}': DOES NOT EXIST (${error.message})`);
    } else {
      console.log(`Column '${col}': EXISTS`);
    }
  }
}

checkColumns();
