// Single source of truth for "single-team mode" — hides all club/super-admin UI
// behind the VITE_SINGLE_TEAM_MODE build flag. Appending ?admin=1 to any URL
// flips the current browser session back to full mode (persisted via
// localStorage); ?admin=0 clears the override.
export function isSingleTeamMode() {
  if (import.meta.env.VITE_SINGLE_TEAM_MODE !== 'true') return false;
  if (typeof window === 'undefined') return true;
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1') {
    localStorage.setItem('nola_admin_override', '1');
  } else if (params.get('admin') === '0') {
    localStorage.removeItem('nola_admin_override');
  }
  return localStorage.getItem('nola_admin_override') !== '1';
}
