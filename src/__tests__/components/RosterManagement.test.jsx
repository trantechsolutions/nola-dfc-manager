// The roster moved from a grid-of-divs pseudo-table to a real <table> on the
// shared directory template. The nesting assertion matters most here: a stray
// <div> left inside <tbody> parses and builds fine but renders as a collapsed
// row in the browser, so it is checked explicitly rather than assumed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getPlayerDocuments: vi.fn().mockResolvedValue([]),
    getDocumentUrl: vi.fn().mockResolvedValue(''),
    deleteDocument: vi.fn().mockResolvedValue({}),
    setSeasonCompliance: vi.fn().mockResolvedValue({}),
    addPlayerToSeason: vi.fn().mockResolvedValue({}),
    removePlayerFromSeason: vi.fn().mockResolvedValue({}),
    updatePlayerField: vi.fn().mockResolvedValue({}),
  },
}));

import { I18nProvider } from '../../i18n/I18nContext';
import RosterManagement from '../../views/team/RosterManagement';

const SEASON = '2025-26';

const player = (i, overrides = {}) => ({
  id: `p${i}`,
  firstName: 'Player',
  lastName: String(i).padStart(2, '0'),
  jerseyNumber: i,
  status: 'active',
  birthdate: '2013-05-01',
  guardians: [{ name: `Guardian ${i}`, email: `g${i}@example.com`, phone: '5045551212' }],
  seasonProfiles: { [SEASON]: { status: 'active' } },
  ...overrides,
});

function renderRoster(players) {
  return render(
    <I18nProvider>
      <RosterManagement
        players={players}
        seasons={[{ id: SEASON }]}
        selectedSeason={SEASON}
        selectedTeam={{ id: 't1', name: 'U12 Boys' }}
        club={{ id: 'c1', name: 'NOLA DFC' }}
        currentTeamSeason={{ id: 'ts1' }}
        showToast={vi.fn()}
        showConfirm={vi.fn()}
        can={() => true}
        PERMISSIONS={{}}
        onEditPlayer={vi.fn()}
        onAddPlayer={vi.fn()}
        onViewPlayer={vi.fn()}
        refreshData={vi.fn()}
      />
    </I18nProvider>,
  );
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('RosterManagement', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('renders players as rows of a real table with no invalid DOM nesting', () => {
    renderRoster([player(1), player(2)]);

    expect(screen.getByText('Player Directory')).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]).getByText(/Player, 01|01, Player/)).toBeInTheDocument();

    const nesting = errorSpy.mock.calls.filter((c) => String(c[0]).includes('validateDOMNesting'));
    expect(nesting).toEqual([]);
  });

  it('states the range in the card footer', () => {
    renderRoster(Array.from({ length: 3 }, (_, i) => player(i + 1)));
    expect(screen.getByText(/Showing 1 to 3 of 3/)).toBeInTheDocument();
  });

  it('expands a detail panel into a full-width row without breaking the table', async () => {
    const user = userEvent.setup();
    renderRoster([player(1)]);

    await user.click(within(rows()[0]).getByText(/Player, 01|01, Player/));

    const detail = rows().find((r) => within(r).queryByText(/Guardians \/ Contacts/i));
    expect(detail).toBeDefined();
    expect(
      within(detail)
        .getByText(/Guardians \/ Contacts/i)
        .closest('td'),
    ).toHaveAttribute('colspan', '6');

    const nesting = errorSpy.mock.calls.filter((c) => String(c[0]).includes('validateDOMNesting'));
    expect(nesting).toEqual([]);
  });

  it('filters by search', async () => {
    const user = userEvent.setup();
    renderRoster(Array.from({ length: 5 }, (_, i) => player(i + 1)));

    await user.type(screen.getByRole('searchbox', { name: /search players/i }), '03');
    expect(rows()).toHaveLength(1);
  });

  it('sorts by the jersey column header', async () => {
    const user = userEvent.setup();
    renderRoster([player(3), player(1), player(2)]);

    const header = screen.getByRole('columnheader', { name: /#/ });
    expect(header).toHaveAttribute('aria-sort', 'none');

    await user.click(within(header).getByRole('button'));
    expect(screen.getByRole('columnheader', { name: /#/ })).toHaveAttribute('aria-sort', 'ascending');
  });
});
