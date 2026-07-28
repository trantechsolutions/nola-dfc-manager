import { describe, it, expect } from 'vitest';
import {
  MATCHUP_STATUSES,
  MATCHUP_STATUS_META,
  canTransition,
  nextStatuses,
  isTerminal,
  buildDuplicatePayload,
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

describe('buildDuplicatePayload', () => {
  const confirmed = {
    id: 'm1',
    teamId: 't1',
    seasonId: 's1',
    weekLabel: 'Fall Week 3',
    status: 'confirmed',
    source: 'league_assigned',
    isHome: true,
    opponentName: 'Rival FC',
    leagueMatchId: 'LCSL-42',
    matchDate: '2026-09-13',
    matchTime: '10:00',
    location: 'City Park',
    field: 'Field 3',
    deadlineDate: '2026-09-30',
    notes: 'Bring extra jerseys',
    promotedEventId: 'evt-1',
    rescheduleOfId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  };

  it('resets status to open regardless of the source status', () => {
    expect(buildDuplicatePayload(confirmed).status).toBe('open');
    expect(buildDuplicatePayload({ ...confirmed, status: 'dns' }).status).toBe('open');
  });

  it('drops instance-specific linkage fields (promotedEventId, rescheduleOfId, id, timestamps)', () => {
    const payload = buildDuplicatePayload(confirmed);
    expect(payload.promotedEventId).toBeUndefined();
    expect(payload.rescheduleOfId).toBeUndefined();
    expect(payload.id).toBeUndefined();
    expect(payload.createdAt).toBeUndefined();
    expect(payload.updatedAt).toBeUndefined();
  });

  it('carries over the descriptive fields the user would expect to reuse', () => {
    const payload = buildDuplicatePayload(confirmed);
    expect(payload).toMatchObject({
      teamId: 't1',
      seasonId: 's1',
      weekLabel: 'Fall Week 3',
      source: 'league_assigned',
      isHome: true,
      opponentName: 'Rival FC',
      leagueMatchId: 'LCSL-42',
      matchDate: '2026-09-13',
      matchTime: '10:00',
      location: 'City Park',
      field: 'Field 3',
      deadlineDate: '2026-09-30',
      notes: 'Bring extra jerseys',
    });
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
