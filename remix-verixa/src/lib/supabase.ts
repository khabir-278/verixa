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

let cachedAccessToken: string | null = null;

if (typeof window !== 'undefined') {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      cachedAccessToken = data?.session?.access_token || null;
    })
    .catch(() => {});

  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token || null;
  });

  const win = window as any;
  if (typeof win.fetch === 'function' && !win.__verixaAuthFetchInstalled) {
    win.__verixaAuthFetchInstalled = true;
    const nativeFetch = win.fetch.bind(window);

    win.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      try {
        const urlStr =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.toString()
            : (input as Request)?.url || '';

        const isSameOriginApi =
          urlStr.startsWith('/api/') ||
          (typeof window.location?.origin === 'string' &&
            urlStr.startsWith(`${window.location.origin}/api/`));

        if (isSameOriginApi) {
          const headers = new Headers(
            init?.headers || (input instanceof Request ? input.headers : undefined)
          );
          if (!headers.has('Authorization')) {
            let token = cachedAccessToken;
            if (!token) {
              const { data } = await supabase.auth.getSession();
              token = data?.session?.access_token || null;
              cachedAccessToken = token;
            }
            if (token) {
              headers.set('Authorization', `Bearer ${token}`);
              return nativeFetch(input, { ...(init || {}), headers });
            }
          }
        }
      } catch {
        // Proceed with original request on header construction errors
      }
      return nativeFetch(input, init);
    };
  }
}

