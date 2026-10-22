// ── Last page per destination ────────────────────────────────────────────
// Tapping Money should land on the Ledger if that is where you left it, the
// way a phone app's tabs keep their place. Tapping the tab you are already on
// goes back to its first page, which is the other half of that convention.
//
// Session-scoped: a fresh visit starts every destination at its first page.

const KEY = 'ui.lastPageByDestination';
let memory = null;

function load() {
  if (memory) return memory;
  try {
    memory = JSON.parse(window.sessionStorage.getItem(KEY) || '{}') || {};
  } catch {
    // Private browsing and blocked storage throw; remembering is a nicety.
    memory = {};
  }
  return memory;
}

export function rememberPage(destinationId, view) {
  if (!destinationId || !view) return;
  const next = { ...load(), [destinationId]: view };
  memory = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* non-fatal */
  }
}

/** Where a tab tap should go: the destination's first page when already in it, else the last page seen there. */
export function tabTarget(destination, activeId) {
  if (destination.id === activeId) return destination.to;
  const last = load()[destination.id];
  const stillThere = last && destination.items.some((item) => item.id === last);
  return stillThere ? `/${last}` : destination.to;
}

/** Test seam: forget everything. */
export function resetNavMemory() {
  memory = {};
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
