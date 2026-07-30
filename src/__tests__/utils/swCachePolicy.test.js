import { describe, it, expect } from 'vitest';
import {
  ANON_PARTITION,
  UNCACHEABLE_TABLES,
  getSubjectFromAuthHeader,
  isCacheableSupabaseRequest,
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
