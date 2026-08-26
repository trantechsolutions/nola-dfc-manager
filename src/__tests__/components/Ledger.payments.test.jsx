// A partial payment is a real transaction of its own, but the ledger must read
// as one obligation being worked down — not as scattered deposits. These pin
// that contract: one visible row carrying the balance, the payments folded in
// behind a toggle, the money counted exactly once, and nothing disappearing
// when a filter separates a payment from what it pays off.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Ledger from '../../components/Ledger';

const day = (iso) => ({ seconds: Math.floor(new Date(`${iso}T12:00:00`).getTime() / 1000) });
const formatMoney = (n) => `$${Number(n).toFixed(2)}`;

// The obligation: a season fee a family is paying off. Never cleared — its
// money lives in the payments below it.
const FEE = {
  id: 'tx1',
  title: 'Spring team fee',
  amount: 500,
  category: 'TMF',
  date: day('2026-08-01'),
  cleared: false,
};

const payment = (over = {}) => ({
  id: 'pay1',
  title: 'Payment: Spring team fee',
  amount: 100,
  category: 'TMF',
  date: day('2026-09-05'),
  cleared: true,
  installmentOfTxId: 'tx1',
  ...over,
});

const renderLedger = (transactions, props = {}) =>
  render(<Ledger transactions={transactions} onEditTx={vi.fn()} formatMoney={formatMoney} {...props} />);

const desktopTable = () => document.querySelector('table');
// The filter bar's running totals — the only +/- pair outside the rows.
const incomeTotal = () => document.querySelector('.ml-3');

describe('Ledger payment plans', () => {
  it('folds a payment into the obligation it pays off instead of listing it separately', () => {
    renderLedger([FEE, payment()]);
    const rows = within(desktopTable()).getAllByRole('row');
    // header + the single collapsed obligation row
    expect(rows).toHaveLength(2);
    expect(within(desktopTable()).queryByText('Payment: Spring team fee')).not.toBeInTheDocument();
  });

  it('shows how much has been paid and how much is still owed', () => {
    renderLedger([FEE, payment(), payment({ id: 'pay2', amount: 150 })]);
    const table = within(desktopTable());
    expect(table.getByText('$250.00 of $500.00 paid')).toBeInTheDocument();
    expect(table.getAllByText('$250.00 left').length).toBeGreaterThan(0);
  });

  it('reads as paid in full once the balance is settled', () => {
    renderLedger([FEE, payment({ amount: 500 })]);
    expect(within(desktopTable()).getAllByText('Paid in full').length).toBeGreaterThan(0);
    expect(within(desktopTable()).queryByText('Pending')).not.toBeInTheDocument();
  });

  it('counts the obligation once, not once per payment, in the totals', async () => {
    // The obligation carries the full $500. Adding the instalments on top would
    // report $700 of income against $500 of actual fees. Totals only appear
    // under an active filter, so narrow to income first.
    renderLedger([FEE, payment(), payment({ id: 'pay2', amount: 100 })]);
    await userEvent.click(screen.getByRole('button', { name: 'Income' }));

    expect(incomeTotal()).toHaveTextContent('+$500.00');
  });

  it('still counts a payment whose obligation is filtered out of view', async () => {
    renderLedger([FEE, payment()]);
    // Searching for the payment leaves the fee behind; the money must not vanish
    // from the totals along with its parent row.
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'Payment:');
    expect(within(desktopTable()).getByText('Payment: Spring team fee')).toBeInTheDocument();
    expect(incomeTotal()).toHaveTextContent('+$100.00');
  });

  it('reveals the payments on expand and offers to delete one', async () => {
    const onDeleteTx = vi.fn();
    renderLedger([FEE, payment()], { onDeleteTx });

    await userEvent.click(screen.getByLabelText(/linked payment/i));

    const table = within(desktopTable());
    expect(table.getByText('Payment: Spring team fee')).toBeInTheDocument();

    await userEvent.click(table.getByLabelText('Delete this payment'));
    expect(onDeleteTx).toHaveBeenCalledWith('pay1');
  });

  it('offers to record a payment against a pending entry', async () => {
    const onRecordPayment = vi.fn();
    renderLedger([FEE], { onRecordPayment });

    await userEvent.click(screen.getAllByLabelText('Record a payment')[0]);
    expect(onRecordPayment).toHaveBeenCalledWith(FEE);
  });

  it('withdraws the action once the balance is settled', () => {
    renderLedger([FEE, payment({ amount: 500 })], { onRecordPayment: vi.fn() });
    expect(screen.queryByLabelText('Record a payment')).not.toBeInTheDocument();
  });

  it('does not offer to record a payment against money already in the account', () => {
    renderLedger([{ ...FEE, cleared: true }], { onRecordPayment: vi.fn() });
    expect(screen.queryByLabelText('Record a payment')).not.toBeInTheDocument();
  });

  it('withdraws the refund action from an obligation being paid off', () => {
    // The obligation is not money that changed hands, so there is nothing on it
    // to give back — the payments are what would be refunded.
    renderLedger([FEE, payment()], { onRefundTx: vi.fn() });
    expect(screen.queryByLabelText('Refund')).not.toBeInTheDocument();
  });

  it('keeps a refund of a payment on its own row rather than burying it', async () => {
    // The payment is folded under the fee; its reversal cannot fold under the
    // payment as well or it would disappear from the ledger entirely.
    const reversal = {
      id: 'r1',
      title: 'Refund: payment',
      amount: -100,
      category: 'TMF',
      date: day('2026-09-20'),
      cleared: true,
      refundOfTxId: 'pay1',
    };
    renderLedger([FEE, payment(), reversal]);
    expect(within(desktopTable()).getByText('Refund: payment')).toBeInTheDocument();
  });

  it('filters down to what is on a payment plan', async () => {
    const other = {
      id: 'tx9',
      title: 'Referee cash',
      amount: -60,
      category: 'LEA',
      date: day('2026-09-01'),
      cleared: true,
    };
    renderLedger([FEE, payment(), other]);

    await userEvent.click(screen.getByRole('button', { name: 'Payment plans' }));

    const table = within(desktopTable());
    expect(table.getByText('Spring team fee')).toBeInTheDocument();
    expect(table.queryByText('Referee cash')).not.toBeInTheDocument();
  });
});
