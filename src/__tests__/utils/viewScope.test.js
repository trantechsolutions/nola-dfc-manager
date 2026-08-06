import { describe, it, expect, beforeEach } from 'vitest';
import { VIEW_SCOPE, readViewScope, writeViewScope, isClubUiHidden } from '../../utils/viewScope';

describe('viewScope', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to club scope when nothing is stored', () => {
    expect(readViewScope('user-1')).toBe(VIEW_SCOPE.CLUB);
  });

  it('round-trips the team scope for a user', () => {
    writeViewScope('user-1', VIEW_SCOPE.TEAM);
    expect(readViewScope('user-1')).toBe(VIEW_SCOPE.TEAM);
  });

  it('keeps each user’s preference separate on a shared browser', () => {
    writeViewScope('user-1', VIEW_SCOPE.TEAM);
    expect(readViewScope('user-2')).toBe(VIEW_SCOPE.CLUB);
  });

  it('clears the stored value when switching back to club scope', () => {
    writeViewScope('user-1', VIEW_SCOPE.TEAM);
    writeViewScope('user-1', VIEW_SCOPE.CLUB);
    expect(localStorage.getItem('nola_view_scope:user-1')).toBeNull();
    expect(readViewScope('user-1')).toBe(VIEW_SCOPE.CLUB);
  });

  it('treats an unrecognized stored value as club scope', () => {
    localStorage.setItem('nola_view_scope:user-1', 'nonsense');
    expect(readViewScope('user-1')).toBe(VIEW_SCOPE.CLUB);
  });

  describe('isClubUiHidden', () => {
    it('shows club UI for a club-scoped admin outside single-team mode', () => {
      expect(isClubUiHidden({ singleTeam: false, viewScope: VIEW_SCOPE.CLUB })).toBe(false);
    });

    it('hides club UI when the admin narrows to team scope', () => {
      expect(isClubUiHidden({ singleTeam: false, viewScope: VIEW_SCOPE.TEAM })).toBe(true);
    });

    it('hides club UI in single-team mode regardless of scope', () => {
      expect(isClubUiHidden({ singleTeam: true, viewScope: VIEW_SCOPE.CLUB })).toBe(true);
    });

    it('defaults to showing club UI with no arguments', () => {
      expect(isClubUiHidden()).toBe(false);
    });
  });
});
