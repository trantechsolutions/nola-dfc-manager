import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { I18nProvider } from '../i18n/I18nContext';
import SponsorsView from '../views/team/SponsorsView';

const PENDING_TX = {
  id: 'tx-1',
  category: 'FUN',
  amount: 300,
  title: 'Car Wash',
  distributed: false,
  playerId: null,
};

const PLAYERS = [
  { id: 'p1', firstName: 'Ana', lastName: 'Reyes' },
  { id: 'p2', firstName: 'Ben', lastName: 'Ortiz' },
  { id: 'p3', firstName: 'Cleo', lastName: 'Marsh' },
];

const BALANCES = { p1: 120, p2: 400, p3: 0 };

const makeProps = (overrides = {}) => ({
  transactions: [PENDING_TX],
  selectedSeason: 's1',
  formatMoney: (n) => `$${Number(n).toFixed(2)}`,
  onDistribute: vi.fn(),
  onReset: vi.fn(),
  seasonalPlayers: PLAYERS,
  seasons: [{ id: 's1', isFinalized: true }],
  currentSeasonData: { isFinalized: true },
  distributionMethod: 'waterfall',
  onSetDistributionMethod: vi.fn(),
  calculatePlayerFinancials: (player) => ({ remainingBalance: BALANCES[player.id] ?? 0 }),
  ...overrides,
});

// Open the distribution modal for the single pending credit and flip on manual mode.
function openManualModal(props) {
  render(
    <I18nProvider>
      <SponsorsView {...props} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText('Distribute Funds'));
  fireEvent.click(screen.getByRole('switch', { name: 'Split manually' }));
}

const amountFor = (name) => screen.getByLabelText(name);
const applyButton = () => screen.getByRole('button', { name: 'Apply Manual Split' });

describe('SponsorsView manual split', () => {
  beforeEach(async () => {
    localStorage.clear();
    const i18n = (await import('../i18n/config')).default;
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('passes per-player allocations to onDistribute', () => {
    const props = makeProps();
    openManualModal(props);

    fireEvent.change(amountFor('Ana Reyes'), { target: { value: '175' } });
    fireEvent.change(amountFor('Cleo Marsh'), { target: { value: '125' } });
    fireEvent.click(applyButton());

    expect(props.onDistribute).toHaveBeenCalledWith(300, 'Car Wash', '', 'tx-1', 'FUN', [
      { playerId: 'p1', amount: 175 },
      { playerId: 'p3', amount: 125 },
    ]);
  });

  it('sends null allocations when manual mode is off', () => {
    const props = makeProps();
    render(
      <I18nProvider>
        <SponsorsView {...props} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('Distribute Funds'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Waterfall' }));

    expect(props.onDistribute).toHaveBeenCalledWith(300, 'Car Wash', '', 'tx-1', 'FUN', null);
  });

  it('shows the unallocated remainder as headed for the team pot', () => {
    openManualModal(makeProps());
    fireEvent.change(amountFor('Ben Ortiz'), { target: { value: '100' } });

    const remainder = screen.getByText('Remainder to team pot').closest('div');
    expect(within(remainder).getByText('$200.00')).toBeInTheDocument();
  });

  it('blocks applying when the split exceeds the total', () => {
    const props = makeProps();
    openManualModal(props);

    fireEvent.change(amountFor('Ana Reyes'), { target: { value: '250' } });
    fireEvent.change(amountFor('Ben Ortiz'), { target: { value: '100' } });

    expect(screen.getByText('Assigned amounts exceed the total. Lower an amount before applying.')).toBeInTheDocument();
    expect(applyButton()).toBeDisabled();

    fireEvent.click(applyButton());
    expect(props.onDistribute).not.toHaveBeenCalled();
  });

  it('blocks applying when nothing has been assigned', () => {
    openManualModal(makeProps());
    expect(applyButton()).toBeDisabled();
  });

  it('fills a player up to what they still owe, capped by the remainder', () => {
    openManualModal(makeProps());

    // Ana owes 120 and the full 300 is unassigned → fills 120.
    fireEvent.click(screen.getByRole('button', { name: 'Owes $120.00 — tap to fill' }));
    expect(amountFor('Ana Reyes')).toHaveValue(120);

    // Ben owes 400 but only 180 is left → fills the remainder.
    fireEvent.click(screen.getByRole('button', { name: 'Owes $400.00 — tap to fill' }));
    expect(amountFor('Ben Ortiz')).toHaveValue(180);
  });

  it('clears manual entries when the modal is reopened', () => {
    openManualModal(makeProps());
    fireEvent.change(amountFor('Ana Reyes'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByText('Distribute Funds'));
    fireEvent.click(screen.getByRole('switch', { name: 'Split manually' }));
    expect(amountFor('Ana Reyes')).toHaveValue(null);
  });
});
