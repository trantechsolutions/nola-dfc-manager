import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n/I18nContext';
import RecordFundsModal from '../components/RecordFundsModal';

const PLAYERS = [
  { id: 'p1', firstName: 'Ana', lastName: 'Reyes' },
  { id: 'p2', firstName: 'Ben', lastName: 'Ortiz' },
];

const ACCOUNTS = [
  { id: 'acc-bank', name: 'Team Checking', holding: 'bank' },
  { id: 'acc-cash', name: 'Cash Box', holding: 'cash' },
];

const renderModal = (props = {}) => {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue({ success: true });
  const onClose = props.onClose ?? vi.fn();
  render(
    <I18nProvider>
      <RecordFundsModal
        show
        onClose={onClose}
        onSubmit={onSubmit}
        players={PLAYERS}
        activeAccounts={ACCOUNTS}
        {...props}
      />
    </I18nProvider>,
  );
  return { onSubmit, onClose };
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save to Ledger' }));

describe('RecordFundsModal', () => {
  beforeEach(async () => {
    localStorage.clear();
    const i18n = (await import('../i18n/config')).default;
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('submits a sponsorship as a cleared SPO ledger entry on the default account', async () => {
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: 'Quattro Pizza' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'SPO',
        title: 'Quattro Pizza',
        amount: 500,
        accountId: 'acc-bank',
        cleared: true,
        playerId: '',
      }),
    );
  });

  it('switches the category and label when Fundraiser is picked', async () => {
    const { onSubmit } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Fundraiser' }));
    fireEvent.change(screen.getByLabelText('Fundraiser'), { target: { value: 'Spring Car Wash' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Deposited to'), { target: { value: 'acc-cash' } });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'FUN', title: 'Spring Car Wash', amount: 300, accountId: 'acc-cash' }),
    );
  });

  it('records the player attribution', async () => {
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: 'Corner Store' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Brought in by'), { target: { value: 'p2' } });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'p2', playerName: 'Ben Ortiz' }));
  });

  it('records an unpaid pledge as uncleared', async () => {
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: 'Pledged Sponsor' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '250' } });
    fireEvent.click(screen.getByLabelText('Funds received'));
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cleared: false }));
  });

  it('rejects a zero amount without calling onSubmit', async () => {
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: 'Freebie' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } });
    submit();

    expect(await screen.findByText('Enter an amount greater than zero.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('surfaces a save failure and keeps the modal open', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'Select a team before logging a transaction.' });
    const { onClose } = renderModal({ onSubmit });

    fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: 'Quattro Pizza' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    submit();

    expect(await screen.findByText('Select a team before logging a transaction.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a successful save', async () => {
    const { onClose } = renderModal();

    fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: 'Quattro Pizza' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    submit();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
