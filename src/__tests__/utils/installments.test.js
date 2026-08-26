// A payment plan splits one obligation into pieces without letting the same
// money be counted twice. These pin the rules the ledger and the payment dialog
// both read: what is still owed, what may be paid off, and which side of the
// ledger a payment lands on.
import { describe, it, expect } from 'vitest';
import {
  buildInstallmentIndex,
  buildInstallmentTransaction,
  blocksRefund,
  canRecordPayment,
  hasPaymentPlan,
  isInstallment,
  outstandingOn,
  paidTowards,
  planProgress,
} from '../../utils/installments';

const FEE = {
  id: 'tx1',
  title: 'Spring team fee — Smith',
  amount: 500,
  category: 'TMF',
  accountId: 'acc-checking',
  playerId: 'p1',
  playerName: 'Ana Smith',
  seasonId: '2026',
  teamSeasonId: 'ts1',
  cleared: false,
};

const INVOICE = { ...FEE, id: 'tx2', title: 'Tournament invoice', amount: -1200, category: 'TOU', playerId: '' };

const payment = (over = {}) => ({
  id: 'p-1',
  amount: 100,
  installmentOfTxId: 'tx1',
  cleared: true,
  ...over,
});

describe('buildInstallmentIndex', () => {
  it('totals payments per obligation as a positive magnitude', () => {
    const index = buildInstallmentIndex([FEE, payment(), payment({ id: 'p-2', amount: 150 })]);
    expect(index).toEqual({ tx1: 250 });
  });

  it('counts a payment that has not cleared yet', () => {
    // A cheque in hand is progress on the plan. Ignoring it would invite the
    // treasurer to collect the same instalment twice.
    const index = buildInstallmentIndex([FEE, payment({ cleared: false })]);
    expect(index.tx1).toBe(100);
  });

  it('sums an expense plan on magnitude, not sign', () => {
    const index = buildInstallmentIndex([INVOICE, payment({ amount: -400, installmentOfTxId: 'tx2' })]);
    expect(index.tx2).toBe(400);
  });

  it('ignores rows that are not payments', () => {
    expect(buildInstallmentIndex([FEE, { id: 'r1', amount: -50, refundOfTxId: 'tx1' }])).toEqual({});
  });
});

describe('what is still owed', () => {
  it('reports paid, remaining and completion together', () => {
    const index = buildInstallmentIndex([FEE, payment(), payment({ id: 'p-2', amount: 150 })]);
    expect(planProgress(FEE, index)).toEqual({ total: 500, paid: 250, remaining: 250, complete: false });
  });

  it('closes out exactly when the last payment lands', () => {
    const index = buildInstallmentIndex([FEE, payment({ amount: 500 })]);
    expect(planProgress(FEE, index)).toEqual({ total: 500, paid: 500, remaining: 0, complete: true });
  });

  it('does not leave a phantom cent open after repeated partials', () => {
    const thirds = [payment({ id: 'a', amount: 166.67 }), payment({ id: 'b', amount: 166.67 })];
    const index = buildInstallmentIndex([FEE, ...thirds, payment({ id: 'c', amount: 166.66 })]);
    expect(outstandingOn({ ...FEE, amount: 500 }, index)).toBe(0);
  });

  it('never reports a negative balance', () => {
    const index = buildInstallmentIndex([FEE, payment({ amount: 900 })]);
    expect(outstandingOn(FEE, index)).toBe(0);
  });

  it('reads an untouched obligation as fully owed', () => {
    expect(paidTowards(FEE, {})).toBe(0);
    expect(outstandingOn(FEE, {})).toBe(500);
    expect(hasPaymentPlan(FEE, {})).toBe(false);
  });
});

describe('canRecordPayment', () => {
  it('allows a payment against a pending obligation', () => {
    expect(canRecordPayment(FEE, {})).toBe(true);
    expect(canRecordPayment(INVOICE, {})).toBe(true);
  });

  it('refuses once the balance is settled', () => {
    const index = buildInstallmentIndex([FEE, payment({ amount: 500 })]);
    expect(canRecordPayment(FEE, index)).toBe(false);
  });

  it('refuses on a cleared row — that money is already in the account', () => {
    expect(canRecordPayment({ ...FEE, cleared: true }, {})).toBe(false);
  });

  it('refuses on transfers, refunds, payments and distribution rows', () => {
    expect(canRecordPayment({ ...FEE, category: 'TRF' }, {})).toBe(false);
    expect(canRecordPayment({ ...FEE, refundOfTxId: 'tx9' }, {})).toBe(false);
    expect(canRecordPayment({ ...FEE, installmentOfTxId: 'tx9' }, {})).toBe(false);
    expect(canRecordPayment({ ...FEE, waterfallBatchId: 'batch-1' }, {})).toBe(false);
  });

  it('refuses on a zero-amount row', () => {
    expect(canRecordPayment({ ...FEE, amount: 0 }, {})).toBe(false);
  });
});

describe('blocksRefund', () => {
  it('blocks refunding an obligation that has payments against it', () => {
    // The obligation is not money that changed hands — the payments are. There
    // is nothing on it to give back.
    const index = buildInstallmentIndex([FEE, payment()]);
    expect(blocksRefund(FEE, index)).toBe(true);
  });

  it('leaves an ordinary row refundable', () => {
    expect(blocksRefund(FEE, {})).toBe(false);
  });
});

describe('buildInstallmentTransaction', () => {
  it('keeps a payment on the same side of the ledger as what it pays off', () => {
    expect(buildInstallmentTransaction(FEE, { amount: 100, date: '2026-09-05' }).amount).toBe(100);
    expect(buildInstallmentTransaction(INVOICE, { amount: 400, date: '2026-09-05' }).amount).toBe(-400);
  });

  it('inherits the categorisation of the obligation so every total lands right', () => {
    const row = buildInstallmentTransaction(FEE, { amount: 100, date: '2026-09-05' });
    expect(row).toMatchObject({
      category: 'TMF',
      playerId: 'p1',
      playerName: 'Ana Smith',
      seasonId: '2026',
      teamSeasonId: 'ts1',
      accountId: 'acc-checking',
      installmentOfTxId: 'tx1',
    });
    expect(row.title).toBe('Payment: Spring team fee — Smith');
  });

  it('lets each payment land in its own account', () => {
    const row = buildInstallmentTransaction(FEE, { amount: 100, date: '2026-09-05', accountId: 'acc-cash' });
    expect(row.accountId).toBe('acc-cash');
  });

  it('stamps the activity date from the payment date when it has cleared', () => {
    expect(buildInstallmentTransaction(FEE, { amount: 100, date: '2026-09-05' }).clearedDate).toBe('2026-09-05');
  });

  it('carries no activity date while the payment is still pending', () => {
    const row = buildInstallmentTransaction(FEE, { amount: 100, date: '2026-09-05', cleared: false });
    expect(row.cleared).toBe(false);
    expect(row.clearedDate).toBeNull();
  });

  it('reads a payment row back as one', () => {
    const row = buildInstallmentTransaction(FEE, { amount: 100, date: '2026-09-05' });
    expect(isInstallment(row)).toBe(true);
    expect(isInstallment(FEE)).toBe(false);
  });
});
