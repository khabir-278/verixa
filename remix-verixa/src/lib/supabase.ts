import { createClient } from '@supabase/supabase-js';

const env: Record<string, any> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : typeof process !== 'undefined' && process.env
    ? process.env
    : {};

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabasePublishableKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  'placeholder-key';

if (!env.VITE_SUPABASE_URL && !env.SUPABASE_URL) {
  // Silent or warn once in development/test
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
    detectSessionInUrl: typeof window !== 'undefined',
  },
});
