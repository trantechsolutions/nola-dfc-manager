// ── Page title + breadcrumb resolution ──────────────────────────────────
// Feeds AdminLTE's `.app-content-header`: page title on the left, breadcrumb
// trail on the right.
//
// Titles come from the live nav items first, so a label only ever exists in
// one place — e.g. `dashboard` reads "Season Overview" for staff and
// "My Player" for a parent without this file knowing anything about roles.
// STATIC_PAGES only covers routes that have no sidebar entry.

const STATIC_PAGES = {
  changelog: { key: 'nav.changelog', fallback: 'Update Log', section: null },
  help: { key: 'nav.help', fallback: 'Help & User Guide', section: null },
  'club-onboard': { key: 'nav.onboardTeam', fallback: 'Onboard Team', section: 'club' },
  'club-players': { key: 'nav.players', fallback: 'Players', section: 'club' },
};

// Nav groups that carry no explicit `section` on their items.
const IMPLICIT_SECTIONS = { season: 'season', team: 'team' };

/**
 * @param {string} view    current route id, e.g. 'finance/ledger'
 * @param {object} opts
 * @param {Array}  opts.navGroups  [{ section, items }] in sidebar order
 * @param {Function} opts.t        translator from useT()
 * @param {string} [opts.teamName] label for the `team`/`season` section crumb
 * @returns {{ title: string, crumbs: Array<{label: string, to?: string}> }}
 */
export function getPageMeta(view, { navGroups = [], t, teamName } = {}) {
  const sectionLabels = {
    app: 'App',
    club: t('common.club'),
    season: teamName || t('common.team'),
    team: teamName || t('common.team'),
  };

  let title = null;
  let section = null;

  for (const group of navGroups) {
    const match = group.items?.find((item) => item.id === view);
    if (match) {
      title = match.label;
      section = match.section || IMPLICIT_SECTIONS[group.section] || group.section || null;
      break;
    }
  }

  if (!title) {
    const staticPage = STATIC_PAGES[view];
    if (staticPage) {
      title = t(staticPage.key, staticPage.fallback);
      section = staticPage.section;
    }
  }

  // Unknown routes (deep links like /evaluate/:id) still get a usable title
  // rather than an empty header bar.
  if (!title) title = humanize(view);

  const crumbs = [{ label: 'Home', to: '/dashboard' }];
  const sectionLabel = section ? sectionLabels[section] : null;
  // The dashboard IS Home — repeating it as its own crumb reads as a loop.
  if (sectionLabel && view !== 'dashboard') crumbs.push({ label: sectionLabel });
  if (view !== 'dashboard') crumbs.push({ label: title });

  return { title, crumbs };
}

function humanize(view) {
  const leaf =
    String(view || '')
      .split('/')
      .pop() || 'Dashboard';
  return leaf.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
