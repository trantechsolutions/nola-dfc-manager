import { useEffect, useState } from 'react';

// Deliberately the same breakpoint the shell uses (see useSidebarState): a
// panel should go full-screen at exactly the width where the sidebar collapses
// into a drawer, so the two never disagree about what "mobile" means.
const DESKTOP_QUERY = '(min-width: 768px)';

const readCompact = () => (typeof window === 'undefined' ? false : !window.matchMedia(DESKTOP_QUERY).matches);

/**
 * useCompactViewport — true below the shell's desktop breakpoint.
 *
 * Tracked in state rather than read at render so a rotation or resize while a
 * panel is open re-presents it, instead of leaving a full-screen sheet pinned
 * across a now-wide window.
 */
export function useCompactViewport() {
  const [compact, setCompact] = useState(readCompact);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => setCompact(!e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return compact;
}
