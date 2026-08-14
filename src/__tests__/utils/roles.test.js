import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  getAccessibleTeamIds,
  getHighestTeamRole,
  getNavItemsForRole,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  CLUB_ROLES,
  TEAM_ROLES,
  TEAM_ASSIGNABLE_ROLES,
} from '../../utils/roles';

// ── Test data factories ───────────────────────────────────────────────────────

const TEAM_A = 'team-uuid-a';
const TEAM_B = 'team-uuid-b';
const CLUB_ID = 'club-uuid-1';

const makeRole = (role, teamId = null, clubId = CLUB_ID) => ({ role, teamId, clubId });

const roles = {
  clubAdmin: [makeRole('club_admin')],
  clubManager: [makeRole('club_manager')],
  teamManager: [makeRole('team_manager', TEAM_A)],
  treasurer: [makeRole('treasurer', TEAM_A)],
  scheduler: [makeRole('scheduler', TEAM_A)],
  headCoach: [makeRole('head_coach', TEAM_A)],
  assistantCoach: [makeRole('assistant_coach', TEAM_A)],
  fundraiser: [makeRole('fundraiser', TEAM_A)],
  noRoles: [],
  multiTeam: [makeRole('treasurer', TEAM_A), makeRole('scheduler', TEAM_B)],
};

