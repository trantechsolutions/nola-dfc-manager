// Single-team mode hides all club/super-admin UI. Resolution precedence:
//   1. A per-browser session override (?admin=1 / ?admin=0, persisted in
//      localStorage) always forces full multi-club mode. This is the escape
//      hatch that keeps a super admin out of a lockout after enabling STM.
//   2. The app-wide `single_team_mode` setting (app_settings table) wins when set.
//   3. The build-time VITE_SINGLE_TEAM_MODE flag is the fallback default.
const OVERRIDE_KEY = 'nola_admin_override';

// Apply ?admin=1 / ?admin=0 URL params to the persisted session override, then
// report whether the override (force full mode) is currently active.
function readAdminOverride() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1') {
    localStorage.setItem(OVERRIDE_KEY, '1');
  } else if (params.get('admin') === '0') {
    localStorage.removeItem(OVERRIDE_KEY);
  }
  return localStorage.getItem(OVERRIDE_KEY) === '1';
}

// Legacy synchronous resolver — env flag + session override only. Retained for
// the pre-settings-load path and existing unit tests.
export function isSingleTeamMode() {
  if (import.meta.env.VITE_SINGLE_TEAM_MODE !== 'true') return false;
  if (typeof window === 'undefined') return true;
  return !readAdminOverride();
}

// App-wide resolver. The DB `single_team_mode` value (from app_settings) wins
// over the env flag; the session override always forces full mode.
export function resolveSingleTeamMode(appSettings) {
  const dbVal = appSettings?.single_team_mode;
  const base = typeof dbVal === 'boolean' ? dbVal : import.meta.env.VITE_SINGLE_TEAM_MODE === 'true';
  if (!base) return false;
  if (typeof window === 'undefined') return true;
  return !readAdminOverride();
}

// Set or clear the per-browser override so the admin toggling STM on keeps full
// mode locally (and therefore keeps access to the admin panel).
export function setAdminOverride(on) {
  if (typeof window === 'undefined') return;
  if (on) localStorage.setItem(OVERRIDE_KEY, '1');
  else localStorage.removeItem(OVERRIDE_KEY);
}
