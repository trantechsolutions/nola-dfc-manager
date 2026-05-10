import { describe, it, expect } from 'vitest';
import { parseStatementCSV, compareStatement } from '../../utils/parseStatement';

// ── parseStatementCSV ──────────────────────────────────────────────────────────
describe('parseStatementCSV', () => {
  it('parses Format A (Date, Description, Amount)', () => {
    const csv = `Date,Description,Amount
2025-03-01,Team Fees,250.00
2025-03-15,Referee Payment,-75.00`;
    const rows = parseStatementCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2025-03-01', description: 'Team Fees', amount: 250 });
    expect(rows[1]).toMatchObject({ date: '2025-03-15', amount: -75 });
  });

  it('parses Format B (Date, Description, Debit, Credit)', () => {
    const csv = `Date,Description,Debit,Credit
2025-03-05,Field Rental,120.00,
2025-03-10,Tournament Entry,,300.00`;
    const rows = parseStatementCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(-120); // debit = negative
    expect(rows[1].amount).toBe(300); // credit = positive
  });

  it('parses MM/DD/YYYY date format', () => {
    const csv = `Date,Description,Amount\n03/15/2025,Sponsorship,500.00`;
    const rows = parseStatementCSV(csv);
    expect(rows[0].date).toBe('2025-03-15');
  });

  it('handles quoted fields with commas inside', () => {
    const csv = `Date,Description,Amount\n2025-03-01,"Smith, John - Fee",100.00`;
    const rows = parseStatementCSV(csv);
    expect(rows[0].description).toBe('Smith, John - Fee');
  });

  it('skips empty rows', () => {
    const csv = `Date,Description,Amount\n\n2025-03-01,Fee,100\n\n`;
    const rows = parseStatementCSV(csv);
    expect(rows).toHaveLength(1);
  });

  it('returns empty array for CSV with fewer than 2 lines', () => {
    expect(parseStatementCSV('')).toEqual([]);
    expect(parseStatementCSV('Date,Description,Amount')).toEqual([]);
  });

  it('parses minimal 2-column format (Date, Amount) with no description', () => {
    const csv = `2025-03-01,250.00\n2025-03-15,-75.00`;
    const rows = parseStatementCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2025-03-01', amount: 250, description: '' });
    expect(rows[1]).toMatchObject({ date: '2025-03-15', amount: -75, description: '' });
  });

  it('parses minimal format with MM/DD/YYYY dates', () => {
    const csv = `03/01/2025,100.00\n03/15/2025,-50.00`;
    const rows = parseStatementCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2025-03-01');
    expect(rows[0].amount).toBe(100);
  });

  it('strips currency symbols from amounts', () => {
    const csv = `Date,Description,Amount\n2025-03-01,Fee,$250.00`;
    const rows = parseStatementCSV(csv);
    expect(rows[0].amount).toBe(250);
  });
});

// ── compareStatement ───────────────────────────────────────────────────────────
describe('compareStatement', () => {
  const MONTH = '2025-03-01';

  const makeAppTxs = (overrides = []) =>
    overrides.map((o, i) => ({
      id: `tx-${i}`,
      title: o.title || 'Transaction',
      amount: o.amount,
      accountId: 'acct-1',
      rawDate: o.date || '2025-03-15',
      date: null,
      category: 'INC',
      transferFromAccountId: null,
      transferToAccountId: null,
    }));

  it('matches identical amount rows', () => {
    const stmt = [{ date: '2025-03-10', description: 'Team Fees', amount: 250, raw: '' }];
    const app = makeAppTxs([{ amount: 250, date: '2025-03-10' }]);
    const { matched, statementOnly, appOnly } = compareStatement(stmt, app, MONTH);
    expect(matched).toHaveLength(1);
    expect(statementOnly).toHaveLength(0);
    expect(appOnly).toHaveLength(0);
  });

  it('puts unmatched statement rows in statementOnly', () => {
    const stmt = [{ date: '2025-03-05', description: 'Mystery', amount: 99, raw: '' }];
    // App tx on same date but different amount — both sides should be unmatched
    const app = makeAppTxs([{ amount: 250, date: '2025-03-05' }]);
    const { statementOnly, appOnly } = compareStatement(stmt, app, MONTH);
    expect(statementOnly).toHaveLength(1);
    expect(appOnly).toHaveLength(1);
  });

  it('puts unmatched app rows in appOnly', () => {
    const stmt = [];
    const app = makeAppTxs([{ amount: 50 }]);
    const { appOnly } = compareStatement(stmt, app, MONTH);
    expect(appOnly).toHaveLength(1);
  });

  it('includes all statement rows regardless of month (whole-file comparison)', () => {
    const stmt = [
      { date: '2025-02-28', description: 'Prior month', amount: 100, raw: '' },
      { date: '2025-03-01', description: 'This month', amount: 200, raw: '' },
    ];
    // App tx within statement date range (Feb 28 – Mar 1)
    const app = makeAppTxs([{ amount: 200, date: '2025-03-01' }]);
    const { matched, statementOnly } = compareStatement(stmt, app, MONTH);
    // Both stmt rows are considered; Mar 1 matches, Feb 28 has no app counterpart
    expect(matched).toHaveLength(1);
    expect(statementOnly).toHaveLength(1);
    expect(statementOnly[0].date).toBe('2025-02-28');
  });

  it('excludes app transactions outside the statement date range from appOnly', () => {
    const stmt = [{ date: '2025-03-10', description: 'A', amount: 50, raw: '' }];
    // One app tx inside range, one well outside (June — far outside Mar 10 window)
    const app = makeAppTxs([
      { amount: 50, date: '2025-03-10' },
      { amount: 999, date: '2025-06-01' },
    ]);
    const { matched, appOnly } = compareStatement(stmt, app, MONTH);
    expect(matched).toHaveLength(1);
    // June tx is outside statement range (Mar 10 – Mar 10) so not shown as appOnly
    expect(appOnly).toHaveLength(0);
  });

  it('season mode: matches across months when all txs are passed unfiltered', () => {
    // Statement spans two months — app txs passed without pre-filtering (season mode)
    const stmt = [
      { date: '2025-01-15', description: '', amount: 100, raw: '' },
      { date: '2025-03-10', description: '', amount: 200, raw: '' },
    ];
    const app = makeAppTxs([
      { amount: 100, date: '2025-01-15' },
      { amount: 200, date: '2025-03-10' },
    ]);
    const { matched, statementOnly, appOnly } = compareStatement(stmt, app, MONTH);
    expect(matched).toHaveLength(2);
    expect(statementOnly).toHaveLength(0);
    expect(appOnly).toHaveLength(0);
  });

  it('does not double-match two app rows with the same amount', () => {
    const stmt = [{ date: '2025-03-01', description: 'A', amount: 100, raw: '' }];
    const app = makeAppTxs([
      { amount: 100, date: '2025-03-01' },
      { amount: 100, date: '2025-03-05' },
    ]);
    const { matched, appOnly } = compareStatement(stmt, app, MONTH);
    expect(matched).toHaveLength(1);
    expect(appOnly).toHaveLength(1);
  });
});
