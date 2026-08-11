// Refunds are ordinary transactions that reverse another one (refundOfTxId), so
// balances net out without any aggregate having to know about them. These
// helpers are the only place that reads that link, so the ledger and the refund
// dialog agree on what is still refundable.

/** Map of originalTxId -> total already refunded, as a positive magnitude. */
export const buildRefundIndex = (transactions = []) => {
  const index = {};
  transactions.forEach((tx) => {
    if (!tx.refundOfTxId) return;
    index[tx.refundOfTxId] = (index[tx.refundOfTxId] || 0) + Math.abs(Number(tx.amount) || 0);
  });
  return index;
};

/** Positive magnitude still available to refund on tx. */
export const refundableRemaining = (tx, refundIndex = {}) => {
  const original = Math.abs(Number(tx?.amount) || 0);
  const refunded = refundIndex[tx?.id] || 0;
  // Float noise from repeated partials shouldn't leave a phantom cent open.
  return Math.max(0, Math.round((original - refunded) * 100) / 100);
};

// Transfers move money between our own accounts — reversing one is another
// transfer, not a refund. Refunding a refund would also just be a re-charge.
export const canRefund = (tx, refundIndex = {}) =>
  Boolean(tx) && tx.category !== 'TRF' && !tx.refundOfTxId && refundableRemaining(tx, refundIndex) > 0;

/** Shape the reversing transaction for a given original + requested amount. */
export const buildRefundTransaction = (tx, { amount, date, notes = '', cleared = true, title } = {}) => {
  const magnitude = Math.abs(Number(amount) || 0);
  return {
    // Opposite sign of the original: refunding income takes money back out,
    // refunding an expense puts it back in.
    amount: tx.amount < 0 ? magnitude : -magnitude,
    title: title || `Refund: ${tx.title}`,
    date,
    // Same category, account, player and event as the original so every
    // per-category, per-account and per-player total nets to zero on a full refund.
    category: tx.category,
    accountId: tx.accountId || '',
    playerId: tx.playerId || '',
    playerName: tx.playerName || '',
    eventId: tx.eventId || '',
    seasonId: tx.seasonId,
    teamSeasonId: tx.teamSeasonId,
    cleared,
    notes: notes || '',
    refundOfTxId: tx.id,
  };
};
