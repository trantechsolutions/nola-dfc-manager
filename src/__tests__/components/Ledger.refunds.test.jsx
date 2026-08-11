// A refund is stored as its own reversing row so balances stay honest, but the
// ledger must not read as two unrelated line items. These pin that contract:
// one visible row, the reversal folded in behind a toggle, and nothing ever
// disappearing when a filter separates a refund from what it reverses.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Ledger from '../../components/Ledger';

const day = (iso) => ({ seconds: Math.floor(new Date(`${iso}T12:00:00`).getTime() / 1000) });
const formatMoney = (n) => `$${Number(n).toFixed(2)}`;

const FEE = {
  id: 'tx1',
  title: 'Tournament fee',
  amount: -450,
  category: 'TOU',
  date: day('2026-03-02'),
  cleared: true,
};

const refund = (over = {}) => ({
  id: 'r1',
  title: 'Refund: Tournament fee',
  amount: 450,
  category: 'TOU',
  date: day('2026-03-09'),
  cleared: true,
  refundOfTxId: 'tx1',
  ...over,
});

const renderLedger = (transactions, props = {}) =>
  render(<Ledger transactions={transactions} onEditTx={vi.fn()} formatMoney={formatMoney} {...props} />);

const desktopTable = () => document.querySelector('table');

describe('Ledger refund grouping', () => {
  it('folds a refund into the row it reverses instead of listing it separately', () => {
    renderLedger([FEE, refund()]);
    const rows = within(desktopTable()).getAllByRole('row');
    // header + the single collapsed transaction row
    expect(rows).toHaveLength(2);
    expect(within(desktopTable()).queryByText('Refund: Tournament fee')).not.toBeInTheDocument();
  });

  it('shows the original struck through against the net once refunded', () => {
    renderLedger([FEE, refund({ amount: 200 })]);
    // The original is split across text nodes ('-' then the figure), so read the
    // struck-through span directly rather than matching on exact text.
    const struck = desktopTable().querySelector('.line-through');
    expect(struck.textContent.replace(/\s/g, '')).toBe('-$450.00');
    expect(within(desktopTable()).getByText('-$250.00')).toBeInTheDocument();
  });

  it('reveals the refund on expand and offers to delete it', async () => {
    const onDeleteTx = vi.fn();
    renderLedger([FEE, refund()], { onDeleteTx });

    await userEvent.click(screen.getByLabelText(/linked refund/i));

    const table = within(desktopTable());
    expect(table.getByText('Refund: Tournament fee')).toBeInTheDocument();

    await userEvent.click(table.getByLabelText('Delete this refund'));
    expect(onDeleteTx).toHaveBeenCalledWith('r1');
  });

  it('gives a refund its own row when its original is filtered out', async () => {
    renderLedger([FEE, refund()]);
    // Searching for the refund leaves the fee behind — the reversal must still show.
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'Refund:');
    expect(within(desktopTable()).getByText('Refund: Tournament fee')).toBeInTheDocument();
  });

  it('hides the refund action once nothing is left to refund', () => {
    const { rerender } = renderLedger([FEE], { onRefundTx: vi.fn() });
    expect(screen.getAllByLabelText('Refund').length).toBeGreaterThan(0);

    rerender(
      <Ledger transactions={[FEE, refund()]} onEditTx={vi.fn()} onRefundTx={vi.fn()} formatMoney={formatMoney} />,
    );
    expect(screen.queryByLabelText('Refund')).not.toBeInTheDocument();
  });
});
