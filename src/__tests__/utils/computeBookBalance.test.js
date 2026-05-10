import { describe, it, expect } from 'vitest';
import {
  toMonthKey,
  monthKeyToLabel,
  computeLedgerBalance,
  computeAllLedgerBalances,
  computeBankLedgerTotal,
  buildMonthOptions,
  SEASON_KEY,
} from '../../utils/computeBookBalance';

// ── toMonthKey ─────────────────────────────────────────────────────────────────
describe('toMonthKey', () => {
  it('converts YYYY-MM string to YYYY-MM-01', () => {
    expect(toMonthKey('2025-03')).toBe('2025-03-01');
  });

  it('converts a Date to YYYY-MM-01', () => {
    expect(toMonthKey(new Date(2025, 2, 15))).toBe('2025-03-01');
  });

  it('passes through an already-normalized key', () => {
    expect(toMonthKey('2025-03-01')).toBe('2025-03-01');
  });

  it('returns null for falsy input', () => {
    expect(toMonthKey(null)).toBeNull();
    expect(toMonthKey('')).toBeNull();
  });
});

// ── monthKeyToLabel ────────────────────────────────────────────────────────────
describe('monthKeyToLabel', () => {
  it('returns human-readable month label', () => {
    const label = monthKeyToLabel('2025-03-01');
    expect(label).toMatch(/March/);
    expect(label).toMatch(/2025/);
  });

  it('returns empty string for falsy input', () => {
    expect(monthKeyToLabel('')).toBe('');
    expect(monthKeyToLabel(null)).toBe('');
  });

  it('returns "Entire Season" for SEASON_KEY', () => {
    expect(monthKeyToLabel(SEASON_KEY)).toBe('Entire Season');
  });
});

// ── computeLedgerBalance ───────────────────────────────────────────────────────
describe('computeLedgerBalance', () => {
  const ACCOUNT_A = 'acct-a';
  const ACCOUNT_B = 'acct-b';
  const MONTH = '2025-03-01';

  const tx = (overrides) => ({
    id: Math.random().toString(),
    category: 'INC',
    amount: 0,
    accountId: null,
    transferToAccountId: null,
    transferFromAccountId: null,
    rawDate: '2025-03-15',
    date: null,
    ...overrides,
  });

  it('returns 0 when no transactions', () => {
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, [])).toBe(0);
  });

  it('sums income transactions for the account', () => {
    const txs = [
      tx({ accountId: ACCOUNT_A, amount: 100, rawDate: '2025-03-01' }),
      tx({ accountId: ACCOUNT_A, amount: 50, rawDate: '2025-03-31' }),
    ];
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(150);
  });

  it('excludes transactions after month cutoff', () => {
    const txs = [
      tx({ accountId: ACCOUNT_A, amount: 100, rawDate: '2025-03-31' }),
      tx({ accountId: ACCOUNT_A, amount: 999, rawDate: '2025-04-01' }),
    ];
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(100);
  });

  it('excludes transactions from a different account', () => {
    const txs = [
      tx({ accountId: ACCOUNT_A, amount: 100, rawDate: '2025-03-10' }),
      tx({ accountId: ACCOUNT_B, amount: 999, rawDate: '2025-03-10' }),
    ];
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(100);
  });

  it('accumulates across prior months (running total)', () => {
    const txs = [
      tx({ accountId: ACCOUNT_A, amount: 200, rawDate: '2025-01-15' }),
      tx({ accountId: ACCOUNT_A, amount: 100, rawDate: '2025-03-10' }),
    ];
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(300);
  });

  it('handles transfer inflows (transfer_to)', () => {
    const txs = [tx({ category: 'TRF', transferToAccountId: ACCOUNT_A, amount: 75, rawDate: '2025-03-05' })];
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(75);
  });

  it('handles transfer outflows (transfer_from)', () => {
    const txs = [
      tx({ accountId: ACCOUNT_A, amount: 200, rawDate: '2025-02-01' }),
      tx({ category: 'TRF', transferFromAccountId: ACCOUNT_A, amount: 50, rawDate: '2025-03-05' }),
    ];
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(150);
  });

  it('does not count a TRF row as a normal tx for the account', () => {
    // A TRF tx with accountId set should NOT double-count
    const txs = [
      tx({
        category: 'TRF',
        accountId: ACCOUNT_A,
        transferFromAccountId: ACCOUNT_A,
        transferToAccountId: ACCOUNT_B,
        amount: 50,
        rawDate: '2025-03-05',
      }),
    ];
    // Should be -50 (outflow), not 0 or -100
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(-50);
  });

  it('handles legacy timestamp-object dates', () => {
    const seconds = Math.floor(new Date('2025-03-10T12:00:00Z').getTime() / 1000);
    const txs = [tx({ accountId: ACCOUNT_A, amount: 42, rawDate: null, date: { seconds } })];
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(42);
  });

  it('includes all transactions when SEASON_KEY is passed (no date cutoff)', () => {
    const txs = [
      tx({ accountId: ACCOUNT_A, amount: 100, rawDate: '2024-06-01' }),
      tx({ accountId: ACCOUNT_A, amount: 200, rawDate: '2025-01-15' }),
      tx({ accountId: ACCOUNT_A, amount: 50, rawDate: '2025-12-31' }),
    ];
    expect(computeLedgerBalance(ACCOUNT_A, SEASON_KEY, txs)).toBe(350);
  });

  it('handles negative amounts (expenses)', () => {
    const txs = [
      tx({ accountId: ACCOUNT_A, amount: 200, rawDate: '2025-01-01' }),
      tx({ accountId: ACCOUNT_A, amount: -80, rawDate: '2025-03-10' }),
    ];
    expect(computeLedgerBalance(ACCOUNT_A, MONTH, txs)).toBe(120);
  });
});

