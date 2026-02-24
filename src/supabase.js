import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zvqfbikxxhbwhownrdtx.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cWZiaWt4eGhid2hvd25yZHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTg2OTgsImV4cCI6MjA4NzQzNDY5OH0.YJckyB9pznDAnUKTowuOzmkGoB-maI6L-Kqnssm26_k';

export const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
});

// Direct REST fetch — reads token straight from localStorage
// Bypasses Supabase JS client lock issues entirely for data operations
export async function dbFetch(path, options = {}) {
  let token = ANON_KEY;
  try {
    const raw = localStorage.getItem(`sb-zvqfbikxxhbwhownrdtx-auth-token`);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.access_token) token = s.access_token;
    }
  } catch(e) {}

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': options.prefer || 'return=minimal',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const dbGet    = (table, q='')    => dbFetch(`${table}?${q}`,       { method:'GET', prefer:'return=representation' });
export const dbPost   = (table, body)    => dbFetch(table,                  { method:'POST', body: JSON.stringify(body) });
export const dbPatch  = (table, q, body) => dbFetch(`${table}?${q}`,       { method:'PATCH', body: JSON.stringify(body) });
export const dbDelete = (table, q)       => dbFetch(`${table}?${q}`,       { method:'DELETE' });
