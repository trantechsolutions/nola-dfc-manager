import { describe, it, expect } from 'vitest';
import { Calendar, ListChecks, LayoutDashboard, ReceiptText, Shield, Users } from 'lucide-react';
import { buildDestinations, findDestination } from '../../utils/navDestinations';

const item = (id, label, icon = Users) => ({ id, label, icon });

describe('buildDestinations', () => {
  it('gives a parent three tabs, naming a one-page destination after its page', () => {
    const dests = buildDestinations([
      item('dashboard', 'My Player'),
      item('checklist', 'Checklist', ListChecks),
      item('schedule', 'Schedule', Calendar),
    ]);
    expect(dests.map((d) => d.label)).toEqual(['Home', 'Schedule', 'Checklist']);
    expect(dests[2].icon).toBe(ListChecks);
  });

  it('groups a team manager into five destinations, each opening its first page', () => {
    const dests = buildDestinations([
      item('dashboard', 'Season Overview', LayoutDashboard),
      item('finance/ledger', 'Ledger', ReceiptText),
      item('finance/budget', 'Budget'),
      item('schedule', 'Schedule'),
      item('planner', 'Planner'),
      item('people', 'Players'),
      item('checklist', 'Checklist'),
      item('team-admin', 'Settings'),
      item('club-overview', 'Overview', Shield),
    ]);
    expect(dests.map((d) => d.id)).toEqual(['home', 'schedule', 'team', 'money', 'manage']);
    expect(dests.find((d) => d.id === 'money').to).toBe('/finance/budget');
    expect(dests.find((d) => d.id === 'manage').items.map((i) => i.id)).toEqual(['club-overview', 'team-admin']);
  });

  it('parks an unplaced nav item under Manage rather than dropping it', () => {
    const dests = buildDestinations([item('dashboard', 'Home'), item('brand-new-page', 'New')]);
    expect(dests.find((d) => d.id === 'manage').items.map((i) => i.id)).toEqual(['brand-new-page']);
  });

  it('keeps the Stats tab named Stats while game film is its only page', () => {
    const dests = buildDestinations([item('dashboard', 'Home'), item('film', 'Game film')]);
    const stats = dests.find((d) => d.id === 'stats');
    expect(stats.label).toBe('Stats');
    expect(stats.to).toBe('/film');
  });

  it('keeps Manage off the phone tab bar, and every other tab on it', () => {
    const dests = buildDestinations([
      item('dashboard', 'Home'),
      item('schedule', 'Schedule'),
      item('film', 'Game film'),
      item('people', 'Players'),
      item('finance/ledger', 'Ledger'),
      item('team-admin', 'Settings'),
    ]);
    expect(dests.map((d) => d.id)).toEqual(['home', 'schedule', 'stats', 'team', 'money', 'manage']);
    expect(dests.filter((d) => d.phoneTab).map((d) => d.id)).toEqual(['home', 'schedule', 'stats', 'team', 'money']);
  });

  it('omits destinations the user has no pages in', () => {
    const dests = buildDestinations([item('dashboard', 'Home'), item('schedule', 'Schedule')]);
    expect(dests.map((d) => d.id)).toEqual(['home', 'schedule']);
  });
});

describe('findDestination', () => {
  const dests = buildDestinations([
    item('dashboard', 'Home'),
    item('finance/ledger', 'Ledger'),
    item('club-overview', 'Overview'),
  ]);

  it('finds the destination holding the route', () => {
    expect(findDestination(dests, 'finance/ledger').id).toBe('money');
  });

  it('falls back by prefix for routes with no nav entry', () => {
    expect(findDestination(dests, 'club-onboard').id).toBe('manage');
  });

  it('puts every game film page, and a live game, under Stats', () => {
    const withFilm = buildDestinations([item('dashboard', 'Home'), item('film', 'Game film')]);
    expect(findDestination(withFilm, 'film/t1/game/vs-x/report').id).toBe('stats');
    expect(findDestination(withFilm, 'live/t1/vs-x').id).toBe('stats');
  });

  it('returns null for app-level pages', () => {
    expect(findDestination(dests, 'help')).toBeNull();
  });
});
