import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutContext } from '../../context/LayoutContext';
import { useSidebarState } from '../../hooks/useSidebarState';
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
 */
export default function AppShell({ children, banner }) {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen, toggleSidebar, closeMobile, desktop } = useSidebarState();
  const location = useLocation();

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
      <div className="app-wrapper bg-canvas text-foreground" data-sidebar={collapsed ? 'collapsed' : 'expanded'}>
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
