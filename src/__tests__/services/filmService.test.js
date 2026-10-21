import { describe, expect, it, vi } from 'vitest';

vi.mock('../../supabase', () => ({ supabase: { rpc: vi.fn() } }));
// A local film address in .env.local must not leak into these tests.
vi.stubEnv('VITE_FILM_SITE_URL', '');

const { filmLink, filmGameLink } = await import('../../services/filmService');

const decode = (url) =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(url.split('#unlock=')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    ),
  );
const access = {
  siteUrl: 'https://example.github.io/game-review',
  team: 'dGVhbQ==',
  coach: { a: 'acc', e: 'enc', c: 'con' },
  keeper: { a: 'ka', e: 'ke', r: 'kr' },
};

describe('filmLink', () => {
  it('hands the games key, with the coach keys when allowed, in the fragment', () => {
    const url = filmLink(access);
    expect(url.startsWith('https://example.github.io/game-review/#unlock=')).toBe(true);
    expect(decode(url)).toEqual({ v: 1, t: 'dGVhbQ==', c: access.coach, to: 'season' });
    expect(decode(filmLink({ ...access, coach: null }))).toEqual({ v: 1, t: 'dGVhbQ==', to: 'season' });
  });

  it('opens the scorekeeper screen with only the scorekeeper keys', () => {
    expect(decode(filmLink(access, 'keeper'))).toEqual({ v: 1, k: access.keeper, to: 'keep' });
    expect(filmLink({ ...access, keeper: null }, 'keeper')).toBeNull();
  });

  it('links to a local copy of the film when one is set, with the same keys', () => {
    const url = filmLink(access, 'film', 'http://localhost:8000');
    expect(url.startsWith('http://localhost:8000/#unlock=')).toBe(true);
    expect(decode(url)).toEqual(decode(filmLink(access, 'film', '')));
    expect(filmLink(access, 'keeper', 'http://localhost:8000/').startsWith('http://localhost:8000/#unlock=')).toBe(
      true,
    );
  });

  it("opens one game's report or highlights, with the coach area when allowed", () => {
    const url = filmGameLink(access, '2026-03-01-test-fc', 'highlights');
    expect(url.startsWith('https://example.github.io/game-review/#unlock=')).toBe(true);
    expect(decode(url)).toEqual({
      v: 1,
      t: 'dGVhbQ==',
      c: access.coach,
      to: 'game',
      g: '2026-03-01-test-fc',
      p: 'highlights',
    });
    expect(decode(filmGameLink({ ...access, coach: null }, '2026-03-01-test-fc'))).toEqual({
      v: 1,
      t: 'dGVhbQ==',
      to: 'game',
      g: '2026-03-01-test-fc',
      p: 'report',
    });
    expect(filmGameLink(access, '2026-03-01-test-fc', 'report', 'http://localhost:8000')).toMatch(
      /^http:\/\/localhost:8000\/#unlock=/,
    );
    expect(filmGameLink(access, '')).toBeNull();
    expect(filmGameLink(null, '2026-03-01-test-fc')).toBeNull();
  });

  it("carries the account's scorekeeper token, when there is one", () => {
    const token = 'ab'.repeat(32);
    expect(decode(filmLink({ ...access, keeperToken: token }, 'keeper'))).toEqual({
      v: 1,
      k: { ...access.keeper, u: token },
      to: 'keep',
    });
    expect(decode(filmLink({ ...access, keeperToken: token }, 'film')).k).toBeUndefined();
  });

  it('gives nothing without a site', () => {
    expect(filmLink(null)).toBeNull();
    expect(filmLink({ ...access, siteUrl: '' })).toBeNull();
  });
});
