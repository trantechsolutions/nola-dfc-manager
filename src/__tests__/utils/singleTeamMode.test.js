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

describe('resolveSingleTeamMode', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window, 'location', { value: { search: '' }, writable: true, configurable: true });
  });

  it('DB value true wins over env flag false', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'false');
    const { resolveSingleTeamMode } = await import('../../utils/singleTeamMode');
    expect(resolveSingleTeamMode({ single_team_mode: true })).toBe(true);
    vi.unstubAllEnvs();
  });

  it('DB value false wins over env flag true', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'true');
    const { resolveSingleTeamMode } = await import('../../utils/singleTeamMode');
    expect(resolveSingleTeamMode({ single_team_mode: false })).toBe(false);
    vi.unstubAllEnvs();
  });

  it('falls back to env flag when DB value is absent', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'true');
    const { resolveSingleTeamMode } = await import('../../utils/singleTeamMode');
    expect(resolveSingleTeamMode({})).toBe(true);
    expect(resolveSingleTeamMode(null)).toBe(true);
    vi.unstubAllEnvs();
  });

  it('session override forces full mode even when DB value is true', async () => {
    vi.stubEnv('VITE_SINGLE_TEAM_MODE', 'false');
    localStorage.setItem('nola_admin_override', '1');
    const { resolveSingleTeamMode } = await import('../../utils/singleTeamMode');
    expect(resolveSingleTeamMode({ single_team_mode: true })).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('setAdminOverride', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('sets and clears the override key', async () => {
    const { setAdminOverride } = await import('../../utils/singleTeamMode');
    setAdminOverride(true);
    expect(localStorage.getItem('nola_admin_override')).toBe('1');
    setAdminOverride(false);
    expect(localStorage.getItem('nola_admin_override')).toBeNull();
  });
});
