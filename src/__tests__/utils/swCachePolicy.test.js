import { describe, it, expect } from 'vitest';
import {
  ANON_PARTITION,
  UNCACHEABLE_TABLES,
  SUPABASE_MUTATION_METHODS,
  getSubjectFromAuthHeader,
  isCacheableSupabaseRequest,
  isSupabaseMutation,
  selectEmbedsUncacheableTable,
  buildPartitionedCacheKey,
} from '../../utils/swCachePolicy';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REST = 'https://abcdefgh.supabase.co/rest/v1';

/** Builds an unsigned JWT with the given payload — only the payload is read. */
function makeJwt(payload) {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const bearer = (sub) => `Bearer ${makeJwt({ sub, role: 'authenticated' })}`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getSubjectFromAuthHeader', () => {
  it('extracts the sub claim from a bearer token', () => {
    expect(getSubjectFromAuthHeader(bearer(USER_A))).toBe(USER_A);
  });

  it('is case-insensitive on the Bearer scheme', () => {
    expect(getSubjectFromAuthHeader(`bearer ${makeJwt({ sub: USER_A })}`)).toBe(USER_A);
  });

  it('handles base64url payloads containing - and _', () => {
    const sub = 'user-with_special-chars-0000';
    expect(getSubjectFromAuthHeader(bearer(sub))).toBe(sub);
  });

  it('returns null for a missing or non-string header', () => {
    expect(getSubjectFromAuthHeader(null)).toBeNull();
    expect(getSubjectFromAuthHeader(undefined)).toBeNull();
    expect(getSubjectFromAuthHeader(123)).toBeNull();
  });

  it('returns null when the scheme is not Bearer', () => {
    expect(getSubjectFromAuthHeader(`Basic ${makeJwt({ sub: USER_A })}`)).toBeNull();
  });

  it('returns null for a malformed token rather than throwing', () => {
    expect(getSubjectFromAuthHeader('Bearer not-a-jwt')).toBeNull();
    expect(getSubjectFromAuthHeader('Bearer a.b')).toBeNull();
    expect(getSubjectFromAuthHeader('Bearer !!!.!!!.!!!')).toBeNull();
  });

  it('returns null when the payload carries no usable sub', () => {
    expect(getSubjectFromAuthHeader(`Bearer ${makeJwt({ role: 'anon' })}`)).toBeNull();
    expect(getSubjectFromAuthHeader(`Bearer ${makeJwt({ sub: '' })}`)).toBeNull();
    expect(getSubjectFromAuthHeader(`Bearer ${makeJwt({ sub: 42 })}`)).toBeNull();
  });
});

describe('isCacheableSupabaseRequest', () => {
  it('accepts a Supabase REST GET', () => {
    expect(isCacheableSupabaseRequest(`${REST}/players?select=*`, 'GET')).toBe(true);
  });

  it('defaults to GET when no method is supplied', () => {
    expect(isCacheableSupabaseRequest(`${REST}/players`)).toBe(true);
  });

  it('rejects every mutating method', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(isCacheableSupabaseRequest(`${REST}/players`, method)).toBe(false);
    }
  });

  it.each(UNCACHEABLE_TABLES)('never caches the sensitive table %s', (table) => {
    expect(isCacheableSupabaseRequest(`${REST}/${table}?select=*`, 'GET')).toBe(false);
  });

  it('matches table names exactly, so lookalike tables stay cacheable', () => {
    expect(isCacheableSupabaseRequest(`${REST}/guardians_archive`, 'GET')).toBe(true);
  });

  it('rejects a cacheable table that embeds a sensitive one', () => {
    // The real roster query — filed under /players, guardian contact details attached.
    const url = `${REST}/players?select=${encodeURIComponent('*,guardians(*),player_seasons(*)')}&team_id=eq.7`;
    expect(isCacheableSupabaseRequest(url, 'GET')).toBe(false);
  });

  it('still caches a cacheable table whose embeds are all safe', () => {
    const url = `${REST}/players?select=${encodeURIComponent('*,player_seasons(*),teams(name,age_group)')}`;
    expect(isCacheableSupabaseRequest(url, 'GET')).toBe(true);
  });

  it('rejects non-REST Supabase paths such as auth and storage', () => {
    expect(isCacheableSupabaseRequest('https://abcdefgh.supabase.co/auth/v1/user', 'GET')).toBe(false);
    expect(isCacheableSupabaseRequest('https://abcdefgh.supabase.co/storage/v1/object/x', 'GET')).toBe(false);
  });

  it('rejects other origins', () => {
    expect(isCacheableSupabaseRequest('https://evil.example.com/rest/v1/players', 'GET')).toBe(false);
  });

  it('rejects empty and unparseable urls rather than throwing', () => {
    expect(isCacheableSupabaseRequest('')).toBe(false);
    expect(isCacheableSupabaseRequest('not a url', 'GET')).toBe(false);
  });

  it('accepts a URL object as well as a string', () => {
    expect(isCacheableSupabaseRequest(new URL(`${REST}/players`), 'GET')).toBe(true);
  });
});

