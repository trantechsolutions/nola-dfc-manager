// isPayableAccount decides what a parent is shown as a way to pay. It guards a
// table that mixes two audiences — the team's internal ledger buckets and the
// handful of handles meant for parents — so the failure mode of a loose gate is
// publishing a bank account to every family on the roster.
import { describe, it, expect } from 'vitest';
import { isPayableAccount } from '../../utils/accounts';

const account = (overrides = {}) => ({
  id: 'a1',
  name: 'Venmo',
  handle: '@TeamVenmo',
  holding: 'digital',
  isActive: true,
  isPublic: true,
  ...overrides,
});

describe('isPayableAccount', () => {
  it('accepts an active, published account with a handle', () => {
    expect(isPayableAccount(account())).toBe(true);
  });

  it('rejects an internal account', () => {
    expect(isPayableAccount(account({ isPublic: false }))).toBe(false);
  });

  it('rejects an archived account', () => {
    expect(isPayableAccount(account({ isActive: false }))).toBe(false);
  });

  // A published account with no handle shows a parent a name and no way to act
  // on it, which reads as a broken page rather than a payment method.
  it('rejects a published account with no handle', () => {
    expect(isPayableAccount(account({ handle: '' }))).toBe(false);
    expect(isPayableAccount(account({ handle: '   ' }))).toBe(false);
    expect(isPayableAccount(account({ handle: undefined }))).toBe(false);
  });

  // Rows written before the is_public column existed come back without it.
  // Closed is the safe default — an account opts in, it is never opted in for.
  it('rejects a row with no isPublic field at all', () => {
    const { isPublic: _omitted, ...legacy } = account();
    expect(isPayableAccount(legacy)).toBe(false);
  });

  it('tolerates null and undefined', () => {
    expect(isPayableAccount(null)).toBe(false);
    expect(isPayableAccount(undefined)).toBe(false);
  });
});
