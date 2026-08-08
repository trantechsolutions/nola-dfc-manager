/**
 * Season fee math.
 *
 * Kept pure and in one place because this calculation exists twice: here, for
 * the Fee Calculator in BudgetView, and in the `player_financials` SQL view
 * that every balance in the app reads from. If you change the formula here,
 * change it in sql/carryover_migration.sql too — a mismatch shows up as a
 * player's fee not matching the number the treasurer finalized.
 */

/** Fees are always rounded up to a whole multiple of this. */
export const FEE_ROUNDING_INCREMENT = 50;

/**
 * Work out what each paying player owes.
 *
 * Order of operations matters: the buffer is contingency on the expenses, so
 * it is applied first; the carryover is real cash already in hand, so it comes
 * off the total the roster has to cover. A carryover larger than the need
 * floors the fee at 0 rather than going negative.
 *
 * @param {object} args
 * @param {number} args.totalExpenses Sum of budgeted expenses (fall + spring).
 * @param {number} [args.bufferPercent] Contingency percentage, e.g. 5.
 * @param {number} [args.carryoverAmount] Funds rolled over from the prior season.
 * @param {number} args.rosterSize Number of fee-paying players.
 * @returns {{ bufferAmount: number, needsCovered: number, rawFee: number, roundedFee: number }}
 */
export function computeSeasonFee({ totalExpenses = 0, bufferPercent = 0, carryoverAmount = 0, rosterSize = 0 }) {
  const expenses = Number(totalExpenses) || 0;
  const buffer = Number(bufferPercent) || 0;
  // A negative carryover would silently inflate everyone's fee. Ignore it.
  const carryover = Math.max(0, Number(carryoverAmount) || 0);
  const roster = Number(rosterSize) || 0;

  const bufferAmount = expenses * (buffer / 100);
  const needsCovered = Math.max(0, expenses + bufferAmount - carryover);
  const rawFee = roster > 0 ? needsCovered / roster : 0;
  const roundedFee = Math.ceil(rawFee / FEE_ROUNDING_INCREMENT) * FEE_ROUNDING_INCREMENT;

  return { bufferAmount, needsCovered, rawFee, roundedFee };
}
