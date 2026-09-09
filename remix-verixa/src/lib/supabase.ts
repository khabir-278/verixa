import { createClient } from '@supabase/supabase-js';

const env: Record<string, any> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : typeof process !== 'undefined' && process.env
    ? process.env
    : {};

export const DEFAULT_SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

const rawUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const rawKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_ANON_KEY;

// Strict fallback: never use placeholder domains that fail DNS resolution
export const supabaseUrl =
  rawUrl && !rawUrl.includes('placeholder')
    ? rawUrl
    : DEFAULT_SUPABASE_URL;

export const supabasePublishableKey =
  rawKey && !rawKey.includes('placeholder')
    ? rawKey
    : DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
    detectSessionInUrl: typeof window !== 'undefined',
  },
});
