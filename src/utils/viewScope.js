// src/utils/viewScope.js
// Per-user view scope for club-level admins.
//
// A club admin who is only running teams this week can drop the club and
// app-admin chrome without giving up the role. This is a display preference,
// not a permission change — it is stored per browser (like `nola_selected_team`)
// and never touches user_roles or the RLS policies behind them, so switching to
// team scope hides nav and routes but grants nothing and revokes nothing.
//
// Distinct from single-team mode (see utils/singleTeamMode.js), which is an
// app-wide setting a super admin flips for *everyone*. When STM is on this
// preference is moot — the club UI is already gone for all users.

export const VIEW_SCOPE = {
  CLUB: 'club', // Full: app admin + club sections + team sections
  TEAM: 'team', // Team sections only
};

const STORAGE_PREFIX = 'nola_view_scope';

// Scoped by user id so a shared browser doesn't leak one admin's preference
// into the next person's session.
const keyFor = (userId) => (userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX);

export function readViewScope(userId) {
  if (typeof window === 'undefined') return VIEW_SCOPE.CLUB;
  try {
    return localStorage.getItem(keyFor(userId)) === VIEW_SCOPE.TEAM ? VIEW_SCOPE.TEAM : VIEW_SCOPE.CLUB;
  } catch {
    // Private mode / disabled storage — fall back to the fuller view.
    return VIEW_SCOPE.CLUB;
  }
}

export function writeViewScope(userId, scope) {
  if (typeof window === 'undefined') return;
  try {
    // Only the non-default value is persisted, so clearing site data or
    // reading the key on a fresh browser both land on the club-level default.
    if (scope === VIEW_SCOPE.TEAM) localStorage.setItem(keyFor(userId), VIEW_SCOPE.TEAM);
    else localStorage.removeItem(keyFor(userId));
  } catch {
    // Storage unavailable — the preference just won't survive a reload.
  }
}

// Single source of truth for "should club/app-admin UI be rendered at all".
// Both inputs hide the same surfaces, so nav and routes stay in sync.
export function isClubUiHidden({ singleTeam, viewScope } = {}) {
  return Boolean(singleTeam) || viewScope === VIEW_SCOPE.TEAM;
}
