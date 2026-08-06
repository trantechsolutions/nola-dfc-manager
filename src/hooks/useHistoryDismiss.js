import { useEffect, useRef } from 'react';

const MARKER = '__panel';

// Nested panels (a form opened from inside a detail panel) each own an entry.
// They all hear the same popstate, so a module-level stack decides which one a
// Back press belongs to — without it, one press would close the whole nest.
const stack = [];
let counter = 0;

// Releasing an entry is deferred by a tick so a panel that immediately remounts
// can reclaim it. StrictMode does exactly that in development: mount, tear
// down, mount again. Retracting synchronously meant the queued back() landed
// after the remount had already pushed a fresh entry, and the new listener read
// our own retraction as a user Back press — the panel closed the instant it
// opened. Deferring makes the entry a resource that a remount claims rather
// than races.
let pendingRelease = null;

/**
 * useHistoryDismiss — lets a full-screen panel behave like a screen.
 *
 * While active, the panel owns a throwaway history entry pointing at the URL
 * that was already showing. Android's Back button and iOS' edge-swipe then
 * dismiss the panel instead of leaving the page behind it — the single thing
 * that separates "a sheet covering the app" from "a screen you navigated to".
 *
 * The entry carries react-router's own history state forward, so the router
 * treats the duplicate as the location it is already on and does nothing.
 */
export function useHistoryDismiss(active, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;

    const token = ++counter;
    if (pendingRelease) {
      clearTimeout(pendingRelease);
      pendingRelease = null;
    } else {
      window.history.pushState({ ...window.history.state, [MARKER]: token }, '');
    }
    stack.push(token);

    const onPop = () => {
      if (stack[stack.length - 1] !== token) return;
      stack.pop();
      onCloseRef.current?.();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      const index = stack.indexOf(token);
      if (index === -1) return; // a Back press already consumed the entry

      stack.splice(index, 1);
      pendingRelease = setTimeout(() => {
        pendingRelease = null;
        // Dismissed from the UI rather than by Back, so retract the entry we
        // added — otherwise the next Back press lands on a screen that is
        // gone. A real navigation (say, jumping to another route from inside
        // the panel) overwrites the marker first, leaving nothing to retract.
        if (window.history.state?.[MARKER]) window.history.back();
      }, 0);
    };
  }, [active]);
}
