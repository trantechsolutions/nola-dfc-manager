import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
// The view opens its panels through the URL now (usePanelRoute), so it needs a
// router around it the same way the app supplies one.
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../i18n/I18nContext';
import SponsorsView from '../views/team/SponsorsView';

const ACCOUNTS = [{ id: 'acc-bank', name: 'Team Checking', holding: 'bank' }];

const makeProps = (overrides = {}) => ({
  transactions: [],
  selectedSeason: 's1',
  formatMoney: (n) => `$${Number(n).toFixed(2)}`,
  onDistribute: vi.fn(),
  onReset: vi.fn(),
  seasonalPlayers: [{ id: 'p1', firstName: 'Ana', lastName: 'Reyes' }],
  seasons: [{ id: 's1', isFinalized: true }],
  currentSeasonData: { isFinalized: true },
  distributionMethod: 'waterfall',
  onSetDistributionMethod: vi.fn(),
  onAddFunds: vi.fn().mockResolvedValue({ success: true }),
  activeAccounts: ACCOUNTS,
  ...overrides,
});

const renderView = (props) =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <SponsorsView {...props} />
      </I18nProvider>
    </MemoryRouter>,
  );

describe('SponsorsView fundraising intake', () => {
  beforeEach(async () => {
    localStorage.clear();
    const i18n = (await import('../i18n/config')).default;
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('records a sponsorship straight from the fundraising page', async () => {
    const props = makeProps();
    renderView(props);

    fireEvent.click(screen.getAllByRole('button', { name: 'Record Funds' })[0]);
    fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: 'Quattro Pizza' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to Ledger' }));

    await waitFor(() => expect(props.onAddFunds).toHaveBeenCalled());
    expect(props.onAddFunds).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'SPO', title: 'Quattro Pizza', amount: 500, cleared: true }),
    );
  });

  it('hides the intake entirely without ledger-edit rights', () => {
    renderView(makeProps({ onAddFunds: null }));
    expect(screen.queryByRole('button', { name: /Record Funds/ })).not.toBeInTheDocument();
  });

  it('flags a pending item whose funds have not been received', () => {
    const props = makeProps({
      transactions: [
        { id: 'tx-1', category: 'SPO', amount: 500, title: 'Pledged Sponsor', cleared: false, distributed: false },
        { id: 'tx-2', category: 'FUN', amount: 300, title: 'Car Wash', cleared: true, distributed: false },
      ],
    });
    renderView(props);

    const pledgeCard = screen.getByText('Pledged Sponsor').closest('div.bg-card');
    const washCard = screen.getByText('Car Wash').closest('div.bg-card');
    expect(within(pledgeCard).getByText('Not received')).toBeInTheDocument();
    expect(within(washCard).queryByText('Not received')).not.toBeInTheDocument();
  });
});
