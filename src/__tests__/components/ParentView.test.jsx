// ParentView was restructured onto AdminLTE's profile.html layout: a left
// identity rail (profile card + About card) beside a right column whose content
// lives behind nav-tabs. The whole page body was physically relocated into tab
// panes, so these tests check that nothing was lost in the move and that each
// pane still mounts — plus the usual DOM-nesting guard.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The view opens its panels through the URL now (usePanelRoute), so it needs a
// router around it the same way the app supplies one.
import { MemoryRouter } from 'react-router-dom';

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
const account = (overrides = {}) => ({
  id: 'a1',
  teamId: 't1',
  name: 'Venmo',
  handle: '@TeamVenmo',
  holding: 'digital',
  isActive: true,
  isPublic: true,
  ...overrides,
});

function renderParent({
  players = [player()],
  fin = financials(),
  seasonData = { isFinalized: true },
  accounts = [],
  team = TEAM,
  transactions = [],
} = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <ParentView
          players={players}
          transactions={transactions}
          calculatePlayerFinancials={() => fin}
          formatMoney={(v) => `$${Number(v).toFixed(2)}`}
          teams={[team]}
          seasons={[{ id: SEASON }]}
          selectedSeason={SEASON}
          setSelectedSeason={vi.fn()}
          currentSeasonData={seasonData}
          clubId="c1"
          onRefresh={vi.fn()}
          showToast={vi.fn()}
          showConfirm={vi.fn()}
          user={{ email: 'byron@example.com' }}
          accounts={accounts}
        />
      </I18nProvider>
    </MemoryRouter>,
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

  // The rail is a summary, not a control surface — its call-to-action button
  // only ever jumped to a tab already one click away in the tab strip.
  it('keeps the rail informational, with no call-to-action button', () => {
    renderParent();

    expect(screen.queryByRole('button', { name: /make a payment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view paperwork/i })).not.toBeInTheDocument();
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

// The Account pane's "How to Pay" panel is the only place a parent is told
// where the money goes. It is driven by the team's accounts, each of which
// carries an explicit isPublic flag — the team's internal ledger buckets share
// the same table and must never surface here.
describe('ParentView — how to pay', () => {
  it('lists a published account as a payment method', () => {
    renderParent({ accounts: [account()] });

    expect(screen.getByText(/how to pay/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /@TeamVenmo/ })).toBeInTheDocument();
  });

  // The visible label on the handle button is the handle alone, which conveys
  // nothing about what pressing it does.
  it('names the copy control by its action, not just the handle', () => {
    renderParent({ accounts: [account()] });
    expect(screen.getByRole('button', { name: /copy venmo handle @TeamVenmo/i })).toBeInTheDocument();
  });

  it('warns that the pay link leaves the app', () => {
    renderParent({ accounts: [account()] });
    expect(screen.getByRole('link', { name: /opens in a new tab/i })).toBeInTheDocument();
  });

  it('reports the QR toggle state and names the code it reveals', async () => {
    const user = userEvent.setup();
    renderParent({ accounts: [account()] });

    const toggle = screen.getByRole('button', { name: /qr code/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /hide qr/i })).toHaveAttribute('aria-expanded', 'true');
    // A bare <canvas> is announced as nothing at all without a name.
    expect(screen.getByRole('img', { name: /venmo payment code/i })).toBeInTheDocument();
  });

  it('renders every published account, not just the first', () => {
    renderParent({
      accounts: [account(), account({ id: 'a2', name: 'Zelle', handle: 'treasurer@team.com' })],
    });

    expect(screen.getByRole('button', { name: /@TeamVenmo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /treasurer@team\.com/ })).toBeInTheDocument();
  });

  it('withholds accounts the team keeps internal', () => {
    renderParent({
      accounts: [account({ id: 'a3', name: 'Chase Checking', handle: '****1234', isPublic: false })],
    });

    expect(screen.queryByText(/how to pay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*\*\*1234/)).not.toBeInTheDocument();
  });

  it('withholds archived accounts even when published', () => {
    renderParent({ accounts: [account({ isActive: false })] });
    expect(screen.queryByText(/how to pay/i)).not.toBeInTheDocument();
  });

  // The panel is the ask for money; a draft fee is the wrong number to ask for.
  it('withholds the whole panel until the budget is finalized', () => {
    renderParent({
      accounts: [account()],
      fin: financials({ isFinalized: false }),
      seasonData: { isFinalized: false },
    });

    expect(screen.queryByText(/how to pay/i)).not.toBeInTheDocument();
  });

  it('withholds it once the balance is settled', () => {
    renderParent({ accounts: [account()], fin: financials({ remainingBalance: 0, totalPaid: 500 }) });
    expect(screen.queryByText(/how to pay/i)).not.toBeInTheDocument();
  });

  it('withholds it from a waived player, who owes nothing to pay', () => {
    renderParent({ accounts: [account()], fin: financials({ isWaived: true }) });
    expect(screen.queryByText(/how to pay/i)).not.toBeInTheDocument();
  });

  // Falls back to the team's free-text instructions when no account is
  // published — the older configuration, still valid.
  it('falls back to the team payment instructions with no published accounts', () => {
    renderParent({ team: { ...TEAM, paymentInfo: 'Checks payable to U12 Boys' } });
    expect(screen.getByText(/checks payable to u12 boys/i)).toBeInTheDocument();
  });
});

// A sponsorship or fundraiser deposit is recorded against the player who brought
// the money in; distributing it writes a second row with the SAME title for the
// share applied to that player's fee. Both show on the statement, which read as
// the same transaction logged twice — and made an undone distribution look like
// it had left rows behind.
describe('ParentView — sponsorship and fundraising rows', () => {
  const tx = (overrides = {}) => ({
    id: 't-1',
    playerId: 'p1',
    seasonId: SEASON,
    category: 'FUN',
    title: 'Friends Of',
    amount: 310,
    cleared: true,
    date: { seconds: 1755500000 },
    waterfallBatchId: null,
    ...overrides,
  });

  const deposit = tx({ id: 'dep-1' });
  const credit = tx({ id: 'cr-1', amount: 120, waterfallBatchId: 'waterfall_1', originalTxId: 'dep-1' });

  it('tells the deposit apart from the credit applied to the balance', () => {
    renderParent({ transactions: [deposit, credit] });

    expect(screen.getByText('Raised for the team')).toBeInTheDocument();
    expect(screen.getByText('Applied to balance')).toBeInTheDocument();
  });

  it('explains why the same name appears twice', () => {
    renderParent({ transactions: [deposit, credit] });

    expect(screen.getByText(/count toward the balance above/i)).toBeInTheDocument();
  });

  it('leaves the note off when there is nothing to disambiguate', () => {
    renderParent({ transactions: [credit] });

    expect(screen.queryByText(/count toward the balance above/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Raised for the team')).not.toBeInTheDocument();
  });

  it('does not label ordinary fee payments', () => {
    renderParent({ transactions: [tx({ id: 'fee-1', category: 'TMF', title: 'Team Fee', amount: 200 })] });

    expect(screen.queryByText('Applied to balance')).not.toBeInTheDocument();
    expect(screen.queryByText('Raised for the team')).not.toBeInTheDocument();
  });
});
