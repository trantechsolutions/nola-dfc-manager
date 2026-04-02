// src/utils/roles.js
// Centralized role definitions, permission matrix, and helper functions.

/**
 * APP-LEVEL ROLES
 * Global admin — can manage all clubs in the system.
 */
export const APP_ROLES = {
  super_admin: {
    label: 'Super Admin',
    level: 'app',
    description: 'Global administrator. Can create, edit, and delete clubs. Has all permissions everywhere.',
  },
};

/**
 * CLUB-LEVEL ROLES
 * These apply across the entire club.
 */
export const CLUB_ROLES = {
  club_admin: {
    label: 'Club Admin',
    level: 'club',
    description: 'Full access to everything. Manage teams, roles, club settings.',
  },
  club_manager: {
    label: 'Club Manager',
    level: 'club',
    description: 'View access to any team. Cannot modify club settings or roles.',
  },
};

/**
 * TEAM-LEVEL ROLES
 * These are scoped to a specific team. A person can hold multiple roles on different teams.
 */
export const TEAM_ROLES = {
  team_manager: {
    label: 'Team Manager',
    level: 'team',
    description:
      'Full access to the team: roster, budget, ledger, schedule, sponsors, insights. Can manage team-level users.',
  },
  team_admin: {
    label: 'Team Admin',
    level: 'team',
    description: 'Full access to all team functions: roster, budget, ledger, schedule, sponsors, insights.',
  },
  scheduler: {
    label: 'Scheduler',
    level: 'team',
    description: 'Create and edit calendar events, manage blackout dates.',
  },
  treasurer: {
    label: 'Treasurer',
    level: 'team',
    description: 'Manage budget, ledger, transactions, sponsors, and fee waivers.',
  },
  head_coach: {
    label: 'Head Coach',
    level: 'team',
    description: 'View-only access to roster, schedule, and player compliance.',
  },
  assistant_coach: {
    label: 'Assistant Coach',
    level: 'team',
    description: 'View-only access to roster, schedule, and player compliance.',
  },
};

export const ALL_ROLES = { ...APP_ROLES, ...CLUB_ROLES, ...TEAM_ROLES };

/**
 * CLUB-ASSIGNABLE ROLES
 * These are the only roles that can be assigned from the Club > Teams and Club > Users tabs.
 * Club admins assign coaches and team managers to teams.
 */
export const CLUB_ASSIGNABLE_ROLES = ['head_coach', 'assistant_coach', 'team_manager'];

/**
 * TEAM-ASSIGNABLE ROLES
 * These are the only roles that team managers can assign from the Team Users tab.
 * Team managers assign admins, treasurers, and schedulers within their team.
 */
export const TEAM_ASSIGNABLE_ROLES = ['team_admin', 'treasurer', 'scheduler'];

/**
 * PERMISSION KEYS
 * Granular actions that can be performed in the app.
 */
