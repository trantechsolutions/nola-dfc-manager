// Cache policy for the service worker's Supabase REST route.
//
// Why this exists: Cache Storage is keyed by request URL and is shared by every
// user of the browser profile. Supabase responses are RLS-filtered per user, so
// caching them under a bare URL means a second user signing in on the same
// device (a shared family iPad, a team laptop) can be served the first user's
// rows — and the entries outlive sign-out. These helpers partition cache keys by
// the authenticated subject and keep the most sensitive tables out of the cache
// entirely.
//
// Kept as pure functions in src/utils so they are unit-testable; the service
// worker imports them (it is bundled by vite-plugin-pwa's injectManifest).

/**
 * Cache name for Supabase REST reads. v1 entries are unpartitioned; v2 entries
 * hold guardian rows that arrived as embedded resources before the select param
 * was inspected. Both are evicted on activate.
 */
export const SUPABASE_CACHE_NAME = 'supabase-rest-v3';

/** Superseded read caches, deleted when a new worker activates. */
export const STALE_SUPABASE_CACHE_NAMES = ['supabase-rest-v1', 'supabase-rest-v2'];

/** Cache name for same-origin fonts/images. */
export const STATIC_CACHE_NAME = 'static-assets-v1';

/** Partition used when no valid bearer token is present on the request. */
export const ANON_PARTITION = 'anon';

/**
 * HTTP methods that can change server state. Supabase sends reads as GET and
 * RPC calls as POST, so anything in this list is treated as a write.
 */
export const SUPABASE_MUTATION_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * Tables never written to Cache Storage. Medical forms and guardian records are
 * the most sensitive data in the app (minors' health details, parent contact
 * info) and are cheap to refetch — the offline benefit does not justify leaving
 * them on disk.
 */
export const UNCACHEABLE_TABLES = ['medical_forms', 'guardians'];

/**
 * True when a PostgREST `select` pulls an uncacheable table in as an embedded
 * resource. The path segment alone is not enough to judge a request: six call
 * sites read guardian rows through `players?select=*,guardians(*)`, which is
 * filed under `players` and so slipped past the table check with the guardian
 * contact details attached.
 *
 * Embeds are `<table>(...)`, optionally aliased (`parents:guardians(*)`) or
 * hinted (`guardians!inner(*)`), and may nest. Matching requires a `(` or `!`
 * immediately after the name, so a plain column named `guardians` is untouched
 * and a lookalike table like `guardians_archive(*)` is judged on its own name.
 * Whitespace around the delimiters is tolerated — PostgREST accepts it, and
 * callers do write `select('id, first_name, guardians(*)')`.
 */
export function selectEmbedsUncacheableTable(select) {
  if (!select || typeof select !== 'string') return false;
  return UNCACHEABLE_TABLES.some((table) => new RegExp(`(^|[,(:])\\s*${table}\\s*[(!]`).test(select));
}

/**
 * Decodes the `sub` (user id) claim from a Supabase JWT without verifying it.
 * Verification is irrelevant here — the claim is only used to bucket cache
 * entries, and a forged token would simply get its own useless bucket. Reading
 * the token off the request keeps the SW stateless, which matters because SWs
 * are terminated and restarted freely.
 */
export function getSubjectFromAuthHeader(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const parts = match[1].split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * True when this is a Supabase REST GET whose response may be cached.
 * Non-GET, non-REST, and sensitive-table requests are excluded.
 */
export function isCacheableSupabaseRequest(url, method = 'GET') {
  if (!url) return false;
  if ((method || 'GET').toUpperCase() !== 'GET') return false;

  let parsed;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return false;
  }

  if (!parsed.hostname?.endsWith('.supabase.co')) return false;
  if (!parsed.pathname.startsWith('/rest/')) return false;

  // Path form is /rest/v1/<table>. Match the segment exactly so a table merely
  // containing the word (e.g. "guardians_archive") is judged on its own name.
  const table = parsed.pathname.split('/')[3] || '';
  if (UNCACHEABLE_TABLES.includes(table)) return false;

  // A cacheable table can still carry an uncacheable one in its payload.
  return !selectEmbedsUncacheableTable(parsed.searchParams.get('select'));
}

/**
 * True when this is a Supabase REST write. The read cache is StaleWhileRevalidate,
 * so without invalidating it here a refetch issued right after a save is answered
 * from the pre-save snapshot and the UI appears not to have updated.
 */
export function isSupabaseMutation(url, method = 'GET') {
  if (!url) return false;
  if (!SUPABASE_MUTATION_METHODS.includes((method || 'GET').toUpperCase())) return false;

  let parsed;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return false;
  }

  if (!parsed.hostname?.endsWith('.supabase.co')) return false;
  return parsed.pathname.startsWith('/rest/');
}

/**
 * Builds the partitioned cache key. The subject is carried in a reserved query
 * param so entries for different users never collide, and so the key stays a
 * valid URL (Cache Storage requires one).
 */
export function buildPartitionedCacheKey(url, authHeader) {
  const subject = getSubjectFromAuthHeader(authHeader) || ANON_PARTITION;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('__uid', subject);
    return parsed.toString();
  } catch {
    return url;
  }
}
