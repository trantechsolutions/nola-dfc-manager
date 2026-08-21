// The club player directory shares the users-page template. These pin the
// parts the conversion introduced: table rows, badges, filtering, and the
// pagination it previously had none of.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The view opens its panels through the URL now (usePanelRoute), so it needs a
// router around it the same way the app supplies one.
import { MemoryRouter } from 'react-router-dom';

const getPlayersByClub = vi.fn();
vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getPlayersByClub: (...a) => getPlayersByClub(...a),
    updatePlayerField: vi.fn().mockResolvedValue({}),
    transferPlayer: vi.fn().mockResolvedValue({}),
    addPlayer: vi.fn().mockResolvedValue({}),
    addGuardian: vi.fn().mockResolvedValue({}),
    updatePlayer: vi.fn().mockResolvedValue({}),
  },
}));

import ClubPlayersView from '../../views/club/ClubPlayersView';

const club = { id: 'c1', name: 'NOLA DFC' };
const teams = [
  { id: 't1', name: 'U12 Boys', ageGroup: 'U12' },
  { id: 't2', name: 'U14 Girls', ageGroup: 'U14' },
];

const player = (i, overrides = {}) => ({
  id: `p${i}`,
  firstName: 'Player',
  lastName: String(i).padStart(2, '0'),
  status: 'active',
  teamId: 't1',
  teamName: 'U12 Boys',
  jerseyNumber: i,
  guardians: [],
  ...overrides,
});

function renderView() {
  return render(
    <MemoryRouter>
      <ClubPlayersView
        club={club}
        teams={teams}
        seasons={[]}
        selectedSeason="2025-26"
        showToast={vi.fn()}
        showConfirm={vi.fn()}
      />
    </MemoryRouter>,
  );
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('ClubPlayersView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists players in the shared directory table', async () => {
    getPlayersByClub.mockResolvedValue([
      player(1, { guardians: [{ name: 'Ada Lovelace', email: 'ada@example.com' }] }),
      player(2, { teamId: null, teamName: null }),
    ]);
    renderView();

    await screen.findByRole('table');
    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(rows()[0]).getByText('U12 Boys')).toBeInTheDocument();
    // An unassigned player is called out rather than left blank.
    expect(within(rows()[1]).getByText('Unassigned')).toBeInTheDocument();
  });

  it('pages long rosters and reports the range', async () => {
    getPlayersByClub.mockResolvedValue(Array.from({ length: 60 }, (_, i) => player(i + 1)));
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText('Showing 1 to 25 of 60 players')).toBeInTheDocument();
    expect(rows()).toHaveLength(25);

    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(screen.getByText('Showing 51 to 60 of 60 players')).toBeInTheDocument();
    expect(rows()).toHaveLength(10);
  });

  it('searching from a later page returns to the first', async () => {
    getPlayersByClub.mockResolvedValue(Array.from({ length: 60 }, (_, i) => player(i + 1)));
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: 'Page 3' }));
    await user.type(screen.getByRole('searchbox', { name: /search players/i }), 'Player 07');

    expect(screen.getByText('Showing 1 to 1 of 1 player')).toBeInTheDocument();
  });

  it('says so plainly when nothing matches', async () => {
    getPlayersByClub.mockResolvedValue([player(1)]);
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByRole('searchbox', { name: /search players/i }), 'zzz');
    expect(screen.getByText('No players found.')).toBeInTheDocument();
  });
});
