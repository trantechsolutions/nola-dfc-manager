// Team directory on the shared users-page template. As with the roster, the
// DOM-nesting check is the point: this view was a list of cards before, so a
// leftover wrapper <div> inside <tbody> is the most likely conversion defect.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The view opens its panels through the URL now (usePanelRoute), so it needs a
// router around it the same way the app supplies one.
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getTeamRoles: vi.fn().mockResolvedValue([]),
    getRolesForTeam: vi.fn().mockResolvedValue([]),
    createTeam: vi.fn().mockResolvedValue({}),
    updateTeam: vi.fn().mockResolvedValue({}),
    archiveTeam: vi.fn().mockResolvedValue({}),
    assignRoleByEmail: vi.fn().mockResolvedValue({}),
    revokeRole: vi.fn().mockResolvedValue({}),
  },
}));

import { I18nProvider } from '../../i18n/I18nContext';
import TeamList from '../../views/club/TeamList';

const team = (i, overrides = {}) => ({
  id: `t${i}`,
  name: `Team ${String(i).padStart(2, '0')}`,
  ageGroup: 'U12',
  gender: 'M',
  tier: 'competitive',
  colorPrimary: '#0d6efd',
  ...overrides,
});

function renderList(teams) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <TeamList
          club={{ id: 'c1', name: 'NOLA DFC' }}
          teams={teams}
          onSelectTeam={vi.fn()}
          formatMoney={(v) => `$${v}`}
          showToast={vi.fn()}
          showConfirm={vi.fn()}
          refreshContext={vi.fn()}
        />
      </I18nProvider>
    </MemoryRouter>,
  );
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('TeamList', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('renders teams as table rows with no invalid DOM nesting', () => {
    renderList([team(1), team(2)]);

    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]).getByText('Team 01')).toBeInTheDocument();
    expect(within(rows()[0]).getByText('Boys')).toBeInTheDocument();
    expect(within(rows()[0]).getByText('competitive')).toBeInTheDocument();

    const nesting = errorSpy.mock.calls.filter((c) => String(c[0]).includes('validateDOMNesting'));
    expect(nesting).toEqual([]);
  });

  it('states the range in the card footer', () => {
    renderList([team(1), team(2), team(3)]);
    expect(screen.getByText('Showing 1 to 3 of 3 teams')).toBeInTheDocument();
  });

  it('filters by search', async () => {
    const user = userEvent.setup();
    renderList([team(1), team(2), team(3)]);

    await user.type(screen.getByRole('searchbox', { name: /search teams/i }), 'Team 02');
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Showing 1 to 1 of 1 team')).toBeInTheDocument();
  });

  it('says so plainly when nothing matches', async () => {
    const user = userEvent.setup();
    renderList([team(1)]);

    await user.type(screen.getByRole('searchbox', { name: /search teams/i }), 'zzz');
    expect(screen.getByText('No teams match your search.')).toBeInTheDocument();
  });

  it('swaps the name cell for an inline editor without leaving the table', async () => {
    const user = userEvent.setup();
    renderList([team(1)]);

    await user.click(screen.getByRole('button', { name: /edit team name/i }));
    expect(screen.getByRole('textbox', { name: /team name/i })).toHaveValue('Team 01');

    const nesting = errorSpy.mock.calls.filter((c) => String(c[0]).includes('validateDOMNesting'));
    expect(nesting).toEqual([]);
  });
});