export const PERMISSIONS = {
  // App-level
  APP_MANAGE_CLUBS: 'app:manage_clubs', // Create, edit, delete clubs
  APP_VIEW_ALL: 'app:view_all', // View all clubs and their data

  // Club-level
  CLUB_SETTINGS: 'club:settings', // Edit club name, logo, settings
  CLUB_MANAGE_TEAMS: 'club:manage_teams', // Create/archive teams
  CLUB_MANAGE_ROLES: 'club:manage_roles', // Assign/revoke roles for any user
  CLUB_VIEW_FINANCIALS: 'club:view_financials', // Club-wide dashboard and reports
  CLUB_VIEW_ANY_TEAM: 'club:view_any_team', // Browse into any team's data

  // Team-level
  TEAM_VIEW_ROSTER: 'team:view_roster', // See player list, compliance, guardians
  TEAM_EDIT_ROSTER: 'team:edit_roster', // Add/remove/edit players, import roster
  TEAM_VIEW_SCHEDULE: 'team:view_schedule', // See calendar and events
  TEAM_EDIT_SCHEDULE: 'team:edit_schedule', // Add/edit events, manage blackouts
  TEAM_VIEW_BUDGET: 'team:view_budget', // See budget table, fee calculator
  TEAM_EDIT_BUDGET: 'team:edit_budget', // Edit budget items, finalize, clone
  TEAM_VIEW_LEDGER: 'team:view_ledger', // See transactions
  TEAM_EDIT_LEDGER: 'team:edit_ledger', // Add/edit/delete transactions
  TEAM_VIEW_SPONSORS: 'team:view_sponsors', // See sponsor/fundraiser distributions
  TEAM_EDIT_SPONSORS: 'team:edit_sponsors', // Distribute/revert waterfall credits
  TEAM_VIEW_INSIGHTS: 'team:view_insights', // See insights/projections, use AI chat
  TEAM_MANAGE_WAIVERS: 'team:manage_waivers', // Toggle fee waivers
  TEAM_MANAGE_USERS: 'team:manage_users', // Assign roles to team parents/guardians

  // Evaluations (club-level)
  CLUB_MANAGE_EVALUATIONS: 'club:manage_evaluations', // Create/configure evaluation sessions
  CLUB_EVALUATE_PLAYERS: 'club:evaluate_players', // Submit evaluation scores
  CLUB_VIEW_EVALUATIONS: 'club:view_evaluations', // View evaluation results
};

/**
 * ROLE → PERMISSIONS MATRIX
 * Maps each role to its granted permissions.
 */
