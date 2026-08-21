import { useEffect, useSyncExternalStore } from 'react';

/**
 * A panel presenting as a full screen is not an overlay sitting on top of the
 * app — it replaces it. The shell needs to know that to get out of the way:
 * covering its content with an opaque fixed layer leaves the sidebar, header
 * and tab bar in the accessibility tree and still paints a page nobody can see.
 *
 * The signal has to travel from a panel deep in the tree up to the shell that
 * wraps it, so it lives outside React rather than in a context the panel would
 * have to be a descendant of.
 *
 * Counted rather than a flag: a panel opened from inside another one (a form
 * over a detail screen) means two are presenting at once, and the shell should
 * only come back when the last of them has gone.
 */
let screenCount = 0;
const listeners = new Set();

function emit() {
  listeners.forEach((notify) => notify());
}

/** Register a panel as presenting full-screen. Returns its unregister. */
export function registerScreenPanel() {
  screenCount += 1;
  emit();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    // Clamped because there is no such thing as a negative number of screens,
    // and a count stuck below zero would leave the shell hidden behind nothing.
    screenCount = Math.max(0, screenCount - 1);
    emit();
  };
}

function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const getSnapshot = () => screenCount > 0;

// The server never has a panel open, and neither does the first client paint.
const getServerSnapshot = () => false;

/** True while at least one panel is presenting as a full screen. */
export function useScreenPanelActive() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Declare, for as long as `active` holds, that this panel is a full screen. */
export function useRegisterScreenPanel(active) {
  useEffect(() => (active ? registerScreenPanel() : undefined), [active]);
}

/** Test seam — drops any registration a failed render left behind. */
export function resetScreenPanels() {
  screenCount = 0;
  emit();
}
