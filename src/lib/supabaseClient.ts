import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

const sessionClients = new Map<string, ReturnType<typeof createClient>>();

export function createSessionSupabaseClient(accessToken: string) {
  const cachedClient = sessionClients.get(accessToken);

  if (cachedClient) {
    return cachedClient;
  }

  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey: `yvimo-session-${accessToken.slice(-16)}`,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  sessionClients.set(accessToken, client);
  return client;
}
