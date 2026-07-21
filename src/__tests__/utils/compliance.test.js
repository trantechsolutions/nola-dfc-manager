import { describe, it, expect } from 'vitest';
import { getCompliance, isFullyCompliant } from '../../utils/compliance';

const player = {
  seasonProfiles: {
    '2024-2025': { medicalRelease: true, reePlayerWaiver: true },
    '2025-2026': { medicalRelease: true, reePlayerWaiver: false },
  },
};

describe('getCompliance', () => {
  it('resolves flags for the given season', () => {
    expect(getCompliance(player, '2024-2025')).toEqual({ medicalRelease: true, reePlayerWaiver: true });
    expect(getCompliance(player, '2025-2026')).toEqual({ medicalRelease: true, reePlayerWaiver: false });
  });

  it('treats an unenrolled or unknown season as non-compliant', () => {
    expect(getCompliance(player, '2026-2027')).toEqual({ medicalRelease: false, reePlayerWaiver: false });
    expect(getCompliance(player, null)).toEqual({ medicalRelease: false, reePlayerWaiver: false });
    expect(getCompliance({}, '2025-2026')).toEqual({ medicalRelease: false, reePlayerWaiver: false });
    expect(getCompliance(null, '2025-2026')).toEqual({ medicalRelease: false, reePlayerWaiver: false });
  });

  it('does not leak compliance across seasons', () => {
    // Compliant in 2024-2025 must NOT imply compliant in a fresh season.
    expect(getCompliance(player, '2026-2027').medicalRelease).toBe(false);
  });
});

describe('isFullyCompliant', () => {
  it('requires both waivers for the season', () => {
    expect(isFullyCompliant(player, '2024-2025')).toBe(true);
    expect(isFullyCompliant(player, '2025-2026')).toBe(false);
    expect(isFullyCompliant(player, '2026-2027')).toBe(false);
  });
});
