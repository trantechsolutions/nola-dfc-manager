// src/utils/fetchIcs.js
// Fetches raw .ics text for a calendar feed URL.
// Tries the feed directly first (works for providers that send CORS headers,
// e.g. Ollie Sports); if the browser blocks it — Google Calendar sends no
// Access-Control-Allow-Origin — falls back to the ical-proxy edge function.

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ical-proxy`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const normalize = (url) => url.trim().replace(/^webcal:\/\//i, 'https://');

async function fetchViaProxy(url) {
  const res = await fetch(`${PROXY_URL}?url=${encodeURIComponent(url)}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Calendar proxy returned ${res.status}`);
  return res.text();
}

export async function fetchIcs(rawUrl) {
  const url = normalize(rawUrl);
  try {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      if (text.includes('BEGIN:VCALENDAR')) return text;
    }
  } catch {
    // CORS / network failure — fall through to the proxy
  }
  return fetchViaProxy(url);
}
