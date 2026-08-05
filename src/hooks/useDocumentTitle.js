import { useEffect } from 'react';
import { APP_NAME } from '../utils/constants';

/**
 * Keeps the browser tab in sync with the team currently in context.
 *
 * Why: the title is otherwise frozen at the static value in index.html, so a
 * manager running two teams in two tabs — the common case for anyone with a
 * club_admin role — sees two identical entries and has to guess. The in-app
 * headers already name the selected team; this brings the tab, the browser
 * history entry, and the PWA task-switcher label in line with them.
 *
 * The app name always leads so every tab is identifiable as this app at a
 * glance; the context after the pipe degrades team → club → nothing, so the
 * title is never left dangling while the team context is still resolving.
 */
export function useDocumentTitle(teamName, clubName) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const context = teamName || clubName;
    document.title = context ? `${APP_NAME} | ${context}` : APP_NAME;
  }, [teamName, clubName]);
}
