import { buildInstallmentIndex, hasPaymentPlan, isInstallment } from './installments';

// Sponsor pipeline states, in the order a sponsor moves through them.
// `prospect` is someone worth asking; `committed` has said yes; `paid` has the
// money in the ledger; `declined` is kept on purpose so next season's manager
// doesn't re-ask a business that already said no.

export const SPONSOR_STATUSES = ['prospect', 'committed', 'paid', 'declined'];

export const SPONSOR_STATUS_COLORS = {
  prospect: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  committed: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  paid: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  declined: 'bg-muted text-muted-foreground',
};

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

// Two letters off the business name, for the placeholder tile when no logo has
// been uploaded yet.
export const sponsorInitials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || '?';

// Sponsors type a bare domain far more often than a full URL.
export const normalizeWebsite = (value = '') => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

// ── LEDGER ↔ DIRECTORY ──
// Sponsorship money is booked in the ledger long before anyone fills in a
// directory card, so the directory reads the ledger rather than starting empty.
// Only raw deposits count: waterfall credit rows are the same money landing on
// player balances, and counting them would double every sponsor's figure.

const isRawSponsorDeposit = (tx) => tx.category === 'SPO' && !tx.waterfallBatchId;

/** Loose key for "the same sponsor typed twice" — case and spacing only. */
export const ledgerSponsorKey = (title = '') => title.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Sponsorship deposits not yet attached to a directory sponsor, grouped by the
 * title they were booked under. Each group is one "add this to the directory"
 * suggestion.
 */
export const unlinkedLedgerSponsors = (transactions = []) => {
  const groups = new Map();
  transactions
    // A sponsorship being paid in instalments is suggested from the pledge it is
    // being paid against, not from each payment: the pledge carries the whole
    // figure and the sponsor's own name rather than "Payment: ...".
    .filter((tx) => isRawSponsorDeposit(tx) && !tx.sponsorId && !isInstallment(tx))
    .forEach((tx) => {
      const key = ledgerSponsorKey(tx.title);
      if (!key) return;
      const group = groups.get(key) || {
        key,
        title: (tx.title || '').trim(),
        txIds: [],
        total: 0,
        lastDate: null,
        broughtInBy: new Set(),
      };
      group.txIds.push(tx.id);
      group.total += Number(tx.amount || 0);
      const seconds = tx.date?.seconds || 0;
      if (!group.lastDate || seconds > group.lastDate) group.lastDate = seconds;
      if (tx.playerName) group.broughtInBy.add(tx.playerName);
      groups.set(key, group);
    });
  return [...groups.values()].map((g) => ({ ...g, broughtInBy: [...g.broughtInBy] })).sort((a, b) => b.total - a.total);
};

/** sponsorId -> what that sponsor has actually paid, per the ledger. */
export const ledgerTotalsBySponsor = (transactions = []) => {
  const totals = {};
  const installmentIndex = buildInstallmentIndex(transactions);
  transactions
    // A pledge being paid off in instalments is an obligation, not receipts —
    // its payments are the money, and counting both would double the sponsor.
    .filter((tx) => tx.sponsorId && !tx.waterfallBatchId && !hasPaymentPlan(tx, installmentIndex))
    .forEach((tx) => {
      const entry = (totals[tx.sponsorId] ||= { received: 0, count: 0 });
      entry.received += Number(tx.amount || 0);
      entry.count += 1;
    });
  return totals;
};