// ── hasPermission ─────────────────────────────────────────────────────────────
describe('hasPermission', () => {
  describe('club_admin', () => {
    it('passes all club permissions', () => {
      expect(hasPermission(roles.clubAdmin, PERMISSIONS.CLUB_SETTINGS)).toBe(true);
      expect(hasPermission(roles.clubAdmin, PERMISSIONS.CLUB_MANAGE_ROLES)).toBe(true);
      expect(hasPermission(roles.clubAdmin, PERMISSIONS.CLUB_MANAGE_TEAMS)).toBe(true);
    });

    it('passes all team permissions on any team', () => {
      expect(hasPermission(roles.clubAdmin, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_A)).toBe(true);
      expect(hasPermission(roles.clubAdmin, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_B)).toBe(true);
      expect(hasPermission(roles.clubAdmin, PERMISSIONS.TEAM_MANAGE_USERS, TEAM_A)).toBe(true);
    });
  });

  describe('club_manager', () => {
    it('passes view-only club permissions', () => {
      expect(hasPermission(roles.clubManager, PERMISSIONS.CLUB_VIEW_FINANCIALS)).toBe(true);
      expect(hasPermission(roles.clubManager, PERMISSIONS.CLUB_VIEW_ANY_TEAM)).toBe(true);
    });

    it('cannot edit club settings or manage roles', () => {
      expect(hasPermission(roles.clubManager, PERMISSIONS.CLUB_SETTINGS)).toBe(false);
      expect(hasPermission(roles.clubManager, PERMISSIONS.CLUB_MANAGE_ROLES)).toBe(false);
      expect(hasPermission(roles.clubManager, PERMISSIONS.CLUB_MANAGE_TEAMS)).toBe(false);
    });

    it('can view team data on any team', () => {
      expect(hasPermission(roles.clubManager, PERMISSIONS.TEAM_VIEW_LEDGER, TEAM_A)).toBe(true);
      expect(hasPermission(roles.clubManager, PERMISSIONS.TEAM_VIEW_LEDGER, TEAM_B)).toBe(true);
    });

    it('cannot edit team data', () => {
      expect(hasPermission(roles.clubManager, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_A)).toBe(false);
      expect(hasPermission(roles.clubManager, PERMISSIONS.TEAM_EDIT_ROSTER, TEAM_A)).toBe(false);
    });
  });

  describe('treasurer', () => {
    it('can view and edit ledger on assigned team', () => {
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_VIEW_LEDGER, TEAM_A)).toBe(true);
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_A)).toBe(true);
    });

    it('can manage budget and sponsors on assigned team', () => {
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_VIEW_BUDGET, TEAM_A)).toBe(true);
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_EDIT_BUDGET, TEAM_A)).toBe(true);
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_EDIT_SPONSORS, TEAM_A)).toBe(true);
    });

    it('cannot manage users', () => {
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_MANAGE_USERS, TEAM_A)).toBe(false);
    });

    it('cannot edit schedule', () => {
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_EDIT_SCHEDULE, TEAM_A)).toBe(false);
    });

    it('has NO permissions on a different team', () => {
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_VIEW_LEDGER, TEAM_B)).toBe(false);
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_B)).toBe(false);
    });
  });

  describe('scheduler', () => {
    it('can edit schedule on assigned team', () => {
      expect(hasPermission(roles.scheduler, PERMISSIONS.TEAM_EDIT_SCHEDULE, TEAM_A)).toBe(true);
    });

    it('can view roster', () => {
      expect(hasPermission(roles.scheduler, PERMISSIONS.TEAM_VIEW_ROSTER, TEAM_A)).toBe(true);
    });

    it('cannot edit roster or ledger', () => {
      expect(hasPermission(roles.scheduler, PERMISSIONS.TEAM_EDIT_ROSTER, TEAM_A)).toBe(false);
      expect(hasPermission(roles.scheduler, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_A)).toBe(false);
    });

    // Booking the home field commits a club-wide resource, so a scheduler
    // files a request and a club admin settles it. Only the team's own
    // manager takes a block outright — see guard_field_booking_decision()
    // in sql/field_scheduling_migration.sql, which enforces the same split.
    it('cannot book a home-field block outright', () => {
      expect(hasPermission(roles.scheduler, PERMISSIONS.TEAM_BOOK_FIELD, TEAM_A)).toBe(false);
    });
  });

  describe('team:book_field', () => {
    it('is granted to the team manager on their own team', () => {
      expect(hasPermission(roles.teamManager, PERMISSIONS.TEAM_BOOK_FIELD, TEAM_A)).toBe(true);
    });

    it('does not follow the manager onto another team', () => {
      expect(hasPermission(roles.teamManager, PERMISSIONS.TEAM_BOOK_FIELD, TEAM_B)).toBe(false);
    });

    it('is granted to a club admin on any team', () => {
      expect(hasPermission(roles.clubAdmin, PERMISSIONS.TEAM_BOOK_FIELD, TEAM_B)).toBe(true);
    });

    it('is withheld from view-only and money-only roles', () => {
      expect(hasPermission(roles.clubManager, PERMISSIONS.TEAM_BOOK_FIELD, TEAM_A)).toBe(false);
      expect(hasPermission(roles.treasurer, PERMISSIONS.TEAM_BOOK_FIELD, TEAM_A)).toBe(false);
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_BOOK_FIELD, TEAM_A)).toBe(false);
    });
  });

  describe('head_coach', () => {
    it('can view roster and schedule only (no financials)', () => {
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_VIEW_ROSTER, TEAM_A)).toBe(true);
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_VIEW_SCHEDULE, TEAM_A)).toBe(true);
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_VIEW_BUDGET, TEAM_A)).toBe(false);
    });

    it('cannot edit anything', () => {
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_EDIT_ROSTER, TEAM_A)).toBe(false);
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_EDIT_BUDGET, TEAM_A)).toBe(false);
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_EDIT_SCHEDULE, TEAM_A)).toBe(false);
    });

    it('cannot view ledger or sponsors', () => {
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_VIEW_LEDGER, TEAM_A)).toBe(false);
      expect(hasPermission(roles.headCoach, PERMISSIONS.TEAM_VIEW_SPONSORS, TEAM_A)).toBe(false);
    });
  });

  describe('assistant_coach', () => {
    it('can only view roster and schedule', () => {
      expect(hasPermission(roles.assistantCoach, PERMISSIONS.TEAM_VIEW_ROSTER, TEAM_A)).toBe(true);
      expect(hasPermission(roles.assistantCoach, PERMISSIONS.TEAM_VIEW_SCHEDULE, TEAM_A)).toBe(true);
    });

    it('cannot view budget', () => {
      expect(hasPermission(roles.assistantCoach, PERMISSIONS.TEAM_VIEW_BUDGET, TEAM_A)).toBe(false);
    });
  });

  describe('fundraiser', () => {
    it('can view and edit sponsors on assigned team', () => {
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_VIEW_SPONSORS, TEAM_A)).toBe(true);
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_EDIT_SPONSORS, TEAM_A)).toBe(true);
    });

    it('can view roster and budget', () => {
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_VIEW_ROSTER, TEAM_A)).toBe(true);
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_VIEW_BUDGET, TEAM_A)).toBe(true);
    });

    it('cannot edit budget or touch the ledger', () => {
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_EDIT_BUDGET, TEAM_A)).toBe(false);
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_VIEW_LEDGER, TEAM_A)).toBe(false);
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_A)).toBe(false);
    });

    it('cannot manage users or edit schedule', () => {
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_MANAGE_USERS, TEAM_A)).toBe(false);
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_EDIT_SCHEDULE, TEAM_A)).toBe(false);
    });

    it('has NO permissions on a different team', () => {
      expect(hasPermission(roles.fundraiser, PERMISSIONS.TEAM_VIEW_SPONSORS, TEAM_B)).toBe(false);
    });
  });

  describe('no roles (parent)', () => {
    it('fails every permission check', () => {
      Object.values(PERMISSIONS).forEach((perm) => {
        expect(hasPermission(roles.noRoles, perm, TEAM_A)).toBe(false);
      });
    });
  });

  describe('multi-team user', () => {
    it('treasurer on team A cannot access team B ledger', () => {
      expect(hasPermission(roles.multiTeam, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_A)).toBe(true);
      expect(hasPermission(roles.multiTeam, PERMISSIONS.TEAM_EDIT_LEDGER, TEAM_B)).toBe(false);
    });

    it('scheduler on team B cannot edit schedule on team A', () => {
      expect(hasPermission(roles.multiTeam, PERMISSIONS.TEAM_EDIT_SCHEDULE, TEAM_B)).toBe(true);
      expect(hasPermission(roles.multiTeam, PERMISSIONS.TEAM_EDIT_SCHEDULE, TEAM_A)).toBe(false);
    });
  });
});

