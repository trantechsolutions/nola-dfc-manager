import { describe, it, expect } from 'vitest';
import { unlinkedLedgerSponsors, ledgerTotalsBySponsor, sponsorInitials, normalizeWebsite } from '../../utils/sponsors';

const tx = (over = {}) => ({
  id: crypto.randomUUID(),
  category: 'SPO',
  title: 'Quattro Pizza',
  amount: 250,
  date: { seconds: 1700000000 },
  sponsorId: null,
  waterfallBatchId: null,
  ...over,
});

describe('unlinkedLedgerSponsors', () => {
  it('groups deposits typed with different casing or spacing under one suggestion', () => {
    const groups = unlinkedLedgerSponsors([
      tx({ title: 'Quattro Pizza', amount: 250 }),
      tx({ title: 'quattro  pizza', amount: 100 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(350);
    expect(groups[0].txIds).toHaveLength(2);
  });

  it('ignores deposits already attached to a sponsor', () => {
    const groups = unlinkedLedgerSponsors([tx({ sponsorId: 'sponsor-1' }), tx({ title: 'Corner Store' })]);
    expect(groups.map((g) => g.title)).toEqual(['Corner Store']);
  });

  it('leaves out waterfall credits and non-sponsorship categories', () => {
    const groups = unlinkedLedgerSponsors([
      tx({ waterfallBatchId: 'batch-1' }),
      tx({ category: 'FUN', title: 'Car Wash' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('collects who brought each sponsorship in', () => {
    const [group] = unlinkedLedgerSponsors([
      tx({ playerName: 'Ana Cruz' }),
      tx({ playerName: 'Ana Cruz' }),
      tx({ playerName: 'Bo Diaz' }),
    ]);
    expect(group.broughtInBy.sort()).toEqual(['Ana Cruz', 'Bo Diaz']);
  });

  it('ranks the biggest sponsor first', () => {
    const groups = unlinkedLedgerSponsors([
      tx({ title: 'Small Shop', amount: 50 }),
      tx({ title: 'Big Bank', amount: 900 }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['Big Bank', 'Small Shop']);
  });
});

describe('ledgerTotalsBySponsor', () => {
  it('sums linked deposits per sponsor and counts the entries', () => {
    const totals = ledgerTotalsBySponsor([
      tx({ sponsorId: 's1', amount: 250 }),
      tx({ sponsorId: 's1', amount: 150 }),
      tx({ sponsorId: 's2', amount: 75 }),
      tx({ sponsorId: null, amount: 999 }),
    ]);
    expect(totals.s1).toEqual({ received: 400, count: 2 });
    expect(totals.s2).toEqual({ received: 75, count: 1 });
  });

  it('excludes waterfall credit rows so distributed money is not counted twice', () => {
    const totals = ledgerTotalsBySponsor([
      tx({ sponsorId: 's1', amount: 300 }),
      tx({ sponsorId: 's1', amount: 300, waterfallBatchId: 'batch-1' }),
    ]);
    expect(totals.s1.received).toBe(300);
  });

  it('lets a refund reduce what a sponsor is shown as having paid', () => {
    const totals = ledgerTotalsBySponsor([
      tx({ sponsorId: 's1', amount: 500 }),
      tx({ sponsorId: 's1', amount: -100, refundOfTxId: 'x' }),
    ]);
    expect(totals.s1.received).toBe(400);
  });
});

describe('display helpers', () => {
  it('builds initials from the first two words', () => {
    expect(sponsorInitials('Quattro Pizza Kitchen')).toBe('QP');
    expect(sponsorInitials('')).toBe('?');
  });

  it('assumes https for a bare domain but leaves a full URL alone', () => {
    expect(normalizeWebsite('example.com')).toBe('https://example.com');
    expect(normalizeWebsite('http://example.com')).toBe('http://example.com');
    expect(normalizeWebsite('  ')).toBe('');
  });
});
