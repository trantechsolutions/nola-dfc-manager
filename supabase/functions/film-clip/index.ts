// Supabase Edge Function: film-clip
// Hands a signed-in team member short-lived links to the game film's highlight clips.
//
// The clips are plain MP4s in a private Cloudflare R2 bucket, at <team_id>/<slug>/<clip_id>.mp4 (uploaded by
// dfc-game-film: tools/manager/manager.ts publish). Nobody can read the bucket directly. This function reads
// the game from film_games AS THE CALLER, so row-level security (film_is_member) decides whether they are on
// the team; it then signs a GET link for each clip the game lists, valid for an hour.
//
// POST { teamId, slug } → { urls: { <clip id>: <signed url> }, expiresIn }
//
// Secrets (supabase secrets set …): R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com), R2_BUCKET,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY — an R2 API token with read access to that bucket only.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const R2_ENDPOINT = (Deno.env.get('R2_ENDPOINT') ?? '').replace(/\/+$/, '');
const R2_BUCKET = Deno.env.get('R2_BUCKET') ?? '';
const EXPIRES = 3600;

const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
  service: 's3',
  region: 'auto',
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;
const CLIP_ID = /^[a-z0-9-]+$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!R2_ENDPOINT || !R2_BUCKET) return json(500, { error: 'Clips are not set up' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: 'Sign in first' });

  let teamId: string, slug: string;
  try {
    ({ teamId, slug } = await req.json());
  } catch {
    return json(400, { error: 'Invalid body' });
  }
  if (!UUID.test(teamId ?? '') || !SLUG.test(slug ?? '')) return json(400, { error: 'Invalid game' });

  // As the caller: no row unless film_is_member() lets them see it.
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from('film_games')
    .select('content->highlights->clips')
    .eq('team_id', teamId)
    .eq('slug', slug)
    .maybeSingle();
  if (error) return json(500, { error: 'Could not read the game' });
  if (!data) return json(404, { error: 'No such game' });

  const clips = ((data as { clips?: { id?: string }[] }).clips ?? [])
    .map((c) => c.id ?? '')
    .filter((id) => CLIP_ID.test(id));

  const urls: Record<string, string> = {};
  await Promise.all(
    clips.map(async (id) => {
      const url = new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${teamId}/${slug}/${id}.mp4`);
      url.searchParams.set('X-Amz-Expires', String(EXPIRES));
      const signed = await r2.sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } });
      urls[id] = signed.url;
    }),
  );
  return json(200, { urls, expiresIn: EXPIRES });
});