// ── computeAllLedgerBalances ───────────────────────────────────────────────────
describe('computeAllLedgerBalances', () => {
  it('only includes TRACKED_HOLDINGS accounts', () => {
    const accounts = [
      { id: 'a1', holding: 'bank' },
      { id: 'a2', holding: 'digital' },
      { id: 'a3', holding: 'cash' },
      { id: 'a4', holding: 'none' }, // excluded
    ];
    const result = computeAllLedgerBalances(accounts, [], '2025-03-01');
    expect(Object.keys(result)).toEqual(['a1', 'a2', 'a3']);
    expect('a4' in result).toBe(false);
  });

  it('returns correct balances per account', () => {
    const accounts = [
      { id: 'a1', holding: 'bank' },
      { id: 'a2', holding: 'digital' },
    ];
    const transactions = [
      { id: 't1', category: 'INC', accountId: 'a1', amount: 100, rawDate: '2025-03-01', date: null },
      { id: 't2', category: 'EXP', accountId: 'a2', amount: -40, rawDate: '2025-03-05', date: null },
    ];
    const result = computeAllLedgerBalances(accounts, transactions, '2025-03-01');
    expect(result['a1']).toBe(100);
    expect(result['a2']).toBe(-40);
  });
});

// ── computeBankLedgerTotal ─────────────────────────────────────────────────────
describe('computeBankLedgerTotal', () => {
  const MONTH = '2025-03-01';

  const tx = (overrides) => ({
    id: Math.random().toString(),
    category: 'INC',
    amount: 0,
    accountId: null,
    transferToAccountId: null,
    transferFromAccountId: null,
    rawDate: '2025-03-15',
    date: null,
    ...overrides,
  });

  it('returns 0 when no bank accounts', () => {
    const accounts = [{ id: 'a1', holding: 'digital', isActive: true }];
    expect(computeBankLedgerTotal(accounts, [], MONTH)).toBe(0);
  });

  it('sums across all active bank accounts', () => {
    const accounts = [
      { id: 'b1', holding: 'bank', isActive: true },
      { id: 'b2', holding: 'bank', isActive: true },
      { id: 'd1', holding: 'digital', isActive: true },
    ];
    const transactions = [
      tx({ accountId: 'b1', amount: 100 }),
      tx({ accountId: 'b2', amount: 200 }),
      tx({ accountId: 'd1', amount: 999 }),
    ];
    expect(computeBankLedgerTotal(accounts, transactions, MONTH)).toBe(300);
  });

  it('excludes inactive bank accounts', () => {
    const accounts = [
      { id: 'b1', holding: 'bank', isActive: true },
      { id: 'b2', holding: 'bank', isActive: false },
    ];
    const transactions = [tx({ accountId: 'b1', amount: 100 }), tx({ accountId: 'b2', amount: 200 })];
    expect(computeBankLedgerTotal(accounts, transactions, MONTH)).toBe(100);
  });

  it('correctly handles transfers between bank accounts without double-counting', () => {
    const accounts = [
      { id: 'b1', holding: 'bank', isActive: true },
      { id: 'b2', holding: 'bank', isActive: true },
    ];
    // Deposit 500 into b1; transfer 100 from b1 to b2 — net total stays 500
    const transactions = [
      tx({ accountId: 'b1', amount: 500 }),
      tx({ category: 'TRF', transferFromAccountId: 'b1', transferToAccountId: 'b2', amount: 100 }),
    ];
    // b1 = 500 - 100 = 400; b2 = 0 + 100 = 100; total = 500
    expect(computeBankLedgerTotal(accounts, transactions, MONTH)).toBe(500);
  });
});

// ── buildMonthOptions ──────────────────────────────────────────────────────────
describe('buildMonthOptions', () => {
  it('returns count items', () => {
    expect(buildMonthOptions(6)).toHaveLength(6);
  });

  it('all entries match YYYY-MM-01 pattern', () => {
    buildMonthOptions(13).forEach((key) => {
      expect(key).toMatch(/^\d{4}-\d{2}-01$/);
    });
  });

  it('first entry is the current month', () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    expect(buildMonthOptions(1)[0]).toBe(`${y}-${m}-01`);
  });

  it('entries are in descending order', () => {
    const opts = buildMonthOptions(6);
    for (let i = 0; i < opts.length - 1; i++) {
      expect(opts[i] > opts[i + 1]).toBe(true);
    }
  });
});
