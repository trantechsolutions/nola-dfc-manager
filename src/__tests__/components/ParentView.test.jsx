// ParentView was restructured onto AdminLTE's profile.html layout: a left
// identity rail (profile card + About card) beside a right column whose content
// lives behind nav-tabs. The whole page body was physically relocated into tab
// panes, so these tests check that nothing was lost in the move and that each
// pane still mounts — plus the usual DOM-nesting guard.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getPlayersByGuardianEmail: vi.fn().mockResolvedValue([]),
    getTeamSeason: vi.fn().mockResolvedValue(null),
    getTransactionsByTeamSeason: vi.fn().mockResolvedValue([]),
    getPlayerDocuments: vi.fn().mockResolvedValue([]),
    getDocumentUrl: vi.fn().mockResolvedValue(''),
    deleteDocument: vi.fn().mockResolvedValue({}),
    uploadDocument: vi.fn().mockResolvedValue({}),
    setSeasonCompliance: vi.fn().mockResolvedValue({}),
    updateOwnPlayerDetails: vi.fn().mockResolvedValue({}),
    updateGuardianPhone: vi.fn().mockResolvedValue({}),
  },
}));

import { I18nProvider } from '../../i18n/I18nContext';
import ParentView from '../../views/team/ParentView';

const SEASON = '2025-26';
const TEAM = { id: 't1', name: 'U12 Boys', colorPrimary: '#0d6efd' };

const player = (overrides = {}) => ({
  id: 'p1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  jerseyNumber: 7,
  teamId: 't1',
  status: 'active',
  birthdate: '2013-05-01',
  guardians: [{ name: 'Byron Lovelace', email: 'byron@example.com', phone: '5045551212' }],
  seasonProfiles: { [SEASON]: { status: 'active' } },
  ...overrides,
});

const financials = (overrides = {}) => ({
  baseFee: 500,
  totalPaid: 200,
  remainingBalance: 300,
  isFinalized: true,
  isWaived: false,
  ...overrides,
});

// `seasonData` is separate from `fin` because the view ORs the two together —
// a test for the draft case has to turn finalization off in both places.
function renderParent({ players = [player()], fin = financials(), seasonData = { isFinalized: true } } = {}) {
  return render(
    <I18nProvider>
      <ParentView
        players={players}
        transactions={[]}
        calculatePlayerFinancials={() => fin}
        formatMoney={(v) => `$${Number(v).toFixed(2)}`}
        teams={[TEAM]}
        seasons={[{ id: SEASON }]}
        selectedSeason={SEASON}
        setSelectedSeason={vi.fn()}
        currentSeasonData={seasonData}
        clubId="c1"
        onRefresh={vi.fn()}
        showToast={vi.fn()}
        showConfirm={vi.fn()}
        user={{ email: 'byron@example.com' }}
        accounts={[]}
      />
    </I18nProvider>,
  );
}

describe('ParentView — profile layout', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  const nestingWarnings = () => errorSpy.mock.calls.filter((c) => String(c[0]).includes('validateDOMNesting'));

  it('renders the identity rail: avatar, name, team and the key/value list', () => {
    renderParent();

    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    // Jersey number stands in for the reference's avatar image.
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getAllByText(/U12 Boys/).length).toBeGreaterThan(0);

    // Scope to the rail's key/value list — the fee and balance also appear in
    // the Account pane, so an unscoped query matches twice.
    const rail = screen.getAllByRole('list')[0];
    expect(within(rail).getByText('$500.00')).toBeInTheDocument();
    expect(within(rail).getByText('$200.00')).toBeInTheDocument();
    expect(within(rail).getByText('$300.00')).toBeInTheDocument();
    expect(nestingWarnings()).toEqual([]);
  });

  it('points the primary button at payment while a balance is owed', () => {
    renderParent();
    expect(screen.getByRole('button', { name: /make a payment/i })).toBeInTheDocument();
  });

  // A draft budget means the fee is still an estimate — offering to collect it
  // would be collecting the wrong amount.
  it('withholds the payment button until the budget is finalized', () => {
    renderParent({ fin: financials({ isFinalized: false }), seasonData: { isFinalized: false } });

    expect(screen.queryByRole('button', { name: /make a payment/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view paperwork/i })).toBeInTheDocument();
  });

  it('withholds it for a waived player even once finalized', () => {
    renderParent({ fin: financials({ isWaived: true }) });

    expect(screen.queryByRole('button', { name: /make a payment/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view paperwork/i })).toBeInTheDocument();
  });

  it('points it at paperwork once the balance is settled', async () => {
    const user = userEvent.setup();
    renderParent({ fin: financials({ remainingBalance: 0, totalPaid: 500 }) });

    const button = screen.getByRole('button', { name: /view paperwork/i });
    await user.click(button);
    expect(screen.getByRole('tab', { name: /paperwork/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on the Account tab', () => {
    renderParent();
    expect(screen.getByRole('tab', { name: /account/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /paperwork/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('switches panes without breaking DOM nesting', async () => {
    const user = userEvent.setup();
    renderParent();

    await user.click(screen.getByRole('tab', { name: /details/i }));
    expect(screen.getByRole('tab', { name: /details/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /account/i })).toHaveAttribute('aria-selected', 'false');

    await user.click(screen.getByRole('tab', { name: /paperwork/i }));
    expect(screen.getByRole('tab', { name: /paperwork/i })).toHaveAttribute('aria-selected', 'true');

    expect(nestingWarnings()).toEqual([]);
  });

  it('lists guardians in the About card', () => {
    renderParent();
    expect(screen.getByText('Byron Lovelace')).toBeInTheDocument();
  });

  it('keeps the child switcher for guardians with more than one player', () => {
    renderParent({ players: [player(), player({ id: 'p2', firstName: 'Grace', jerseyNumber: 9 })] });
    expect(screen.getByRole('button', { name: /#7 Ada/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /#9 Grace/ })).toBeInTheDocument();
  });

  it('omits the child switcher for a single player', () => {
    renderParent();
    expect(screen.queryByRole('button', { name: /#7 Ada/ })).not.toBeInTheDocument();
  });
});
