// src/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Explicit (not relied-on-default): password recovery and magic link both
// redirect back with tokens in the URL hash (#access_token=...&type=...),
// which is what App.jsx's recovery-link detection parses. PKCE would send a
// ?code= query param instead and silently break that detection.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'implicit' },
});
