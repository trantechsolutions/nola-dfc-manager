// Supabase Edge Function: ical-proxy
// Fetches a remote .ics feed server-side and returns it with CORS headers.
// Needed because some providers (e.g. Google Calendar) serve public feeds
// without Access-Control-Allow-Origin, so the browser can't read them directly.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const MAX_BYTES = 5 * 1024 * 1024;

function error(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'GET') return error(405, 'Method not allowed');

  const target = new URL(req.url).searchParams.get('url');
  if (!target) return error(400, 'Missing url parameter');

  let feedUrl: URL;
  try {
    // webcal:// is how many providers advertise subscribable feeds
    feedUrl = new URL(target.replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return error(400, 'Invalid url');
  }
  if (feedUrl.protocol !== 'https:' && feedUrl.protocol !== 'http:') return error(400, 'Unsupported protocol');

  let upstream: Response;
  try {
    upstream = await fetch(feedUrl, { headers: { Accept: 'text/calendar, */*' }, redirect: 'follow' });
  } catch (err) {
    return error(502, `Upstream fetch failed: ${(err as Error).message}`);
  }
  if (!upstream.ok) return error(502, `Upstream returned ${upstream.status}`);

  const body = await upstream.text();
  if (body.length > MAX_BYTES) return error(413, 'Feed too large');
  // Only relay calendar data — keeps this from acting as a general-purpose proxy.
  if (!body.includes('BEGIN:VCALENDAR')) return error(422, 'Response is not an iCal feed');

  return new Response(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
});