describe('selectEmbedsUncacheableTable', () => {
  it.each([
    '*,guardians(*),player_seasons(*)',
    'first_name,last_name,guardians(email)',
    'id, first_name, last_name, jersey_number, guardians(*)',
  ])('detects a plain embed: %s', (select) => {
    expect(selectEmbedsUncacheableTable(select)).toBe(true);
  });

  it('detects an aliased embed', () => {
    expect(selectEmbedsUncacheableTable('*,parents:guardians(*)')).toBe(true);
  });

  it('detects a hinted embed', () => {
    expect(selectEmbedsUncacheableTable('*,guardians!inner(*)')).toBe(true);
  });

  it('detects a nested embed', () => {
    expect(selectEmbedsUncacheableTable('player_id,players(*,guardians(*),player_seasons(*))')).toBe(true);
  });

  it('detects medical_forms, not just guardians', () => {
    expect(selectEmbedsUncacheableTable('*,medical_forms(*)')).toBe(true);
  });

  it('ignores a lookalike table that merely starts with the name', () => {
    expect(selectEmbedsUncacheableTable('*,guardians_archive(*)')).toBe(false);
    expect(selectEmbedsUncacheableTable('*,ex_guardians(*)')).toBe(false);
  });

  it('ignores a plain column that happens to be named guardians', () => {
    expect(selectEmbedsUncacheableTable('id,guardians')).toBe(false);
  });

  it('handles a missing or non-string select', () => {
    expect(selectEmbedsUncacheableTable(null)).toBe(false);
    expect(selectEmbedsUncacheableTable(undefined)).toBe(false);
    expect(selectEmbedsUncacheableTable('')).toBe(false);
    expect(selectEmbedsUncacheableTable(42)).toBe(false);
  });
});

describe('isSupabaseMutation', () => {
  it.each(SUPABASE_MUTATION_METHODS)('recognises a REST %s as a write', (method) => {
    expect(isSupabaseMutation(`${REST}/players?id=eq.7`, method)).toBe(true);
  });

  it('is case-insensitive on the method', () => {
    expect(isSupabaseMutation(`${REST}/players`, 'patch')).toBe(true);
  });

  it('rejects reads, so a GET never purges the cache it just filled', () => {
    expect(isSupabaseMutation(`${REST}/players?select=*`, 'GET')).toBe(false);
    expect(isSupabaseMutation(`${REST}/players`)).toBe(false);
    expect(isSupabaseMutation(`${REST}/players`, 'HEAD')).toBe(false);
  });

  it('treats an rpc POST as a write — RPCs update rows too', () => {
    expect(isSupabaseMutation(`${REST}/rpc/set_guardian_medical_release`, 'POST')).toBe(true);
  });

  it('covers sensitive tables that are excluded from the read cache', () => {
    // guardians is never cached, but writing one still invalidates the players
    // query that embeds it.
    expect(isSupabaseMutation(`${REST}/guardians`, 'DELETE')).toBe(true);
  });

  it('ignores non-REST Supabase paths such as auth and storage', () => {
    expect(isSupabaseMutation('https://abcdefgh.supabase.co/auth/v1/token', 'POST')).toBe(false);
    expect(isSupabaseMutation('https://abcdefgh.supabase.co/storage/v1/object/x', 'POST')).toBe(false);
  });

  it('ignores other origins', () => {
    expect(isSupabaseMutation('https://evil.example.com/rest/v1/players', 'PATCH')).toBe(false);
  });

  it('rejects empty and unparseable urls rather than throwing', () => {
    expect(isSupabaseMutation('', 'POST')).toBe(false);
    expect(isSupabaseMutation('not a url', 'POST')).toBe(false);
  });

  it('accepts a URL object as well as a string', () => {
    expect(isSupabaseMutation(new URL(`${REST}/players`), 'PATCH')).toBe(true);
  });
});

describe('buildPartitionedCacheKey', () => {
  it('appends the authenticated subject to the cache key', () => {
    const key = buildPartitionedCacheKey(`${REST}/players?select=*`, bearer(USER_A));
    expect(new URL(key).searchParams.get('__uid')).toBe(USER_A);
  });

  it('gives two users different keys for the identical request', () => {
    const url = `${REST}/players?select=*`;
    expect(buildPartitionedCacheKey(url, bearer(USER_A))).not.toBe(buildPartitionedCacheKey(url, bearer(USER_B)));
  });

  it('is stable across token refreshes, since sub does not change', () => {
    const url = `${REST}/players?select=*`;
    const first = buildPartitionedCacheKey(url, `Bearer ${makeJwt({ sub: USER_A, exp: 1 })}`);
    const second = buildPartitionedCacheKey(url, `Bearer ${makeJwt({ sub: USER_A, exp: 2 })}`);
    expect(first).toBe(second);
  });

  it('falls back to the anon partition when no token is present', () => {
    const key = buildPartitionedCacheKey(`${REST}/players`, null);
    expect(new URL(key).searchParams.get('__uid')).toBe(ANON_PARTITION);
  });

  it('keeps anonymous entries separate from authenticated ones', () => {
    const url = `${REST}/players`;
    expect(buildPartitionedCacheKey(url, null)).not.toBe(buildPartitionedCacheKey(url, bearer(USER_A)));
  });

  it('preserves the original query parameters', () => {
    const key = buildPartitionedCacheKey(`${REST}/players?select=*&team_id=eq.7`, bearer(USER_A));
    const params = new URL(key).searchParams;
    expect(params.get('select')).toBe('*');
    expect(params.get('team_id')).toBe('eq.7');
  });

  it('returns the input unchanged when it is not a parseable url', () => {
    expect(buildPartitionedCacheKey('not a url', bearer(USER_A))).toBe('not a url');
  });
});
