// The modal is reused for every ledger row, so its form state has to be fully
// replaced each time it opens. A transaction with no player comes back with
// player_id null; spread straight into state that made the <select> value null,
// which React treats as uncontrolled — the node then kept whatever it was
// showing for the PREVIOUS transaction, so a general expense appeared linked to
// the last player anyone had opened. These tests pin the reset.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { I18nProvider } from '../../i18n/I18nContext';
import TransactionModal from '../../components/TransactionModal';

const PLAYERS = [
  { id: 'p1', firstName: 'Ana', lastName: 'Ruiz' },
  { id: 'p2', firstName: 'Beto', lastName: 'Cruz' },
];

const ACCOUNTS = [{ id: 'a1', name: 'Operating', holding: 'bank' }];

const linked = {
  id: 'tx-1',
  title: 'Ana registration',
  amount: 250,
  date: '2026-03-01',
  category: 'TMF',
  accountId: 'a1',
  playerId: 'p1',
  playerName: 'Ana Ruiz',
  cleared: true,
};

// What the ledger actually hands back for a general expense.
const general = {
  id: 'tx-2',
  title: 'Field rental',
  amount: -80,
  date: '2026-03-02',
  category: 'OPE',
  accountId: 'a1',
  playerId: null,
  playerName: null,
  cleared: null,
};

const renderModal = (initialData) =>
  render(
    <I18nProvider>
      <TransactionModal
        show
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        initialData={initialData}
        isSubmitting={false}
        players={PLAYERS}
        activeAccounts={ACCOUNTS}
      />
    </I18nProvider>,
  );

const playerSelect = () => screen.getByLabelText(/link to player account/i);

describe('TransactionModal player link', () => {
  it('shows the linked player when editing a linked transaction', () => {
    renderModal(linked);
    expect(playerSelect()).toHaveValue('p1');
  });

  it('falls back to general expense when the transaction has no player', () => {
    renderModal(general);
    expect(playerSelect()).toHaveValue('');
  });

  it('does not carry the previous row player over to a general expense', () => {
    const { rerender } = renderModal(linked);
    expect(playerSelect()).toHaveValue('p1');

    rerender(
      <I18nProvider>
        <TransactionModal
          show
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          initialData={general}
          isSubmitting={false}
          players={PLAYERS}
          activeAccounts={ACCOUNTS}
        />
      </I18nProvider>,
    );

    expect(playerSelect()).toHaveValue('');
  });

  it('clears the form entirely for a brand new transaction', () => {
    const { rerender } = renderModal(linked);

    rerender(
      <I18nProvider>
        <TransactionModal
          show
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          initialData={null}
          isSubmitting={false}
          players={PLAYERS}
          activeAccounts={ACCOUNTS}
        />
      </I18nProvider>,
    );

    expect(playerSelect()).toHaveValue('');
  });
});