// ── getAccessibleTeamIds ──────────────────────────────────────────────────────
describe('getAccessibleTeamIds', () => {
  const allTeams = [TEAM_A, TEAM_B, 'team-uuid-c'];

  it('club_admin gets all teams', () => {
    expect(getAccessibleTeamIds(roles.clubAdmin, allTeams)).toEqual(allTeams);
  });

  it('club_manager gets all teams', () => {
    expect(getAccessibleTeamIds(roles.clubManager, allTeams)).toEqual(allTeams);
  });

  it('team role user gets only their team', () => {
    const result = getAccessibleTeamIds(roles.treasurer, allTeams);
    expect(result).toContain(TEAM_A);
    expect(result).not.toContain(TEAM_B);
  });

  it('multi-team user gets both their teams', () => {
    const result = getAccessibleTeamIds(roles.multiTeam, allTeams);
    expect(result).toContain(TEAM_A);
    expect(result).toContain(TEAM_B);
    expect(result).not.toContain('team-uuid-c');
  });

  it('user with no roles gets empty array', () => {
    expect(getAccessibleTeamIds(roles.noRoles, allTeams)).toHaveLength(0);
  });
});

// ── getHighestTeamRole ────────────────────────────────────────────────────────
describe('getHighestTeamRole', () => {
  it('returns club_admin for a club admin regardless of team', () => {
    expect(getHighestTeamRole(roles.clubAdmin, TEAM_A)).toBe('club_admin');
  });

  it('returns club_manager for a club manager', () => {
    expect(getHighestTeamRole(roles.clubManager, TEAM_A)).toBe('club_manager');
  });

  it('returns the correct team role for each role', () => {
    expect(getHighestTeamRole(roles.teamManager, TEAM_A)).toBe('team_manager');
    expect(getHighestTeamRole(roles.treasurer, TEAM_A)).toBe('treasurer');
    expect(getHighestTeamRole(roles.scheduler, TEAM_A)).toBe('scheduler');
    expect(getHighestTeamRole(roles.headCoach, TEAM_A)).toBe('head_coach');
    expect(getHighestTeamRole(roles.assistantCoach, TEAM_A)).toBe('assistant_coach');
    expect(getHighestTeamRole(roles.fundraiser, TEAM_A)).toBe('fundraiser');
  });

  it('prefers fundraiser over head_coach when both present', () => {
    const both = [makeRole('head_coach', TEAM_A), makeRole('fundraiser', TEAM_A)];
    expect(getHighestTeamRole(both, TEAM_A)).toBe('fundraiser');
  });

  it('returns null for a user with no role on the given team', () => {
    expect(getHighestTeamRole(roles.treasurer, TEAM_B)).toBeNull();
  });

  it('returns null for a user with no roles at all', () => {
    expect(getHighestTeamRole(roles.noRoles, TEAM_A)).toBeNull();
  });

  it('prefers team_manager over treasurer when both present', () => {
    const both = [makeRole('treasurer', TEAM_A), makeRole('team_manager', TEAM_A)];
    expect(getHighestTeamRole(both, TEAM_A)).toBe('team_manager');
  });
});

