import { describe, it, expect, beforeEach, vi } from 'vitest';

// isSingleTeamMode reads import.meta.env and window.localStorage — mock both
// before importing the module so the mocks are in place at module evaluation time.

describe('isSingleTeamMode', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('returns false when VITE_SINGLE_TEAM_MODE is not "true"', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'false');
    const { isSingleTeamMode } = await import('../../utils/singleTeamMode');
    expect(isSingleTeamMode()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('returns true when flag is enabled and no override set', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'true');
    localStorage.removeItem('nola_admin_override');
    const { isSingleTeamMode } = await import('../../utils/singleTeamMode');
    expect(isSingleTeamMode()).toBe(true);
    vi.unstubAllEnvs();
  });

  it('returns false when admin override is set in localStorage', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'true');
    localStorage.setItem('nola_admin_override', '1');
    const { isSingleTeamMode } = await import('../../utils/singleTeamMode');
    expect(isSingleTeamMode()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('sets override when ?admin=1 query param is present', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'true');
    // Simulate ?admin=1 in URL
    Object.defineProperty(window, 'location', {
      value: { search: '?admin=1' },
      writable: true,
      configurable: true,
    });
    const { isSingleTeamMode } = await import('../../utils/singleTeamMode');
    isSingleTeamMode();
    expect(localStorage.getItem('nola_admin_override')).toBe('1');
    vi.unstubAllEnvs();
  });

  it('clears override when ?admin=0 query param is present', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'true');
    localStorage.setItem('nola_admin_override', '1');
    Object.defineProperty(window, 'location', {
      value: { search: '?admin=0' },
      writable: true,
      configurable: true,
    });
    const { isSingleTeamMode } = await import('../../utils/singleTeamMode');
    isSingleTeamMode();
    expect(localStorage.getItem('nola_admin_override')).toBeNull();
    vi.unstubAllEnvs();
  });
});
