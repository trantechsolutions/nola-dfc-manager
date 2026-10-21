// The season numbers card shows what the game film recorded, each "out of" the games that recorded it,
// and stays out of the way when there is nothing for the season.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const getPlayerStats = vi.fn();
vi.mock('../../services/filmService', () => ({ filmService: { getPlayerStats: (...a) => getPlayerStats(...a) } }));

const { default: PlayerFilmStats } = await import('../../components/PlayerFilmStats');

const STATS = {
  games: 7,
  minutes: 315,
  available: 420,
  timedGames: 8,
  starts: 6,
  positions: [
    { pos: 'CM', minutes: 250 },
    { pos: 'RW', minutes: 65 },
  ],
  goals: 3,
  assists: 2,
  shots: 9,
  onTarget: 5,
  yellow: 1,
  red: 0,
  eventGames: 5,
  sources: ['lineup', 'keeper'],
};

describe('PlayerFilmStats', () => {
  beforeEach(() => getPlayerStats.mockReset());

  it("shows the season's minutes, starts, goals and positions for the player and season", async () => {
    getPlayerStats.mockResolvedValue(STATS);
    render(<PlayerFilmStats playerId="p1" seasonId="2025-2026" />);
    expect(await screen.findByText('315')).toBeInTheDocument();
    expect(getPlayerStats).toHaveBeenCalledWith('p1', '2025-2026');
    expect(screen.getByText('75% of available')).toBeInTheDocument();
    expect(screen.getByText('of 8 games')).toBeInTheDocument();
    expect(screen.getByText('of 5 games')).toBeInTheDocument();
    expect(screen.getByText('5 on target')).toBeInTheDocument();
    expect(screen.getByText(/CM 250′ · RW 65′/)).toBeInTheDocument();
    expect(screen.getByText('Cards: 1 yellow, 0 red')).toBeInTheDocument();
  });

  it('leaves out what no game recorded', async () => {
    getPlayerStats.mockResolvedValue({ ...STATS, eventGames: 0, goals: 0, assists: 0, shots: 0, yellow: 0 });
    render(<PlayerFilmStats playerId="p1" seasonId="2025-2026" />);
    expect(await screen.findByText('315')).toBeInTheDocument();
    expect(screen.queryByText('Goals')).not.toBeInTheDocument();
  });

  it('renders nothing without numbers for the season', async () => {
    getPlayerStats.mockResolvedValue(null);
    const { container } = render(<PlayerFilmStats playerId="p1" seasonId="2025-2026" />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