// ── getNavItemsForRole ────────────────────────────────────────────────────────
describe('getNavItemsForRole', () => {
  it('club_admin sees all nav items', () => {
    const items = getNavItemsForRole(roles.clubAdmin, TEAM_A);
    expect(items).toContain('dashboard');
    expect(items).toContain('ledger');
    expect(items).toContain('budget');
    expect(items).toContain('sponsors');
    expect(items).toContain('insights');
    expect(items).toContain('schedule');
    expect(items).toContain('team-users');
  });

  it('head_coach sees only dashboard and schedule', () => {
    const items = getNavItemsForRole(roles.headCoach, TEAM_A);
    expect(items).toContain('dashboard');
    expect(items).toContain('schedule');
    expect(items).not.toContain('ledger');
    expect(items).not.toContain('team-users');
  });

  it('assistant_coach sees only dashboard and schedule', () => {
    const items = getNavItemsForRole(roles.assistantCoach, TEAM_A);
    expect(items).toContain('dashboard');
    expect(items).toContain('schedule');
    expect(items).not.toContain('budget');
  });

  it('treasurer sees ledger, budget, sponsors, insights but not team-users', () => {
    const items = getNavItemsForRole(roles.treasurer, TEAM_A);
    expect(items).toContain('ledger');
    expect(items).toContain('budget');
    expect(items).toContain('sponsors');
    expect(items).toContain('insights');
    expect(items).not.toContain('team-users');
  });

  it('fundraiser sees dashboard, budget, sponsors but not ledger or team-users', () => {
    const items = getNavItemsForRole(roles.fundraiser, TEAM_A);
    expect(items).toContain('dashboard');
    expect(items).toContain('budget');
    expect(items).toContain('sponsors');
    expect(items).not.toContain('ledger');
    expect(items).not.toContain('team-users');
  });

  it('parent (no roles) sees no nav items', () => {
    expect(getNavItemsForRole(roles.noRoles, TEAM_A)).toHaveLength(0);
  });
});

// ── ROLE_PERMISSIONS completeness ─────────────────────────────────────────────
describe('ROLE_PERMISSIONS matrix', () => {
  it('every role in CLUB_ROLES and TEAM_ROLES has a permissions entry', () => {
    const allRoleKeys = [...Object.keys(CLUB_ROLES), ...Object.keys(TEAM_ROLES)];
    allRoleKeys.forEach((role) => {
      expect(ROLE_PERMISSIONS).toHaveProperty(role);
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    });
  });

  it('team_manager has full team access, including managing users and the rubric', () => {
    expect(ROLE_PERMISSIONS.team_manager).toContain(PERMISSIONS.TEAM_MANAGE_USERS);
    expect(ROLE_PERMISSIONS.team_manager).toContain(PERMISSIONS.TEAM_MANAGE_RUBRIC);
  });

  it('fundraiser is team-assignable alongside treasurer and scheduler', () => {
    expect(TEAM_ASSIGNABLE_ROLES).toContain('fundraiser');
    expect(TEAM_ASSIGNABLE_ROLES).toContain('treasurer');
    expect(TEAM_ASSIGNABLE_ROLES).toContain('scheduler');
  });
});
