import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
};

function bearerToken(request: ApiRequest) {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
}

function supabaseEnvironment() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error('Missing server environment variable: VITE_SUPABASE_URL');
  if (!key) throw new Error('Missing server environment variable: VITE_SUPABASE_PUBLISHABLE_KEY');
  return { url, key };
}

export async function authenticateRequest(request: ApiRequest) {
  const token = bearerToken(request);
  if (!token) return null;
  const { url, key } = supabaseEnvironment();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, client };
}

export async function requireAcademyStaff(user: User, client: SupabaseClient) {
  const { data } = await client
    .from('profiles')
    .select('role, subscription_tier')
    .eq('id', user.id)
    .maybeSingle<{ role: string | null; subscription_tier: string | null }>();
  const role = data?.role?.trim().toLowerCase();
  const tier = data?.subscription_tier?.trim().toLowerCase();
  return role === 'admin'
    || role === 'owner'
    || role === 'mentor'
    || tier === 'owner'
    || tier === 'instructor'
    || tier === 'enterprise-admin';
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function safeError(response: ApiResponse, caught: unknown, fallback: string) {
  const message = caught instanceof Error && caught.message.startsWith('Missing server environment variable:')
    ? caught.message
    : fallback;
  response.status(500).json({ error: message });
}

export function methodNotAllowed(response: ApiResponse, allowed: string) {
  response.setHeader('Allow', allowed);
  response.status(405).json({ error: 'Method not allowed.' });
}
