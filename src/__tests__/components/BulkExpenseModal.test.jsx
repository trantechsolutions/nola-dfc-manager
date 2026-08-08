// The bulk form authors expense lines once and multiplies them across the
// selected events, so the arithmetic that matters is lines × events — plus the
// duplicate guard, which is the only thing standing between a second click and
// a doubled ledger.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { I18nProvider } from '../../i18n/I18nContext';
import BulkExpenseModal from '../../components/BulkExpenseModal';

const CANDIDATES = [
  {
    id: 'ev-1',
    title: 'League vs Rangers',
    displayDate: 'Sat, Mar 14',
    eventDate: '2026-03-14T00:00:00',
    eventType: 'league',
    isPast: false,
  },
  {
    id: 'ev-2',
    title: 'League vs United',
    displayDate: 'Sat, Mar 21',
    eventDate: '2026-03-21T00:00:00',
    eventType: 'league',
    isPast: false,
  },
  {
    id: 'ev-3',
    title: 'Winter Friendly',
    displayDate: 'Sat, Jan 10',
    eventDate: '2026-01-10T00:00:00',
    eventType: 'friendly',
    isPast: true,
  },
];

// ev-2 already carries a referee fee — the duplicate guard should notice.
const EXISTING = { 'ev-2': [{ id: 'tx-9', title: 'Referee Fees', category: 'LEA', amount: -50 }] };

function renderModal(props = {}) {
  const onBulkAddExpenses = props.onBulkAddExpenses ?? vi.fn().mockResolvedValue({ success: true });
  const onClose = props.onClose ?? vi.fn();
  render(
    <I18nProvider>
      <BulkExpenseModal
        show
        onClose={onClose}
        candidates={CANDIDATES}
        existingByEventId={EXISTING}
        onBulkAddExpenses={onBulkAddExpenses}
        seasonIds={['2025-26']}
        activeAccounts={[{ id: 'acct-1', name: 'Team Checking', holding: 'bank' }]}
        {...props}
      />
    </I18nProvider>,
  );
  return { onBulkAddExpenses, onClose };
}

async function fillFirstLine(user, title, amount) {
  await user.type(screen.getAllByPlaceholderText(/expense description/i)[0], title);
  await user.type(screen.getAllByRole('spinbutton')[0], amount);
}

describe('BulkExpenseModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists upcoming events only until the scope is widened', async () => {
    const user = userEvent.setup();
    renderModal();

    expect(screen.getByRole('checkbox', { name: /League vs Rangers/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Winter Friendly/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /^past$/i }));
    expect(screen.getByRole('checkbox', { name: /Winter Friendly/i })).toBeInTheDocument();
  });

  it('writes one row per line per selected event', async () => {
    const user = userEvent.setup();
    const { onBulkAddExpenses } = renderModal({ existingByEventId: {} });

    await fillFirstLine(user, 'Referee Fees', '65');
    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /add expenses/i }));

    await waitFor(() => expect(onBulkAddExpenses).toHaveBeenCalledTimes(1));
    const rows = onBulkAddExpenses.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.eventId).sort()).toEqual(['ev-1', 'ev-2']);
    // Expenses are negative and dated to the event they hang off.
    expect(rows.every((r) => r.amount === -65)).toBe(true);
    expect(rows.find((r) => r.eventId === 'ev-1').date).toBe('2026-03-14');
    expect(rows.find((r) => r.eventId === 'ev-2').date).toBe('2026-03-21');
    expect(rows.every((r) => r.cleared === false)).toBe(true);
  });

  it('skips events that already carry the same expense', async () => {
    const user = userEvent.setup();
    const { onBulkAddExpenses } = renderModal();

    await fillFirstLine(user, 'Referee Fees', '65');
    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /add expenses/i }));

    await waitFor(() => expect(onBulkAddExpenses).toHaveBeenCalledTimes(1));
    const rows = onBulkAddExpenses.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toBe('ev-1');
  });

  it('writes the duplicate anyway once the guard is turned off', async () => {
    const user = userEvent.setup();
    const { onBulkAddExpenses } = renderModal();

    await fillFirstLine(user, 'Referee Fees', '65');
    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.click(screen.getByRole('checkbox', { name: /already have an expense/i }));
    await user.click(screen.getByRole('button', { name: /add expenses/i }));

    await waitFor(() => expect(onBulkAddExpenses).toHaveBeenCalledTimes(1));
    expect(onBulkAddExpenses.mock.calls[0][0]).toHaveLength(2);
  });

  it('multiplies several lines across several events', async () => {
    const user = userEvent.setup();
    const { onBulkAddExpenses } = renderModal({ existingByEventId: {} });

    await fillFirstLine(user, 'Referee Fees', '65');
    await user.click(screen.getByRole('button', { name: /add line/i }));
    await user.type(screen.getAllByPlaceholderText(/expense description/i)[1], 'Field Rental');
    await user.type(screen.getAllByRole('spinbutton')[1], '30');
    await user.click(screen.getByRole('button', { name: /select all/i }));

    await user.click(screen.getByRole('button', { name: /add expenses/i }));

    await waitFor(() => expect(onBulkAddExpenses).toHaveBeenCalledTimes(1));
    expect(onBulkAddExpenses.mock.calls[0][0]).toHaveLength(4);
  });

  it('cannot submit without both an event and a priced line', async () => {
    const user = userEvent.setup();
    renderModal();

    const apply = screen.getByRole('button', { name: /add expenses/i });
    expect(apply).toBeDisabled();

    // A line with no amount is not an expense, so selecting events isn't enough.
    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.type(screen.getAllByPlaceholderText(/expense description/i)[0], 'Referee Fees');
    expect(apply).toBeDisabled();
  });

  it('keeps the modal open and shows the error when the batch is rejected', async () => {
    const user = userEvent.setup();
    const onBulkAddExpenses = vi.fn().mockResolvedValue({ success: false, error: 'Nope.' });
    const { onClose } = renderModal({ existingByEventId: {}, onBulkAddExpenses });

    await fillFirstLine(user, 'Referee Fees', '65');
    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /add expenses/i }));

    expect(await screen.findByText('Nope.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
