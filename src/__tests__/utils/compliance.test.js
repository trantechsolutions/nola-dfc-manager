import { describe, it, expect } from 'vitest';
import { getCompliance, isFullyCompliant } from '../../utils/compliance';

const player = {
  seasonProfiles: {
    '2024-2025': { medicalRelease: true, reePlayerWaiver: true, clubRegistration: true },
    '2025-2026': { medicalRelease: true, reePlayerWaiver: false, clubRegistration: true },
  },
};

describe('getCompliance', () => {
  it('resolves flags for the given season', () => {
    expect(getCompliance(player, '2024-2025')).toEqual({
      medicalRelease: true,
      reePlayerWaiver: true,
      clubRegistration: true,
    });
    expect(getCompliance(player, '2025-2026')).toEqual({
      medicalRelease: true,
      reePlayerWaiver: false,
      clubRegistration: true,
    });
  });

  it('treats an unenrolled or unknown season as non-compliant', () => {
    const empty = { medicalRelease: false, reePlayerWaiver: false, clubRegistration: false };
    expect(getCompliance(player, '2026-2027')).toEqual(empty);
    expect(getCompliance(player, null)).toEqual(empty);
    expect(getCompliance({}, '2025-2026')).toEqual(empty);
    expect(getCompliance(null, '2025-2026')).toEqual(empty);
  });

  it('does not leak compliance across seasons', () => {
    // Compliant in 2024-2025 must NOT imply compliant in a fresh season.
    expect(getCompliance(player, '2026-2027').medicalRelease).toBe(false);
  });
});

describe('isFullyCompliant', () => {
  it('requires the medical release, waiver, and club registration for the season', () => {
    expect(isFullyCompliant(player, '2024-2025')).toBe(true);
    expect(isFullyCompliant(player, '2025-2026')).toBe(false);
    expect(isFullyCompliant(player, '2026-2027')).toBe(false);
  });
});
