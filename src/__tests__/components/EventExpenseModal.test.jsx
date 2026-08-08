// Expenses logged against a schedule event used to be write-once: the row
// offered only "paid" and "delete", so a typo meant deleting and re-entering.
// These tests pin the edit path — same form, but it must update the existing
// transaction rather than book a second one.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { I18nProvider } from '../../i18n/I18nContext';
import EventExpenseModal from '../../components/EventExpenseModal';

const DB_EVENT = {
  id: 'ev-1',
  title: 'Spring Cup',
  eventType: 'tournament',
  eventDate: '2026-03-14T00:00:00',
  location: 'Pan American Stadium',
};

const EXPENSE = {
  id: 'tx-1',
  title: 'Tournament Registration',
  amount: -120,
  category: 'TOU',
  cleared: false,
  accountId: 'acct-1',
  teamSeasonId: 'ts-1',
  rawDate: '2026-03-10',
  date: { seconds: Math.floor(new Date('2026-03-10T12:00:00').getTime() / 1000) },
};

const ACCOUNTS = [{ id: 'acct-1', name: 'Team Checking', holding: 'bank' }];

function renderModal(props = {}) {
  const onSaveExpense = props.onSaveExpense ?? vi.fn().mockResolvedValue({ success: true });
  render(
    <I18nProvider>
      <EventExpenseModal
        show
        onClose={vi.fn()}
        dbEvent={DB_EVENT}
        linkedTransactions={[EXPENSE]}
        onSaveExpense={onSaveExpense}
        onToggleCleared={vi.fn()}
        onDeleteExpense={vi.fn()}
        seasonIds={['2025-26']}
        activeAccounts={ACCOUNTS}
        accountMap={{ 'acct-1': ACCOUNTS[0] }}
        {...props}
      />
    </I18nProvider>,
  );
  return { onSaveExpense };
}

describe('EventExpenseModal editing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prefills the form from the expense being edited', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /edit expense/i }));

    expect(screen.getByDisplayValue('Tournament Registration')).toBeInTheDocument();
    // Amount is shown positive even though the transaction is negative.
    expect(screen.getByDisplayValue('120')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-03-10')).toBeInTheDocument();
  });

  it('updates the existing transaction instead of creating a new one', async () => {
    const user = userEvent.setup();
    const { onSaveExpense } = renderModal();

    await user.click(screen.getByRole('button', { name: /edit expense/i }));

    const amount = screen.getByDisplayValue('120');
    await user.clear(amount);
    await user.type(amount, '145.50');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onSaveExpense).toHaveBeenCalledTimes(1));
    const payload = onSaveExpense.mock.calls[0][0];
    expect(payload.id).toBe('tx-1');
    expect(payload.amount).toBe(-145.5);
    expect(payload.eventId).toBe('ev-1');
    expect(payload.teamSeasonId).toBe('ts-1');
    // Paid state belongs to the row, not the form — editing must not reset it.
    expect(payload).not.toHaveProperty('cleared');
  });

  it('keeps the form open and shows the error when the save is rejected', async () => {
    const user = userEvent.setup();
    const onSaveExpense = vi.fn().mockResolvedValue({ success: false, error: 'Nope.' });
    renderModal({ onSaveExpense });

    await user.click(screen.getByRole('button', { name: /edit expense/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Nope.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tournament Registration')).toBeInTheDocument();
  });

  it('books a new expense when the form is opened from a template', async () => {
    const user = userEvent.setup();
    const { onSaveExpense } = renderModal();

    await user.click(screen.getByRole('button', { name: /check-in fees/i }));
    // The template seeds the title; only the amount is left to fill in.
    expect(screen.getByPlaceholderText(/expense description/i)).toHaveValue('Check-in Fees');
    await user.type(screen.getByRole('spinbutton'), '40');
    await user.click(screen.getByRole('button', { name: /add as draft/i }));

    await waitFor(() => expect(onSaveExpense).toHaveBeenCalledTimes(1));
    const payload = onSaveExpense.mock.calls[0][0];
    expect(payload.id).toBeUndefined();
    expect(payload.amount).toBe(-40);
    expect(payload.cleared).toBe(false);
    // New expenses default to the event's own date.
    expect(payload.date).toBe('2026-03-14');
  });

  it('hides the edit and add controls without save rights', () => {
    renderModal({ onSaveExpense: null, onDeleteExpense: null });

    expect(screen.queryByRole('button', { name: /edit expense/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete expense/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /custom/i })).toBeNull();
  });
});
