import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getAllSeasons: vi.fn(async () => [{ id: '2026-2027' }, { id: '2027-2028' }]),
    getTeamSeasons: vi.fn(async () => []),
  },
}));

import { useSoccerYear } from '../../hooks/useSoccerYear';

const USER = { id: 'u1' };

describe("useSoccerYear: the team's active season", () => {
  it('opens on the active season, keeps a manual pick, and moves with the team', async () => {
    const { result, rerender } = renderHook(({ team, def }) => useSoccerYear(USER, team, def), {
      initialProps: { team: 'team-a', def: '2026-2027' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedSeason).toBe('2026-2027');

    // A manager budgets next season: the pick sticks across re-renders with the same team and default.
    act(() => result.current.setSelectedSeason('2027-2028'));
    rerender({ team: 'team-a', def: '2026-2027' });
    expect(result.current.selectedSeason).toBe('2027-2028');

    // Another team, or a new active season for this one, opens on its active season again.
    rerender({ team: 'team-b', def: '2026-2027' });
    expect(result.current.selectedSeason).toBe('2026-2027');
    rerender({ team: 'team-b', def: '2027-2028' });
    expect(result.current.selectedSeason).toBe('2027-2028');
  });
});
