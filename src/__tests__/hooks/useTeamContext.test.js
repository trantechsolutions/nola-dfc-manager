import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// ── Mock supabaseService before importing the hook ────────────────────────────
vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getUserRoles: vi.fn(),
    getAllClubs: vi.fn(),
    getClub: vi.fn(),
    getClubForUser: vi.fn(),
    getTeams: vi.fn(),
  },
}));

import { supabaseService } from '../../services/supabaseService';
import { useTeamContext } from '../../hooks/useTeamContext';

const CLUB = { id: 'club-1', name: 'NOLA DFC' };
const TEAM = { id: 'team-1', name: 'U12 Boys', clubId: 'club-1' };
const USER = { id: 'user-1', email: 'coach@example.com' };
const MANAGER_ROLE = { role: 'team_manager', teamId: 'team-1', clubId: 'club-1' };

// Lets a test hold the roles fetch open and resolve it on demand, which is the
// only way to observe the window this hook's `loading` flag is meant to cover.
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('useTeamContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    supabaseService.getClub.mockResolvedValue(CLUB);
    supabaseService.getClubForUser.mockResolvedValue(CLUB);
    supabaseService.getTeams.mockResolvedValue([TEAM]);
  });

  it('resolves to not-loading for an anonymous visitor', async () => {
    const { result } = renderHook(() => useTeamContext(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(supabaseService.getUserRoles).not.toHaveBeenCalled();
  });

  // The regression this hook's loadedUserId guard exists for: App batches
  // `setUser` with its own `setLoading(false)`, so there is a commit where the
  // hook has a user but has not yet re-fetched. If `loading` reads false there,
  // every route guard sees an empty role set, the router's catch-all fires and
  // the deep-linked URL is replaced by /dashboard before roles ever arrive.
  it('never renders as loaded-with-no-roles on the commit where a user first appears', async () => {
    const roles = deferred();
    supabaseService.getUserRoles.mockReturnValue(roles.promise);

    // Snapshot every render, not just the last: the damage happens during the
    // render pass App commits when it sets `user` — effects have not run yet, so
    // `result.current` after the fact cannot see it.
    const renders = [];
    const { result, rerender } = renderHook(
      ({ user }) => {
        const ctx = useTeamContext(user);
        renders.push({ userId: user?.id ?? null, loading: ctx.loading, roleCount: ctx.userRoles.length });
        return ctx;
      },
      { initialProps: { user: null } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    renders.length = 0;
    rerender({ user: USER });

    const blindSpots = renders.filter((r) => r.userId === USER.id && !r.loading && r.roleCount === 0);
    expect(blindSpots).toEqual([]);

    await act(async () => {
      roles.resolve([MANAGER_ROLE]);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userRoles).toEqual([MANAGER_ROLE]);
    expect(result.current.isStaff).toBe(true);
  });

  it('stays loading while switching to a different user', async () => {
    supabaseService.getUserRoles.mockResolvedValue([MANAGER_ROLE]);
    const { result, rerender } = renderHook(({ user }) => useTeamContext(user), {
      initialProps: { user: USER },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const next = deferred();
    supabaseService.getUserRoles.mockReturnValue(next.promise);
    rerender({ user: { id: 'user-2', email: 'other@example.com' } });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      next.resolve([]);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('stops loading even when the roles fetch fails', async () => {
    supabaseService.getUserRoles.mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useTeamContext(USER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userRoles).toEqual([]);
  });

  it('selects the user’s team and exposes its permissions once resolved', async () => {
    supabaseService.getUserRoles.mockResolvedValue([MANAGER_ROLE]);
    const { result } = renderHook(() => useTeamContext(USER));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.club).toEqual(CLUB);
    expect(result.current.selectedTeamId).toBe(TEAM.id);
    expect(result.current.can(result.current.PERMISSIONS.TEAM_EDIT_ROSTER)).toBe(true);
  });
});
