// ── Destinations: the app's top-level navigation ─────────────────────────
// Parents and coaches think in terms of what they came to do — see what is
// next, check the schedule, look after the team, settle money — not in the
// club/season/team layering the data is stored in. So the nav items App.jsx
// builds (already filtered by role and permission) are regrouped here into at
// most five destinations. A destination only appears when the user can reach
// at least one page in it, so a parent ends up with three tabs and a team
// manager with up to five, from the same code path.
//
// URLs are untouched: a destination is a grouping over existing routes, and
// its tab always opens the first page in it that the user is allowed to see.

import { CalendarDays, House, Settings2, Users, Wallet } from 'lucide-react';

const DESTINATIONS = [
  { id: 'home', key: 'nav.home', fallback: 'Home', icon: House, views: ['dashboard'] },
  {
    id: 'schedule',
    key: 'nav.schedule',
    fallback: 'Schedule',
    icon: CalendarDays,
    views: ['schedule', 'planner', 'field-schedule'],
  },
  {
    id: 'team',
    key: 'nav.team',
    fallback: 'Team',
    icon: Users,
    views: ['people', 'checklist', 'season-evaluations'],
  },
  {
    id: 'money',
    key: 'nav.money',
    fallback: 'Money',
    icon: Wallet,
    views: ['finance/budget', 'finance/ledger', 'finance/fundraising', 'finance/book-balance'],
  },
  {
    id: 'manage',
    key: 'nav.manage',
    fallback: 'Manage',
    icon: Settings2,
    views: [
      'club-overview',
      'club-teams',
      'club-players',
      'team-users',
      'team-admin',
      'insights',
      'club-admin',
      'app-admin',
    ],
  },
];

// Routes with no nav entry of their own still belong somewhere, so the right
// tab stays lit on a deep link like /finance/ledger?tx=… or /club-onboard.
const PREFIX_FALLBACKS = [
  ['finance/', 'money'],
  ['club-', 'manage'],
  ['evaluate/', 'team'],
];

/**
 * @param {Array}    navItems  every nav item the user may see, in any order
 * @param {Function} t         translator from useT()
 * @returns {Array<{id, label, icon, to, items}>} destinations that have pages
 */
export function buildDestinations(navItems = [], t = (_key, fallback) => fallback) {
  const byId = new Map(navItems.map((item) => [item.id, item]));
  const claimed = new Set();

  const destinations = DESTINATIONS.map((dest) => {
    const items = dest.views.map((view) => byId.get(view)).filter(Boolean);
    items.forEach((item) => claimed.add(item.id));
    return { ...dest, items };
  });

  // A nav item nobody has placed yet is an admin surface more often than not;
  // parking it under Manage keeps it reachable until it is given a home.
  const manage = destinations.find((dest) => dest.id === 'manage');
  navItems.forEach((item) => {
    if (!claimed.has(item.id)) manage.items.push(item);
  });

  return destinations
    .filter((dest) => dest.items.length > 0)
    .map((dest) => {
      // A destination holding a single page is that page — a parent's "Team"
      // tab is just their checklist, so it should say so. Home keeps its name.
      const solo = dest.items.length === 1 && dest.id !== 'home' ? dest.items[0] : null;
      return {
        id: dest.id,
        label: solo ? solo.label : t(dest.key, dest.fallback),
        icon: solo ? solo.icon : dest.icon,
        to: `/${dest.items[0].id}`,
        items: dest.items,
      };
    });
}

/** The destination a route belongs to, or null for app-level pages (help, update log). */
export function findDestination(destinations, view) {
  const direct = destinations.find((dest) => dest.items.some((item) => item.id === view));
  if (direct) return direct;
  const fallback = PREFIX_FALLBACKS.find(([prefix]) => String(view || '').startsWith(prefix));
  return fallback ? destinations.find((dest) => dest.id === fallback[1]) || null : null;
}
