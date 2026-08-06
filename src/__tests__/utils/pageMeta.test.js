import { describe, it, expect } from 'vitest';

import { getPageMeta } from '../../utils/pageMeta';

// Stand-in for useT(): returns the fallback when given one, else the key —
// enough to prove which label source won without pulling in i18next.
const t = (key, fallback) => (typeof fallback === 'string' ? fallback : key);

const staffNavGroups = [
  { section: 'club', items: [{ id: 'club-teams', label: 'Teams', section: 'club' }] },
  {
    section: 'season',
    items: [
      { id: 'dashboard', label: 'Season Overview', section: 'season' },
      { id: 'finance/ledger', label: 'Ledger', section: 'season' },
    ],
  },
  { section: 'team', items: [{ id: 'schedule', label: 'Schedule', section: 'team' }] },
];

describe('getPageMeta', () => {
  it('takes the title from the live nav item, not a duplicated table', () => {
    const { title } = getPageMeta('finance/ledger', { navGroups: staffNavGroups, t, teamName: 'U12 Boys' });
    expect(title).toBe('Ledger');
  });

  it('gives a parent the parent-facing dashboard title', () => {
    const parentNavGroups = [
      { section: 'season', items: [{ id: 'dashboard', label: 'My Player', section: 'season' }] },
    ];
    const { title } = getPageMeta('dashboard', { navGroups: parentNavGroups, t });
    expect(title).toBe('My Player');
  });

  it('builds a Home → section → page trail', () => {
    const { crumbs } = getPageMeta('finance/ledger', { navGroups: staffNavGroups, t, teamName: 'U12 Boys' });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'U12 Boys', 'Ledger']);
    expect(crumbs[0].to).toBe('/dashboard');
  });

  it('labels club pages with the club section rather than the team', () => {
    const { crumbs } = getPageMeta('club-teams', { navGroups: staffNavGroups, t, teamName: 'U12 Boys' });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'common.club', 'Teams']);
  });

  it('leaves the dashboard as a bare Home crumb — it is Home', () => {
    const { crumbs } = getPageMeta('dashboard', { navGroups: staffNavGroups, t, teamName: 'U12 Boys' });
    expect(crumbs.map((c) => c.label)).toEqual(['Home']);
  });

  it('covers routes with no sidebar entry via the static table', () => {
    const { title, crumbs } = getPageMeta('changelog', { navGroups: staffNavGroups, t });
    expect(title).toBe('Update Log');
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Update Log']);
  });

  it('humanizes an unknown deep link instead of rendering an empty header', () => {
    const { title } = getPageMeta('evaluate/session-42', { navGroups: staffNavGroups, t });
    expect(title).toBe('Session 42');
  });

  it('falls back to the generic team label when no team is selected', () => {
    const { crumbs } = getPageMeta('schedule', { navGroups: staffNavGroups, t });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'common.team', 'Schedule']);
  });
});
