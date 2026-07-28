import { describe, it, expect } from 'vitest';
import {
  MATCHUP_STATUSES,
  MATCHUP_STATUS_META,
  canTransition,
  nextStatuses,
  isTerminal,
} from '../../utils/matchupStatus';

describe('canTransition', () => {
  it('allows open to move to tentative, confirmed, dns, or cancelled', () => {
    expect(canTransition('open', 'tentative')).toBe(true);
    expect(canTransition('open', 'confirmed')).toBe(true);
    expect(canTransition('open', 'dns')).toBe(true);
    expect(canTransition('open', 'cancelled')).toBe(true);
  });

  it('allows tentative to fall back to open', () => {
    expect(canTransition('tentative', 'open')).toBe(true);
  });

  it('only allows confirmed to move to cancelled (the rainout/reschedule path)', () => {
    expect(canTransition('confirmed', 'cancelled')).toBe(true);
    expect(canTransition('confirmed', 'open')).toBe(false);
    expect(canTransition('confirmed', 'tentative')).toBe(false);
    expect(canTransition('confirmed', 'dns')).toBe(false);
  });

  it('rejects any transition out of dns or cancelled (terminal states)', () => {
    expect(canTransition('dns', 'open')).toBe(false);
    expect(canTransition('dns', 'tentative')).toBe(false);
    expect(canTransition('cancelled', 'open')).toBe(false);
  });

  it('rejects transitions from an unknown status', () => {
    expect(canTransition('bogus', 'open')).toBe(false);
  });

  it('rejects a no-op transition to the same status', () => {
    expect(canTransition('open', 'open')).toBe(false);
  });
});

describe('nextStatuses', () => {
  it('returns the legal next statuses for a given status', () => {
    expect(nextStatuses('open')).toEqual(['tentative', 'confirmed', 'dns', 'cancelled']);
    expect(nextStatuses('confirmed')).toEqual(['cancelled']);
  });

  it('returns an empty array for terminal or unknown statuses', () => {
    expect(nextStatuses('dns')).toEqual([]);
    expect(nextStatuses('cancelled')).toEqual([]);
    expect(nextStatuses('bogus')).toEqual([]);
  });
});

describe('isTerminal', () => {
  it('treats dns and cancelled as terminal', () => {
    expect(isTerminal('dns')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('treats open, tentative, and confirmed as non-terminal', () => {
    expect(isTerminal('open')).toBe(false);
    expect(isTerminal('tentative')).toBe(false);
    expect(isTerminal('confirmed')).toBe(false);
  });
});

describe('MATCHUP_STATUS_META', () => {
  it('has display metadata for every status in MATCHUP_STATUSES', () => {
    MATCHUP_STATUSES.forEach((status) => {
      expect(MATCHUP_STATUS_META[status]).toBeDefined();
      expect(MATCHUP_STATUS_META[status].label).toBeTruthy();
    });
  });
});
