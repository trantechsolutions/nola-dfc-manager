import { describe, it, expect } from 'vitest';
import { expectedParentTeamId, isParentSeasonSettled, isParentSeasonPending } from '../../utils/parentSeason';

const players = [
  { teamId: 't1', guardians: [{ email: 'Mom@Example.com' }] },
  { teamId: 't2', guardians: [{ email: 'other@example.com' }] },
];

describe('expectedParentTeamId', () => {
  it('finds the guardian’s team, ignoring email case', () => {
    expect(expectedParentTeamId({ players, email: 'mom@example.com' })).toBe('t1');
  });
  it('is null for staff, a selected team, or no matching player', () => {
    expect(expectedParentTeamId({ players, email: 'mom@example.com', isStaff: true })).toBeNull();
    expect(expectedParentTeamId({ players, email: 'mom@example.com', selectedTeamId: 'x' })).toBeNull();
    expect(expectedParentTeamId({ players, email: 'nobody@example.com' })).toBeNull();
    expect(expectedParentTeamId({ players: [], email: 'mom@example.com' })).toBeNull();
  });
  it('uses the impersonated team when viewing as a parent', () => {
    expect(expectedParentTeamId({ viewingAsParent: true, impersonatingAs: { teamId: 't9' }, isStaff: true })).toBe(
      't9',
    );
  });
});

describe('isParentSeasonSettled', () => {
  const team = { id: 't1', activeSeasonId: '2025-2026' };
  const loadedFor = (season, schedule = 't1') => ({
    data: `t1|${season}`,
    checklist: `t1|${season}`,
    teamSeasons: 't1',
    schedule,
  });
  const base = { parentTeamId: 't1', loadedFor: 't1', parentTeam: team, selectedSeason: '2025-2026' };

  it('waits for the team fetch', () => {
    expect(isParentSeasonSettled({ ...base, loadedFor: null, parentTeam: null, loaded: loadedFor('2025-2026') })).toBe(
      false,
    );
  });
  it('waits until the active season is the one shown', () => {
    expect(isParentSeasonSettled({ ...base, selectedSeason: '2026-2027', loaded: loadedFor('2026-2027') })).toBe(false);
    expect(isParentSeasonSettled({ ...base, loaded: loadedFor('2025-2026') })).toBe(true);
  });
  it('waits until every load has finished for that team and season', () => {
    const done = loadedFor('2025-2026');
    expect(isParentSeasonSettled({ ...base, loaded: { ...done, data: 't1|2026-2027' } })).toBe(false);
    expect(isParentSeasonSettled({ ...base, loaded: { ...done, checklist: null } })).toBe(false);
    expect(isParentSeasonSettled({ ...base, loaded: { ...done, teamSeasons: '' } })).toBe(false);
    expect(isParentSeasonSettled({ ...base, loaded: { ...done, schedule: null } })).toBe(false);
    expect(isParentSeasonSettled({ ...base })).toBe(false);
  });
  it('settles when the team has no active season', () => {
    expect(
      isParentSeasonSettled({ ...base, parentTeam: { id: 't1' }, selectedSeason: 'x', loaded: loadedFor('x') }),
    ).toBe(true);
  });
  it('settles when the team fetch failed, with the schedule loaded for no team', () => {
    expect(isParentSeasonSettled({ ...base, parentTeam: null, selectedSeason: 'x', loaded: loadedFor('x', '') })).toBe(
      true,
    );
  });
  it('ignores a team left over from a previous id', () => {
    const loaded = { data: 't2|x', checklist: 't2|x', teamSeasons: 't2', schedule: '' };
    expect(
      isParentSeasonSettled({ parentTeamId: 't2', loadedFor: 't2', parentTeam: team, selectedSeason: 'x', loaded }),
    ).toBe(true);
  });
});

describe('isParentSeasonPending', () => {
  it('never holds staff or signed-out users', () => {
    expect(isParentSeasonPending({ signedIn: false, parentTeamId: null, expectedTeamId: 't1' })).toBe(false);
    expect(isParentSeasonPending({ signedIn: true, isStaff: true, parentTeamId: null, expectedTeamId: 't1' })).toBe(
      false,
    );
  });
  it('holds until the first data load has found the players', () => {
    expect(
      isParentSeasonPending({ signedIn: true, firstLoadDone: false, parentTeamId: null, expectedTeamId: null }),
    ).toBe(true);
  });
  it('holds while the team id has not caught up with the players', () => {
    expect(
      isParentSeasonPending({ signedIn: true, firstLoadDone: true, parentTeamId: null, expectedTeamId: 't1' }),
    ).toBe(true);
  });
  it('holds until the team’s season is settled, then releases', () => {
    expect(
      isParentSeasonPending({
        signedIn: true,
        firstLoadDone: true,
        parentTeamId: 't1',
        expectedTeamId: 't1',
        readyFor: null,
      }),
    ).toBe(true);
    expect(
      isParentSeasonPending({
        signedIn: true,
        firstLoadDone: true,
        parentTeamId: 't1',
        expectedTeamId: 't1',
        readyFor: 't1',
      }),
    ).toBe(false);
  });
  it('does not hold a parent with no team (e.g. a scorekeeper only)', () => {
    expect(
      isParentSeasonPending({ signedIn: true, firstLoadDone: true, parentTeamId: null, expectedTeamId: null }),
    ).toBe(false);
  });
});
