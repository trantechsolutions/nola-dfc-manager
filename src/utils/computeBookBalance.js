import { TRACKED_HOLDINGS } from './holdings';
import { txActivityDate } from './txDates';

/** Sentinel value used when the user selects "Entire season" in the book-balance picker. */
export const SEASON_KEY = 'season';

/**
 * Returns the first day of a month string in 'YYYY-MM-01' format.
 * Accepts a Date or a 'YYYY-MM' string.
 */
export function toMonthKey(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    // Already a full month key
    if (/^\d{4}-\d{2}-01$/.test(value)) return value;
    // 'YYYY-MM' short form
    if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  }
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Returns a 'YYYY-MM' display label from a monthKey ('YYYY-MM-01').
 */
export function monthKeyToLabel(monthKey) {
  if (!monthKey) return '';
  if (monthKey === SEASON_KEY) return 'Entire Season';
  const [year, month] = monthKey.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Compute the running ledger balance for a single account up to (and including)
 * the last day of `monthKey`.
 *
 * Rules:
 *  - Only tx.cleared === true counts — book balance is money on hand
 *    (funds cleared or in possession), not projected/pending items.
 *  - The month cutoff runs off the ACTIVITY date, not the event date. A
 *    tournament paid for in August is August money even though the tournament
 *    itself is dated November; the bank statement only ever saw August.
 *  - Normal tx with account_id === accountId  → add amount
 *  - TRF with transfer_to_account_id === accountId  → add amount (inflow)
 *  - TRF with transfer_from_account_id === accountId → subtract amount (outflow)
 *
 * @param {string} accountId
 * @param {string} monthKey 'YYYY-MM-01'
 * @param {Array}  transactions
 * @returns {number}
 */
export function computeLedgerBalance(accountId, monthKey, transactions) {
  if (!accountId || !transactions?.length) return 0;
  // SEASON_KEY or null monthKey = no date cutoff; include all transactions
  const cutoff =
    !monthKey || monthKey === SEASON_KEY
      ? null
      : (() => {
          const [year, month] = monthKey.split('-').map(Number);
          const lastDay = new Date(year, month, 0); // day 0 of next month = last day of this month
          return lastDay.toISOString().split('T')[0];
        })();

  let total = 0;
  for (const tx of transactions) {
    if (!tx.cleared) continue;
    const d = txActivityDate(tx);
    if (!d || (cutoff && d > cutoff)) continue;

    const isTransfer = tx.category === 'TRF';

    if (isTransfer) {
      if (tx.transferToAccountId === accountId) total += Number(tx.amount);
      if (tx.transferFromAccountId === accountId) total -= Number(tx.amount);
    } else {
      if (tx.accountId === accountId) total += Number(tx.amount);
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Build a list of past/current month keys (YYYY-MM-01) going back `count` months
 * from today, inclusive of current month, descending.
 */
export function buildMonthOptions(count = 13) {
  const now = new Date();
  const options = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(toMonthKey(d));
  }
  return options;
}

/**
 * Given loaded accounts and transactions, return per-account ledger balances
 * for a specific month, filtered to TRACKED_HOLDINGS only.
 *
 * @param {Array}  accounts
 * @param {Array}  transactions
 * @param {string} monthKey
 * @returns {Object} { [accountId]: number }
 */
export function computeAllLedgerBalances(accounts, transactions, monthKey) {
  const result = {};
  for (const account of accounts) {
    if (!TRACKED_HOLDINGS.includes(account.holding)) continue;
    result[account.id] = computeLedgerBalance(account.id, monthKey, transactions);
  }
  return result;
}

/**
 * Returns the combined ledger total across ALL bank accounts for a given month.
 * Bank accounts reconcile as a single aggregate rather than per-account.
 *
 * @param {Array}  accounts
 * @param {Array}  transactions
 * @param {string} monthKey
 * @returns {number}
 */
export function computeBankLedgerTotal(accounts, transactions, monthKey) {
  return accounts
    .filter((a) => a.holding === 'bank' && a.isActive)
    .reduce((sum, a) => sum + computeLedgerBalance(a.id, monthKey, transactions), 0);
}
