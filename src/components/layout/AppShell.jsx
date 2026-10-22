import { useEffect, useRef } from 'react';
import { useNavigation } from '../../context/NavigationContext';
import { useScreenPanelActive } from '../../hooks/useScreenPanel';
import { teamColorVars } from '../../utils/teamColor';
import { rememberPage } from '../../utils/navMemory';
import { useDestinations } from '../../hooks/useDestinations';
import AppHeader from './AppHeader';
import AppFooter from './AppFooter';
import ContentHeader from './ContentHeader';
import MobileBottomNav from '../MobileBottomNav';

/**
 * AppShell — header, centred content column, and a bottom tab bar on phones.
 *
 * Built for the people who open the app most: parents and volunteer coaches,
 * usually on a phone. Navigation is a handful of destinations (see
 * utils/navDestinations.js) rather than a sidebar of every page, and admin
 * surfaces sit inside the Manage destination instead of in chrome of their own.
 *
 * The selected team's colour is written onto the document root here, so every
 * token that derives from it (--primary, the next-match card, the active tab)
 * follows the team switcher — see utils/teamColor.js.
 *
 * On a phone, a panel presenting as a full screen replaces the app rather than
 * covering it, so the shell steps aside for the duration — see below.
 */
export default function AppShell({ children, banner }) {
  const { teams = [], selectedTeamId, currentView } = useNavigation();
  const { active } = useDestinations();
  const activeId = active?.id;

  // The page each destination was last left on, so its tab returns there.
  useEffect(() => {
    if (activeId) rememberPage(activeId, currentView);
  }, [activeId, currentView]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0] || null;
  const teamColor = selectedTeam?.colorPrimary;

  useEffect(() => {
    const root = document.documentElement;
    const vars = teamColorVars(teamColor);
    Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
    return () => Object.keys(vars).forEach((name) => root.style.removeProperty(name));
  }, [teamColor]);

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

  return (
    <div
      className="app-wrapper bg-canvas text-foreground"
      // `hidden` rather than unmounting: the panel is a different screen, but
      // the one underneath should still be the way it was left.
      hidden={screenPanelOpen}
    >
      <AppHeader />
      {banner}

      <main className="app-main">
        <ContentHeader />
        <div className="app-content">{children}</div>
      </main>

      <AppFooter />

      <MobileBottomNav />
    </div>
  );
}
