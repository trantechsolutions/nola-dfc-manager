// Payment plans — a ledger item settled in pieces, so a family that cannot pay
// a season fee in one go still has an honest row on the books.
//
// The item carries the full amount and stays PENDING: it is what is owed, not
// money in hand. Each payment is its own real transaction linked back to it
// (`installmentOfTxId`), carrying the SAME sign — paying off a $500 fee adds
// +$100 of income, paying off a $1,200 invoice adds -$400 of expense.
//
// Keeping the payments real is what makes the plan honest everywhere else.
// Book balance, the `player_financials` view and statement reconciliation all
// count cleared rows only, so a family's $100 lands in the month it arrived and
// against their balance, while the unpaid $400 never pretends to be cash.
//
// The corollary is a rule the UI has to hold up: a plan's parent row must never
// be marked cleared. Clearing it would count the whole obligation a second time
// on top of the payments already recorded against it.
//
// These helpers are the only place that reads the link, so the ledger, the
// payment dialog and the ledger manager all agree on what is still owed.

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Map of parentTxId -> total already paid against it, as a positive magnitude.
 *
 * Counts every payment, cleared or not: a cheque in hand is progress on the
 * plan even before it lands, and a plan that ignored uncleared payments would
 * invite the treasurer to collect the same instalment twice.
 */
export const buildInstallmentIndex = (transactions = []) => {
  const index = {};
  transactions.forEach((tx) => {
    if (!tx.installmentOfTxId) return;
    index[tx.installmentOfTxId] = (index[tx.installmentOfTxId] || 0) + Math.abs(Number(tx.amount) || 0);
  });
  return index;
};

/** True when tx is itself a payment towards something else. */
export const isInstallment = (tx) => Boolean(tx?.installmentOfTxId);

/** True when tx has payments recorded against it — i.e. it is a plan. */
export const hasPaymentPlan = (tx, installmentIndex = {}) => (installmentIndex[tx?.id] || 0) > 0;

/** Positive magnitude already paid towards tx. */
export const paidTowards = (tx, installmentIndex = {}) => round2(installmentIndex[tx?.id] || 0);

/** Positive magnitude still owed on tx. */
export const outstandingOn = (tx, installmentIndex = {}) => {
  const total = Math.abs(Number(tx?.amount) || 0);
  // Float noise from repeated partials shouldn't leave a phantom cent owing.
  return Math.max(0, round2(total - paidTowards(tx, installmentIndex)));
};

/** Everything the ledger needs to render a plan's progress, in one read. */
export const planProgress = (tx, installmentIndex = {}) => {
  const total = round2(Math.abs(Number(tx?.amount) || 0));
  const paid = paidTowards(tx, installmentIndex);
  const remaining = Math.max(0, round2(total - paid));
  return { total, paid, remaining, complete: total > 0 && remaining === 0 };
};

/**
 * Can a payment be recorded against this row?
 *
 * A cleared row is money already in the account — there is nothing left to
 * collect, and putting it on a plan would mean un-clearing real cash. Transfers
 * move money between our own accounts, refunds are reversals, and a payment
 * cannot itself be paid in pieces. Distribution rows belong to the waterfall
 * engine, which reconciles them by batch.
 */
export const canRecordPayment = (tx, installmentIndex = {}) =>
  Boolean(tx) &&
  tx.category !== 'TRF' &&
  !tx.cleared &&
  !tx.refundOfTxId &&
  !isInstallment(tx) &&
  !tx.waterfallBatchId &&
  outstandingOn(tx, installmentIndex) > 0;

/**
 * A plan's parent is an obligation, not money that changed hands, so there is
 * nothing on it to give back. Refund the payments instead.
 */
export const blocksRefund = (tx, installmentIndex = {}) => hasPaymentPlan(tx, installmentIndex);

/**
 * The name a payment is given when the treasurer does not supply one.
 *
 * A payment carries its own title because it has to stand on its own — in an
 * export, in a search, and in the ledger when a filter separates it from what
 * it pays off. That makes the title a snapshot, which is why renaming an
 * obligation has to follow through to the payments still carrying its old name.
 */
export const derivedInstallmentTitle = (parentTitle = '') => `Payment: ${parentTitle}`;

/** Shape the payment row for a given parent + amount. */
export const buildInstallmentTransaction = (
  tx,
  { amount, date, notes = '', cleared = true, accountId, title } = {},
) => {
  const magnitude = Math.abs(Number(amount) || 0);
  return {
    // Same side of the ledger as what it pays off: a payment towards income is
    // income, a payment towards an expense is an expense.
    amount: tx.amount < 0 ? -magnitude : magnitude,
    title: title || derivedInstallmentTitle(tx.title),
    date,
    // Category, player, event and sponsor come from the obligation so every
    // per-category, per-player and per-sponsor total lands where the full
    // amount would have if it had been paid in one go.
    category: tx.category,
    // The account can differ per payment — a family may hand over cash one
    // month and send a transfer the next — so it is an override, not a copy.
    accountId: accountId ?? tx.accountId ?? '',
    playerId: tx.playerId || '',
    playerName: tx.playerName || '',
    eventId: tx.eventId || '',
    sponsorId: tx.sponsorId || '',
    seasonId: tx.seasonId,
    teamSeasonId: tx.teamSeasonId,
    cleared,
    // A payment's date IS the day the money moved, so it doubles as the
    // activity date — otherwise it would reconcile outside the month it landed.
    clearedDate: cleared ? date : null,
    notes: notes || '',
    installmentOfTxId: tx.id,
  };
};