export const ROLE_PERMISSIONS = {
  // ── App Roles ──
  super_admin: [
    PERMISSIONS.APP_MANAGE_CLUBS,
    PERMISSIONS.APP_VIEW_ALL,
    // All club permissions
    PERMISSIONS.CLUB_SETTINGS,
    PERMISSIONS.CLUB_MANAGE_TEAMS,
    PERMISSIONS.CLUB_MANAGE_ROLES,
    PERMISSIONS.CLUB_VIEW_FINANCIALS,
    PERMISSIONS.CLUB_VIEW_ANY_TEAM,
    // All team permissions
    PERMISSIONS.TEAM_VIEW_ROSTER,
    PERMISSIONS.TEAM_EDIT_ROSTER,
    PERMISSIONS.TEAM_VIEW_SCHEDULE,
    PERMISSIONS.TEAM_EDIT_SCHEDULE,
    PERMISSIONS.TEAM_VIEW_BUDGET,
    PERMISSIONS.TEAM_EDIT_BUDGET,
    PERMISSIONS.TEAM_VIEW_LEDGER,
    PERMISSIONS.TEAM_EDIT_LEDGER,
    PERMISSIONS.TEAM_VIEW_SPONSORS,
    PERMISSIONS.TEAM_EDIT_SPONSORS,
    PERMISSIONS.TEAM_VIEW_INSIGHTS,
    PERMISSIONS.TEAM_MANAGE_WAIVERS,
    PERMISSIONS.TEAM_MANAGE_USERS,
    // All evaluation permissions
    PERMISSIONS.CLUB_MANAGE_EVALUATIONS,
    PERMISSIONS.CLUB_EVALUATE_PLAYERS,
    PERMISSIONS.CLUB_VIEW_EVALUATIONS,
  ],

  // ── Club Roles ──
  club_admin: [
    // All club permissions
    PERMISSIONS.CLUB_SETTINGS,
    PERMISSIONS.CLUB_MANAGE_TEAMS,
    PERMISSIONS.CLUB_MANAGE_ROLES,
    PERMISSIONS.CLUB_VIEW_FINANCIALS,
    PERMISSIONS.CLUB_VIEW_ANY_TEAM,
    // All team permissions (on any team)
    PERMISSIONS.TEAM_VIEW_ROSTER,
    PERMISSIONS.TEAM_EDIT_ROSTER,
    PERMISSIONS.TEAM_VIEW_SCHEDULE,
    PERMISSIONS.TEAM_EDIT_SCHEDULE,
    PERMISSIONS.TEAM_VIEW_BUDGET,
    PERMISSIONS.TEAM_EDIT_BUDGET,
    PERMISSIONS.TEAM_VIEW_LEDGER,
    PERMISSIONS.TEAM_EDIT_LEDGER,
    PERMISSIONS.TEAM_VIEW_SPONSORS,
    PERMISSIONS.TEAM_EDIT_SPONSORS,
    PERMISSIONS.TEAM_VIEW_INSIGHTS,
    PERMISSIONS.TEAM_MANAGE_WAIVERS,
    PERMISSIONS.TEAM_MANAGE_USERS,
    // Evaluation permissions
    PERMISSIONS.CLUB_MANAGE_EVALUATIONS,
    PERMISSIONS.CLUB_EVALUATE_PLAYERS,
    PERMISSIONS.CLUB_VIEW_EVALUATIONS,
  ],

  club_manager: [
    PERMISSIONS.CLUB_VIEW_FINANCIALS,
    PERMISSIONS.CLUB_VIEW_ANY_TEAM,
    // View-only on any team
    PERMISSIONS.TEAM_VIEW_ROSTER,
    PERMISSIONS.TEAM_VIEW_SCHEDULE,
    PERMISSIONS.TEAM_VIEW_BUDGET,
    PERMISSIONS.TEAM_VIEW_LEDGER,
    PERMISSIONS.TEAM_VIEW_SPONSORS,
    PERMISSIONS.TEAM_VIEW_INSIGHTS,
    PERMISSIONS.CLUB_VIEW_EVALUATIONS,
  ],

  // ── Team Roles ──
  team_manager: [
    PERMISSIONS.TEAM_VIEW_ROSTER,
    PERMISSIONS.TEAM_EDIT_ROSTER,
    PERMISSIONS.TEAM_VIEW_SCHEDULE,
    PERMISSIONS.TEAM_EDIT_SCHEDULE,
    PERMISSIONS.TEAM_VIEW_BUDGET,
    PERMISSIONS.TEAM_EDIT_BUDGET,
    PERMISSIONS.TEAM_VIEW_LEDGER,
    PERMISSIONS.TEAM_EDIT_LEDGER,
    PERMISSIONS.TEAM_VIEW_SPONSORS,
    PERMISSIONS.TEAM_EDIT_SPONSORS,
    PERMISSIONS.TEAM_VIEW_INSIGHTS,
    PERMISSIONS.TEAM_MANAGE_WAIVERS,
    PERMISSIONS.TEAM_MANAGE_USERS,
    PERMISSIONS.CLUB_EVALUATE_PLAYERS,
    PERMISSIONS.CLUB_VIEW_EVALUATIONS,
  ],

  team_admin: [
    PERMISSIONS.TEAM_VIEW_ROSTER,
    PERMISSIONS.TEAM_EDIT_ROSTER,
    PERMISSIONS.TEAM_VIEW_SCHEDULE,
    PERMISSIONS.TEAM_EDIT_SCHEDULE,
    PERMISSIONS.TEAM_VIEW_BUDGET,
    PERMISSIONS.TEAM_EDIT_BUDGET,
    PERMISSIONS.TEAM_VIEW_LEDGER,
    PERMISSIONS.TEAM_EDIT_LEDGER,
    PERMISSIONS.TEAM_VIEW_SPONSORS,
    PERMISSIONS.TEAM_EDIT_SPONSORS,
    PERMISSIONS.TEAM_VIEW_INSIGHTS,
    PERMISSIONS.TEAM_MANAGE_WAIVERS,
  ],

  scheduler: [PERMISSIONS.TEAM_VIEW_ROSTER, PERMISSIONS.TEAM_VIEW_SCHEDULE, PERMISSIONS.TEAM_EDIT_SCHEDULE],

  treasurer: [
    PERMISSIONS.TEAM_VIEW_ROSTER,
    PERMISSIONS.TEAM_VIEW_BUDGET,
    PERMISSIONS.TEAM_EDIT_BUDGET,
    PERMISSIONS.TEAM_VIEW_LEDGER,
    PERMISSIONS.TEAM_EDIT_LEDGER,
    PERMISSIONS.TEAM_VIEW_SPONSORS,
    PERMISSIONS.TEAM_EDIT_SPONSORS,
    PERMISSIONS.TEAM_VIEW_INSIGHTS,
    PERMISSIONS.TEAM_MANAGE_WAIVERS,
  ],

  head_coach: [
    PERMISSIONS.TEAM_VIEW_ROSTER,
    PERMISSIONS.TEAM_VIEW_SCHEDULE,
    PERMISSIONS.CLUB_EVALUATE_PLAYERS,
    PERMISSIONS.CLUB_VIEW_EVALUATIONS,
  ],

  assistant_coach: [PERMISSIONS.TEAM_VIEW_ROSTER, PERMISSIONS.TEAM_VIEW_SCHEDULE, PERMISSIONS.CLUB_VIEW_EVALUATIONS],
};

