import { describe, expect, it } from 'vitest';
import { playerName, squadFrom } from '../../film/squad';

const players = [
  { id: 'p1', first_name: 'Ana', last_name: 'Diaz', jersey_number: '7' },
  { id: 'p2', first_name: 'Bea  ', last_name: 'Lee', jersey_number: null },
];

describe('squadFrom', () => {
  it('names players with positions, by manager record', () => {
    const { roster } = squadFrom(
      players,
      [
        { player_id: 'p2', positions: ['ST'] },
        { player_id: 'p1', positions: ['GK'] },
      ],
      [],
    );
    expect(roster.players).toEqual([
      { name: 'Ana Diaz', number: 7, positions: ['GK'], managerId: 'p1' },
      { name: 'Bea Lee', number: null, positions: ['ST'], managerId: 'p2' },
    ]);
  });

  it('leaves out positions for players no longer on the team', () => {
    expect(squadFrom(players, [{ player_id: 'gone', positions: ['CB'] }], []).roster.players).toEqual([]);
  });

  it('turns lineup ids back into names and keeps unknown names as written', () => {
    const { lineups } = squadFrom(
      players,
      [],
      [
        { slug: '*', lineup: { start: [{ pos: 'GK', player: 'p1' }], changes: [] } },
        {
          slug: '2026-10-18-brsc',
          lineup: {
            start: [{ pos: 'ST', player: 'p2' }],
            changes: [
              { h: 2, c: '0:00', off: 'p2', on: 'Jorge Guest' },
              { h: 2, c: '5:00', player: 'Jorge Guest', pos: 'LM' },
            ],
            estimated: true,
          },
        },
      ],
    );
    expect(lineups.default).toEqual({ start: [{ pos: 'GK', player: 'Ana Diaz' }] });
    expect(lineups.games['2026-10-18-brsc']).toEqual({
      start: [{ pos: 'ST', player: 'Bea Lee' }],
      changes: [
        { h: 2, c: '0:00', off: 'Bea Lee', on: 'Jorge Guest' },
        { h: 2, c: '5:00', player: 'Jorge Guest', pos: 'LM' },
      ],
      estimated: true,
    });
  });

  it('collapses extra spaces in names', () => {
    expect(playerName({ first_name: ' Ana ', last_name: 'de  la Cruz' })).toBe('Ana de la Cruz');
  });
});
