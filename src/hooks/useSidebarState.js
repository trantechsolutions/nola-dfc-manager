import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ui.sidebarCollapsed';
const DESKTOP_QUERY = '(min-width: 768px)';

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;

/**
 * useSidebarState — AdminLTE shell chrome state.
 *
 * Two independent modes share one hamburger, exactly as AdminLTE does:
 *   desktop (>=768px) → toggles the minified icon rail, persisted per browser
 *   mobile  (<768px)  → toggles the off-canvas drawer, never persisted
 *
 * Persisting only the desktop half is deliberate: a drawer that restored
 * itself open on load would cover the page on every cold start.
 */
export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      // Safari private mode throws on localStorage access.
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktop, setDesktop] = useState(isDesktop);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      /* non-fatal — the rail just won't survive a reload */
    }
  }, [collapsed]);

  // Tracking the breakpoint in state (rather than reading innerWidth at render)
  // keeps `desktop` correct after a resize — consumers use it to mark the
  // off-canvas drawer inert while it is parked off-screen. Crossing back to
  // desktop also shuts the drawer, which would otherwise stay invisibly open
  // and swallow the next hamburger press.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => {
      setDesktop(e.matches);
      if (e.matches) setMobileOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Lock the page behind the drawer so scroll gestures don't bleed through.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  // Escape closes the drawer — standard dismissal for an overlay.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const toggleSidebar = useCallback(() => {
    if (isDesktop()) setCollapsed((v) => !v);
    else setMobileOpen((v) => !v);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return { collapsed, setCollapsed, mobileOpen, setMobileOpen, toggleSidebar, closeMobile, desktop };
}
