import { describe, it, expect } from 'vitest';
import { buildRefundIndex, refundableRemaining, canRefund, buildRefundTransaction } from '../../utils/refunds';

const original = {
  id: 'tx1',
  title: 'Tournament fee',
  amount: -450,
  category: 'TOU',
  accountId: 'acc1',
  playerId: 'p1',
  playerName: 'Ana Diaz',
  eventId: 'ev1',
  seasonId: '2026-spring',
  teamSeasonId: 'ts1',
};

describe('buildRefundIndex', () => {
  it('sums refunds against the transaction they reverse', () => {
    const index = buildRefundIndex([
      original,
      { id: 'r1', amount: 200, refundOfTxId: 'tx1' },
      { id: 'r2', amount: 100, refundOfTxId: 'tx1' },
      { id: 'other', amount: 50 },
    ]);
    expect(index).toEqual({ tx1: 300 });
  });
});

describe('refundableRemaining', () => {
  it('returns the full magnitude when nothing is refunded', () => {
    expect(refundableRemaining(original, {})).toBe(450);
  });

  it('subtracts what has already been refunded', () => {
    expect(refundableRemaining(original, { tx1: 300 })).toBe(150);
  });

  it('never goes negative and rounds away float noise', () => {
    expect(refundableRemaining({ id: 'tx1', amount: -0.3 }, { tx1: 0.1 + 0.2 })).toBe(0);
  });
});

describe('canRefund', () => {
  it('allows a normal transaction with outstanding value', () => {
    expect(canRefund(original, {})).toBe(true);
  });

  it('blocks transfers, refunds themselves, and fully refunded rows', () => {
    expect(canRefund({ ...original, category: 'TRF' }, {})).toBe(false);
    expect(canRefund({ ...original, refundOfTxId: 'tx0' }, {})).toBe(false);
    expect(canRefund(original, { tx1: 450 })).toBe(false);
  });
});

describe('buildRefundTransaction', () => {
  it('reverses the sign of an expense and carries the original scope', () => {
    const refund = buildRefundTransaction(original, { amount: 450, date: '2026-03-09' });
    expect(refund.amount).toBe(450);
    expect(refund.refundOfTxId).toBe('tx1');
    expect(refund.category).toBe('TOU');
    expect(refund.accountId).toBe('acc1');
    expect(refund.playerId).toBe('p1');
    expect(refund.eventId).toBe('ev1');
    expect(refund.teamSeasonId).toBe('ts1');
    expect(refund.title).toBe('Refund: Tournament fee');
  });

  it('reverses the sign of income', () => {
    const refund = buildRefundTransaction({ ...original, amount: 450 }, { amount: 200, date: '2026-03-09' });
    expect(refund.amount).toBe(-200);
  });

  it('ignores a sign the caller passes on the amount', () => {
    expect(buildRefundTransaction(original, { amount: -450, date: '2026-03-09' }).amount).toBe(450);
  });
});
