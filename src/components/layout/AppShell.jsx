import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutContext } from '../../context/LayoutContext';
import { useSidebarState } from '../../hooks/useSidebarState';
import { useScreenPanelActive } from '../../hooks/useScreenPanel';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';
import AppFooter from './AppFooter';
import ContentHeader from './ContentHeader';
import MobileBottomNav from '../MobileBottomNav';

/**
 * AppShell — AdminLTE `.app-wrapper`.
 *
 * A named CSS grid (see `.app-wrapper` in index.css) places the sidebar,
 * header, main and footer. The sidebar minifies to an icon rail on desktop and
 * becomes an off-canvas drawer under 768px; the bottom tab bar is retained
 * below that breakpoint as a PWA quick-nav affordance.
 *
 * On a phone, a panel presenting as a full screen replaces the app rather than
 * covering it, so the shell steps aside for the duration — see below.
 */
export default function AppShell({ children, banner }) {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen, toggleSidebar, closeMobile, desktop } = useSidebarState();
  const location = useLocation();

  // A full-screen panel is a screen, not an overlay. Hidden rather than merely
  // covered, the shell leaves the accessibility tree and stops painting a page
  // nobody can see — but stays mounted, so the list behind keeps its filters,
  // its search and its expanded rows for when the panel closes.
  const screenPanelOpen = useScreenPanelActive();

  // Hiding a subtree drops the document's scroll height to nothing, and the
  // browser does not put it back on the way out. The list would come back with
  // the panel closed and the page at the top, which is the "lost my place" bug
  // the panels were meant to avoid.
  const scrollBeforeScreen = useRef(0);
  useEffect(() => {
    if (screenPanelOpen) {
      scrollBeforeScreen.current = window.scrollY;
      return undefined;
    }
    const restoreTo = scrollBeforeScreen.current;
    if (!restoreTo) return undefined;
    // After paint, once the shell has its height back.
    const frame = requestAnimationFrame(() => window.scrollTo(0, restoreTo));
    return () => cancelAnimationFrame(frame);
  }, [screenPanelOpen]);

  // Navigating from inside the drawer must dismiss it, including on the
  // routes that navigate programmatically rather than through a nav button.
  useEffect(() => {
    closeMobile();
  }, [location.pathname, closeMobile]);

  const layoutValue = useMemo(
    () => ({ collapsed, setCollapsed, mobileOpen, setMobileOpen, toggleSidebar, closeMobile, desktop }),
    [collapsed, setCollapsed, mobileOpen, setMobileOpen, toggleSidebar, closeMobile, desktop],
  );

  return (
    <LayoutContext.Provider value={layoutValue}>
      <div
        className="app-wrapper bg-canvas text-foreground"
        data-sidebar={collapsed ? 'collapsed' : 'expanded'}
        // `hidden` rather than unmounting: the panel is a different screen, but
        // the one underneath should still be the way it was left.
        hidden={screenPanelOpen}
      >
        <AppSidebar />

        {/* Drawer scrim — mobile only; the sidebar itself sits above it. */}
        {mobileOpen && (
          <div className="fixed inset-0 z-[1037] bg-black/50 md:hidden" onClick={closeMobile} aria-hidden="true" />
        )}

        <AppHeader />

        <main className="app-main">
          {banner}
          <ContentHeader />
          <div className="app-content">{children}</div>
        </main>

        <AppFooter />

        <MobileBottomNav />
      </div>
    </LayoutContext.Provider>
  );
}
