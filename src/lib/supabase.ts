import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Shown instead of the app when the environment is not configured. */
export const configError =
  !url || !anonKey
    ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project values.'
    : null;

// The anon key is public by design; Row Level Security in the database decides what each user can do.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key');
