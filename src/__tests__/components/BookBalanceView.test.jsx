// showConfirm resolves to the user's answer and takes no callback argument (see
// useModalState). These handlers passed one, so the dialog opened, Proceed
// resolved a promise nobody awaited, and the month never locked or unlocked.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The view opens its panels through the URL now (usePanelRoute), so it needs a
// router around it the same way the app supplies one.
import { MemoryRouter } from 'react-router-dom';

import { I18nProvider } from '../../i18n/I18nContext';
import BookBalanceView from '../../views/team/BookBalanceView';

const lockMonth = vi.fn().mockResolvedValue(undefined);
const unlockMonth = vi.fn().mockResolvedValue(undefined);

// The Lock button is disabled with zero reconcilable accounts, and Unlock only
// renders for a super admin — both must be satisfied for the buttons to exist.
const ACCOUNTS = [{ id: 'a1', name: 'Cash Box', holding: 'cash', isActive: true }];

function renderView({ showConfirm, isMonthLocked = false }) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <BookBalanceView
          monthOptions={[{ key: '2025-09', label: 'September 2025' }]}
          selectedMonth="2025-09"
          setSelectedMonth={vi.fn()}
          ledgerBalances={{ a1: 0 }}
          storedByAccount={{}}
          isMonthLocked={isMonthLocked}
          loading={false}
          isSaving={false}
          saveBalance={vi.fn()}
          lockMonth={lockMonth}
          unlockMonth={unlockMonth}
          accounts={ACCOUNTS}
          transactions={[]}
          isSuperAdmin
          formatMoney={(n) => `$${Number(n || 0).toFixed(2)}`}
          showConfirm={showConfirm}
        />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('BookBalanceView month lock', () => {
  beforeEach(() => {
    lockMonth.mockClear();
    unlockMonth.mockClear();
  });

  it('locks the month when the confirm dialog resolves true', async () => {
    const user = userEvent.setup();
    const showConfirm = vi.fn().mockResolvedValue(true);
    renderView({ showConfirm });

    await user.click(screen.getByRole('button', { name: /lock month/i }));

    // One argument only — a second callback argument would be dropped silently.
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(showConfirm.mock.calls[0]).toHaveLength(1);
    await waitFor(() => expect(lockMonth).toHaveBeenCalled());
  });

  it('does not lock when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    const showConfirm = vi.fn().mockResolvedValue(false);
    renderView({ showConfirm });

    await user.click(screen.getByRole('button', { name: /lock month/i }));

    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(lockMonth).not.toHaveBeenCalled();
  });

  it('unlocks a locked month when confirmed', async () => {
    const user = userEvent.setup();
    const showConfirm = vi.fn().mockResolvedValue(true);
    renderView({ showConfirm, isMonthLocked: true });

    await user.click(screen.getByRole('button', { name: /unlock month/i }));

    await waitFor(() => expect(unlockMonth).toHaveBeenCalled());
    expect(lockMonth).not.toHaveBeenCalled();
  });
});
