// Once the tape has been run after the game (npm run film -- postgame), the kept game's Stats tab shows the
// numbers estimated from the video, marked as estimates, below the scorekeeper's.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));

const getVideoStats = vi.fn();
const setup = {
  slug: '2026-10-24-mandeville',
  date: '2026-10-24',
  time: '09:00',
  opponent: 'Mandeville',
  home: true,
  format: 7,
  halfMin: 30,
  start: [],
  eventId: '00000000-0000-4000-8000-000000000001',
};
const at = (m) => Date.UTC(2026, 9, 24, 14, m);
const entries = [
  { id: 'entry-0001', at: at(0), k: 'setup', setup },
  { id: 'entry-0002', at: at(1), k: 'clock', h: 1, c: '0:00', run: true },
  { id: 'entry-0003', at: at(31), k: 'end', h: 1, c: '30:00' },
  { id: 'entry-0004', at: at(40), k: 'clock', h: 2, c: '0:00', run: true },
  { id: 'entry-0005', at: at(70), k: 'end', h: 2, c: '30:00' },
];
vi.mock('../../services/liveGameService', () => ({
  liveGameService: {
    getEntries: async () => entries,
    subscribe: () => () => {},
    getVideoStats: (...a) => getVideoStats(...a),
  },
}));

const { default: LiveGameView } = await import('../../views/film/LiveGameView');

const STATS = {
  possession: [58, 42],
  passes: [91, 64],
  turnovers: [33, 40],
  halves: { 1: { possession: { DFC: 0.6, OPP: 0.4 } }, 2: { possession: { DFC: 0.56, OPP: 0.44 } } },
  stretches: [{ half: 1, from: '0:00', dfc: 61 }],
  halfLength: { 1: '30:40', 2: '31:05' },
};

const open = () =>
  render(
    <MemoryRouter initialEntries={['/live/team-1/2026-10-24-mandeville']}>
      <Routes>
        <Route path="/live/:teamId/:game" element={<LiveGameView />} />
      </Routes>
    </MemoryRouter>,
  );

describe('LiveGameView video estimates', () => {
  beforeEach(() => getVideoStats.mockReset());

  it('shows the estimates under Stats once the game is over', async () => {
    getVideoStats.mockResolvedValue({ stats: STATS, unsure: false });
    open();
    fireEvent.click(await screen.findByRole('tab', { name: 'Stats' }));
    expect(await screen.findByText('Estimated from the video')).toBeInTheDocument();
    expect(getVideoStats).toHaveBeenCalledWith('team-1', '2026-10-24-mandeville', setup.eventId);
    expect(screen.getByText('58%')).toBeInTheDocument();
    expect(screen.getByText('Completed passes')).toBeInTheDocument();
    expect(screen.getByText("1st half 0–5'")).toBeInTheDocument();
    expect(screen.queryByText(/struggled to tell the kits apart/)).not.toBeInTheDocument();
  });

  it('marks estimates the model was unsure of', async () => {
    getVideoStats.mockResolvedValue({ stats: STATS, unsure: true });
    open();
    fireEvent.click(await screen.findByRole('tab', { name: 'Stats' }));
    expect(await screen.findByText(/struggled to tell the kits apart/)).toBeInTheDocument();
  });

  it('leaves the section out when the tape has not been run', async () => {
    getVideoStats.mockResolvedValue(null);
    open();
    fireEvent.click(await screen.findByRole('tab', { name: 'Stats' }));
    await screen.findByText('Goals');
    expect(screen.queryByText('Estimated from the video')).not.toBeInTheDocument();
  });
});
