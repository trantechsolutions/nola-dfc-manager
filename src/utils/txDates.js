/**
 * Transactions carry two different dates, and conflating them is what makes a
 * reconciliation come up short:
 *
 *   - `date` (`rawDate` on the client) — the EVENT date: what the money is for.
 *     A tournament registration paid in August for a November cup is dated
 *     November, because that is where it belongs in the season's story.
 *   - `clearedDate` (`cleared_date`) — the ACTIVITY date: when the money
 *     actually left or landed in the account. This is the only date a bank
 *     statement knows about.
 *
 * Book balance and statement matching run off the activity date. Anything
 * reporting on the season (ledger ordering, event budgets) keeps using the
 * event date.
 */

/** Normalise any shape a transaction date arrives in to 'YYYY-MM-DD'. */
export function toDateStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.split('T')[0];
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (value.seconds) return new Date(value.seconds * 1000).toISOString().split('T')[0];
  return null;
}

/** Today in the viewer's own timezone — `toISOString()` would roll over early evening. */
export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The event date: when the thing the money paid for happens. */
export function txEventDate(tx) {
  if (!tx) return null;
  return toDateStr(tx.rawDate) ?? toDateStr(tx.date);
}

/**
 * The activity date: the day the money actually moved. This is what book
 * balance and statement matching reconcile on. Falls back to the event date on
 * rows recorded before activity dates were captured.
 */
export function txActivityDate(tx) {
  if (!tx) return null;
  return toDateStr(tx.clearedDate) ?? txEventDate(tx);
}

/** True when activity and event dates disagree — worth surfacing in the ledger. */
export function hasSplitDates(tx) {
  const activity = toDateStr(tx?.clearedDate);
  return !!activity && activity !== txEventDate(tx);
}
