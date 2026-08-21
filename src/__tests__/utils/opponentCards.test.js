import { describe, it, expect } from 'vitest';
import { buildOpponentCards, clubAccent, clubInitials, clubKey, UNASSIGNED_KEY } from '../../utils/opponentCards';

const matchup = (over = {}) => ({
  id: 'm1',
  opponentName: 'Bayou FC',
  matchDate: '2026-03-01',
  matchTime: null,
  status: 'open',
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

const contact = (over = {}) => ({ id: 'c1', clubName: 'Bayou FC', contactName: 'Sam', ...over });

describe('clubKey', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(clubKey('  Bayou FC ')).toBe('bayou fc');
    expect(clubKey(null)).toBe('');
  });
});

describe('buildOpponentCards', () => {
  it('gives a saved contact a card even with no games yet', () => {
    const cards = buildOpponentCards([contact()], []);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ clubName: 'Bayou FC', unsaved: false });
    expect(cards[0].contact.id).toBe('c1');
    expect(cards[0].matchups).toEqual([]);
  });

  it('hangs a game on its club card regardless of case or padding', () => {
    const cards = buildOpponentCards([contact()], [matchup({ opponentName: ' bayou fc ' })]);
    expect(cards).toHaveLength(1);
    expect(cards[0].matchups.map((m) => m.id)).toEqual(['m1']);
    expect(cards[0].unsaved).toBe(false);
  });

  it('makes a card for an opponent that is not in the directory and flags it unsaved', () => {
    const cards = buildOpponentCards([], [matchup({ opponentName: 'Gulf United' })]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ clubName: 'Gulf United', contact: null, unsaved: true });
  });

  it('collects games with no opponent into a single trailing card', () => {
    const cards = buildOpponentCards(
      [contact()],
      [matchup(), matchup({ id: 'm2', opponentName: '' }), matchup({ id: 'm3', opponentName: null })],
    );
    const last = cards[cards.length - 1];
    expect(last.key).toBe(UNASSIGNED_KEY);
    expect(last.isUnassigned).toBe(true);
    expect(last.matchups.map((m) => m.id)).toEqual(['m2', 'm3']);
  });

  it('sorts cards by club name and games by date, undated last', () => {
    const cards = buildOpponentCards(
      [contact({ id: 'c2', clubName: 'Zulu SC' }), contact()],
      [
        matchup({ id: 'undated', matchDate: null }),
        matchup({ id: 'late', matchDate: '2026-04-02' }),
        matchup({ id: 'early', matchDate: '2026-03-15' }),
      ],
    );
    expect(cards.map((c) => c.clubName)).toEqual(['Bayou FC', 'Zulu SC']);
    expect(cards[0].matchups.map((m) => m.id)).toEqual(['early', 'late', 'undated']);
  });

  it('collapses two contacts saved under the same club name onto one card', () => {
    const cards = buildOpponentCards([contact(), contact({ id: 'c-dup', clubName: 'bayou fc' })], [matchup()]);
    expect(cards).toHaveLength(1);
    expect(cards[0].contact.id).toBe('c1');
    expect(cards[0].matchups).toHaveLength(1);
  });

  it('does not mutate the matchups it was handed', () => {
    const rows = [matchup({ id: 'b', matchDate: '2026-05-01' }), matchup({ id: 'a', matchDate: '2026-01-01' })];
    buildOpponentCards([], rows);
    expect(rows.map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('card identity', () => {
  it('gives a club the same accent every time and a neutral one with no key', () => {
    expect(clubAccent('bayou fc')).toEqual(clubAccent('bayou fc'));
    expect(clubAccent(null).tile).toContain('bg-muted');
  });

  it('builds initials from the first two words', () => {
    expect(clubInitials('Bayou FC')).toBe('BF');
    expect(clubInitials('kickers')).toBe('K');
    expect(clubInitials('   ')).toBe('?');
  });
});
