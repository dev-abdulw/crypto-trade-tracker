import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the env vars are missing; the app then shows a setup message instead of crashing. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'missing-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
);