/**
 * Check if a user has a specific permission for a given team.
 *
 * @param {Array} userRoles - Array of { role, clubId, teamId } from user_roles table
 * @param {string} permission - Permission key from PERMISSIONS
 * @param {string} teamId - The team to check against (null for club-level checks)
 * @returns {boolean}
 */
export function hasPermission(userRoles, permission, teamId = null) {
  for (const ur of userRoles) {
    const perms = ROLE_PERMISSIONS[ur.role] || [];
    if (!perms.includes(permission)) continue;

    // App-level roles (super_admin) apply to everything
    if (APP_ROLES[ur.role]) return true;

    // Club-level roles apply to all teams within their club
    if (CLUB_ROLES[ur.role]) return true;

    // Team-level roles only apply to the assigned team
    if (teamId && ur.teamId === teamId) return true;
  }
  return false;
}

/**
 * Get all teams a user has access to (any role).
 * Club admins/managers get access to all teams.
 */
export function getAccessibleTeamIds(userRoles, allTeamIds = []) {
  const hasClubRole = userRoles.some((ur) => CLUB_ROLES[ur.role]);
  if (hasClubRole) return allTeamIds;

  return [...new Set(userRoles.filter((ur) => ur.teamId).map((ur) => ur.teamId))];
}

/**
 * Get the highest role a user holds for a specific team.
 * Priority: team_manager > team_admin > treasurer > scheduler > head_coach > assistant_coach
 */
export function getHighestTeamRole(userRoles, teamId) {
  const priority = ['team_manager', 'team_admin', 'treasurer', 'scheduler', 'head_coach', 'assistant_coach'];
  const teamRoles = userRoles.filter((ur) => ur.teamId === teamId).map((ur) => ur.role);

  // Also check club-level roles
  if (userRoles.some((ur) => ur.role === 'club_admin')) return 'club_admin';
  if (userRoles.some((ur) => ur.role === 'club_manager')) return 'club_manager';

  for (const role of priority) {
    if (teamRoles.includes(role)) return role;
  }
  return null;
}

/**
 * NAV ITEMS visible to each role.
 * Returns which sidebar items a role can see for a team view.
 */
export function getNavItemsForRole(userRoles, teamId) {
  const items = [];
  const check = (perm) => hasPermission(userRoles, perm, teamId);

  if (check(PERMISSIONS.TEAM_VIEW_ROSTER)) items.push('dashboard');
  if (check(PERMISSIONS.TEAM_VIEW_LEDGER)) items.push('ledger');
  if (check(PERMISSIONS.TEAM_VIEW_BUDGET)) items.push('budget');
  if (check(PERMISSIONS.TEAM_VIEW_SPONSORS)) items.push('sponsors');
  if (check(PERMISSIONS.TEAM_VIEW_INSIGHTS)) items.push('insights');
  if (check(PERMISSIONS.TEAM_VIEW_SCHEDULE)) items.push('schedule');
  if (check(PERMISSIONS.TEAM_MANAGE_USERS)) items.push('team-users');

  return items;
}
