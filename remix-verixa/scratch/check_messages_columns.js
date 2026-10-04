const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
  const { data, error } = await supabase.from('messages').select('*').limit(1);
  if (error) {
    console.error('Error selecting messages:', error);
  } else {
    console.log('Columns in public.messages:', Object.keys(data[0] || {}));
  }
}
test();
