// Folding the planner's EXPECTED match costs into the season budget.
//
// utils/eventBudgetPush handles money that has already been spent: real
// transactions on a real event. That is no help in July, when the budget is
// being written and the only thing that exists is a planner full of "week 3,
// away, opponent TBD". This module handles the other direction — what the
// manager thinks the season will cost, entered per matchup on the planner and
// rolled into the budget as a forecast so the base fee can be sized before the
// first whistle.
//
// Two invariants drive the design:
//
//   1. Idempotence. A contribution row per (matchup, category, half) records
//      what the planner already put in, so re-pushing moves each line by the
//      DELTA. Editing an estimate down, deleting a matchup, or cancelling a
//      game all flow back OUT instead of stranding money in the budget.
//
//   2. Estimates never double-count actuals. Once a matchup is confirmed it is
//      promoted to a team_event, and that event's real expenses can be pushed
//      by the event flow. The moment that happens for a category, the estimate
//      for it is superseded — otherwise the budget would carry both the guess
//      and the receipt for the same game.
//
// Pure and DB-free on purpose: this arithmetic decides what families are
// eventually billed, so it has to be testable without a database.

import { getSeasonHalf } from './eventBudgetPush';

/** The budget line this feature owns, one per category, created on demand. */
export const PLANNED_LINE_LABEL = 'Planned Match Costs';

/**
 * Statuses whose costs still belong in a forecast. A matchup that was never
 * scheduled (`dns`) or fell through (`cancelled`) costs nothing, and leaving it
 * in would quietly inflate every family's fee.
 */
export const FORECAST_STATUSES = new Set(['open', 'tentative', 'confirmed']);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const keyOf = (category, half) => `${category}::${half}`;

/**
 * Which half of the season a matchup's costs land in.
 *
 * An explicit season_half set on the planner wins: in preseason the date is the
 * last thing to be agreed, and until then every undated matchup would fall to
 * fall — loading one side of the budget with games the manager already knows
 * are spring. Failing that it is derived from the date, and an undated matchup
 * with no half named still counts as fall, matching getSeasonHalf's own default
 * so the forecast stays whole rather than silently dropping games.
 */
export function halfForMatchup(matchup) {
  const explicit = matchup?.seasonHalf;
  if (explicit === 'fall' || explicit === 'spring') return explicit;
  return getSeasonHalf(matchup?.matchDate || null);
}

/**
 * Turn planner rows into the flat list of estimates the push works from.
 *
 * @param {object[]} matchups           Matchups for the team-season.
 * @param {object[]} plannedCosts       Rows from matchup_planned_costs.
 * @param {object[]} eventContributions What the EVENT push has already applied,
 *                                      used to supersede estimates for games
 *                                      whose real spend is now in the budget.
 * @returns {{ matchupId: string, category: string, half: string, amount: number,
 *             superseded: boolean, excluded: boolean }[]}
 */
export function buildPlannedEntries({ matchups = [], plannedCosts = [], eventContributions = [] } = {}) {
  const byMatchup = new Map(matchups.map((m) => [m.id, m]));

  // (event, category) pairs the event push already owns.
  const actualised = new Set();
  for (const c of eventContributions) {
    if (c?.eventId) actualised.add(`${c.eventId}::${c.category}`);
  }

  const merged = new Map();
  for (const cost of plannedCosts) {
    const matchup = byMatchup.get(cost.matchupId);
    if (!matchup) continue;

    const amount = round2(cost.amount);
    if (amount === 0) continue;

    const category = cost.category || 'OPE';
    const half = halfForMatchup(matchup);
    const excluded = !FORECAST_STATUSES.has(matchup.status);
    const superseded = !!matchup.promotedEventId && actualised.has(`${matchup.promotedEventId}::${category}`);

    const key = `${cost.matchupId}::${keyOf(category, half)}`;
    const prior = merged.get(key);
    if (prior) prior.amount = round2(prior.amount + amount);
    else merged.set(key, { matchupId: cost.matchupId, category, half, amount, superseded, excluded });
  }

  return [...merged.values()];
}

/** Estimates that actually count toward the budget. */
const countable = (entries) => entries.filter((e) => !e.superseded && !e.excluded && e.amount !== 0);

/**
 * Plan a push without performing it.
 *
 * Unlike the event push, several matchups share one budget line per category,
 * so a line moves by the difference between what the whole planner forecasts
 * for that (category, half) and what the planner previously applied to it.
 *
 * @param {object[]} entries       From buildPlannedEntries.
 * @param {object[]} contributions Prior budget_plan_contributions rows.
 * @param {object[]} budgetItems   The team-season's current budget items.
 * @param {object}   targets       Optional { [category]: budgetItemId } chosen by
 *                                 the treasurer on the budget screen, attaching
 *                                 the forecast to a line they already wrote
 *                                 instead of this feature's own line.
 * @param {object}   linkOnly      Optional { [category]: true } for a target the
 *                                 treasurer has ALREADY sized by hand. The link
 *                                 is recorded and the line's amount is left
 *                                 exactly as typed — see below.
 */
export function planPlannedCostsPush({
  entries = [],
  contributions = [],
  budgetItems = [],
  targets = {},
  linkOnly = {},
} = {}) {
  const desired = new Map(); // key -> { total, byMatchup: Map }
  for (const entry of countable(entries)) {
    const key = keyOf(entry.category, entry.half);
    if (!desired.has(key)) desired.set(key, { total: 0, byMatchup: new Map() });
    const bucket = desired.get(key);
    bucket.total = round2(bucket.total + entry.amount);
    bucket.byMatchup.set(entry.matchupId, round2((bucket.byMatchup.get(entry.matchupId) || 0) + entry.amount));
  }

  const applied = new Map(); // key -> { total, rows: [] }
  for (const c of contributions) {
    const key = keyOf(c.category, c.half);
    if (!applied.has(key)) applied.set(key, { total: 0, rows: [] });
    const bucket = applied.get(key);
    bucket.total = round2(bucket.total + round2(c.appliedAmount));
    bucket.rows.push(c);
  }

  const changes = [];
  const upserts = [];
  const removals = [];
  // Whether any contribution row would actually be written. A pure link changes
  // no budget line at all, so without this the push would read as a no-op and
  // the link would never be recorded.
  let contributionsChanged = false;
  // Lines this push emptied because the forecast moved off them.
  const vacated = new Set();
  // One placeholder per category: a single line carries both halves, so two
  // changes must not each invent their own row.
  const created = new Map();

  for (const key of [...new Set([...desired.keys(), ...applied.keys()])].sort()) {
    const [category, half] = key.split('::');
    const field = half === 'spring' ? 'expensesSpring' : 'expensesFall';
    const target = round2(desired.get(key)?.total || 0);
    const priorRows = applied.get(key)?.rows || [];
    const appliedTotal = round2(applied.get(key)?.total || 0);

    // Every contribution whose matchup no longer forecasts this line goes away:
    // that is how a deleted, cancelled, or now-actualised matchup gets its
    // money back out. A deleted matchup leaves its contribution behind with a
    // null matchup_id precisely so this pass can find it.
    const stillWanted = desired.get(key)?.byMatchup || new Map();
    for (const row of priorRows) {
      if (!stillWanted.has(row.matchupId)) removals.push(row);
    }

    if (target === 0 && appliedTotal === 0) continue;

    // An explicit target wins: the treasurer asked for the forecast to ride on
    // a line they already wrote, so that is where it goes. Constrained to the
    // same category, because a line's category is what the whole budget groups,
    // reports and reconciles on.
    const chosenId = targets?.[category] || null;
    const chosen = chosenId ? budgetItems.find((i) => i.id === chosenId && i.category === category) || null : null;

    // "I already budgeted this — just link it." The treasurer typed the cost
    // into that line themselves, so adding the forecast on top would budget the
    // same games twice and re-price the roster for money already provided for.
    // The contribution is still written, which is what makes the forecast count
    // as budgeted: the plan reads as up to date and the estimates become
    // filable in the ledger. Only meaningful against a line that exists, so a
    // flag without a target is ignored.
    //
    // It adopts the line as it stands rather than latching permanently: the
    // contribution now records what this line covers, so if the forecast later
    // grows, the NEXT push tops the line up by that difference alone.
    const linked = !!linkOnly?.[category] && !!chosen;

    // Otherwise match by category, but only to a line this feature owns — a
    // category routinely holds several hand-authored items, and silently
    // inflating one of those would make the budget no longer say what the
    // treasurer wrote.
    const priorWithItem = priorRows.find((r) => r.budgetItemId) || null;
    let item =
      chosen ||
      created.get(category) ||
      (priorWithItem && budgetItems.find((i) => i.id === priorWithItem.budgetItemId)) ||
      budgetItems.find((i) => i.category === category && i.label === PLANNED_LINE_LABEL) ||
      null;

    const isNew = !item;
    if (isNew) {
      item = {
        id: `plan_${category}`,
        category,
        label: PLANNED_LINE_LABEL,
        income: 0,
        expensesFall: 0,
        expensesSpring: 0,
      };
      created.set(category, item);
    }

    // What each line is already carrying for this key. Re-attaching moves the
    // money: the old line gives it back in the same push that the new one takes
    // it, so the season total is unchanged and neither line double-counts.
    const priorByItem = new Map();
    for (const row of priorRows) {
      if (!row.budgetItemId) continue;
      priorByItem.set(row.budgetItemId, round2((priorByItem.get(row.budgetItemId) || 0) + round2(row.appliedAmount)));
    }

    for (const [itemId, amount] of priorByItem) {
      if (itemId === item.id || amount === 0) continue;
      const stale = budgetItems.find((i) => i.id === itemId);
      // A line the treasurer deleted by hand took its share of the budget with
      // it (the contribution's item id was nulled), so there is nothing left to
      // back out — the destination simply gets the full forecast below.
      if (!stale) continue;
      changes.push({
        category,
        half,
        field,
        item: stale,
        from: round2(stale[field]),
        to: round2(round2(stale[field]) - amount),
        delta: round2(-amount),
        isNew: false,
        vacating: true,
      });
      vacated.add(itemId);
    }

    // Measured against the DESTINATION only. Money on a line that is gone, or
    // on a line we just backed out of, is not in the budget any more and must
    // be re-added here rather than assumed present.
    const heldHere = round2(priorByItem.get(item.id) || 0);
    const delta = linked ? 0 : round2(target - heldHere);

    if (delta !== 0) {
      changes.push({
        category,
        half,
        field,
        item,
        from: round2(item[field]),
        to: round2(round2(item[field]) + delta),
        delta,
        isNew,
      });
    }

    for (const [matchupId, amount] of stillWanted) {
      const prior = priorRows.find((r) => r.matchupId === matchupId) || null;
      // Resolved to a real id by the caller once a new line is persisted.
      const budgetItemId = isNew ? null : item.id;
      if (!prior || round2(prior.appliedAmount) !== amount || (prior.budgetItemId || null) !== budgetItemId) {
        contributionsChanged = true;
      }
      upserts.push({
        id: prior?.id || null,
        matchupId,
        category,
        half,
        appliedAmount: amount,
        budgetItemId,
        placeholderItemId: isNew ? item.id : null,
      });
    }
  }

  const netDelta = round2(changes.reduce((sum, c) => sum + c.delta, 0));
  const noop = changes.length === 0 && removals.length === 0 && !contributionsChanged;
  return { changes, upserts, removals, vacated: [...vacated], netDelta, noop };
}

/**
 * Fold a plan's changes into a new budget-item array, ready for saveBudgetItems.
 * Items the plan never touched pass through untouched.
 *
 * Changes are grouped by item because one new line can carry both halves —
 * appending per change would create the line twice.
 */
export function applyPlannedPlanToItems(budgetItems, plan, { seasonId, teamSeasonId } = {}) {
  const next = budgetItems.map((i) => ({ ...i }));
  const addedById = new Map();

  for (const change of plan.changes) {
    if (change.isNew) {
      let row = addedById.get(change.item.id);
      if (!row) {
        row = {
          ...change.item,
          ...(seasonId ? { seasonId } : {}),
          ...(teamSeasonId ? { teamSeasonId } : {}),
        };
        addedById.set(change.item.id, row);
        next.push(row);
      }
      row[change.field] = change.to;
      continue;
    }
    const target = next.find((i) => i.id === change.item.id);
    if (target) target[change.field] = change.to;
  }

  // A line this feature created and just emptied — because the forecast was
  // re-attached to one the treasurer wrote — is swept up rather than left
  // behind as a $0 row nobody can explain. Hand-authored lines are never
  // removed, however empty: the treasurer put them there on purpose.
  const vacated = plan.vacated || [];
  if (vacated.length === 0) return next;
  const isEmpty = (i) => round2(i.income) === 0 && round2(i.expensesFall) === 0 && round2(i.expensesSpring) === 0;
  return next.filter((i) => !(vacated.includes(i.id) && i.label === PLANNED_LINE_LABEL && isEmpty(i)));
}

/**
 * The forecast broken out per category, for the budget screen's attach control:
 * how much this category forecasts, how much of it the budget already carries,
 * and which line is carrying it today.
 *
 * @returns {{ category: string, plannedTotal: number, appliedTotal: number,
 *             attachedItemId: string|null }[]}
 */
export function plannedCategoryTargets({ entries = [], contributions = [] } = {}) {
  const byCategory = new Map();
  const bucket = (category) => {
    if (!byCategory.has(category)) {
      byCategory.set(category, { category, plannedTotal: 0, appliedTotal: 0, itemIds: new Set() });
    }
    return byCategory.get(category);
  };

  for (const entry of countable(entries)) {
    const row = bucket(entry.category);
    row.plannedTotal = round2(row.plannedTotal + entry.amount);
  }

  for (const c of contributions) {
    const amount = round2(c.appliedAmount);
    const row = bucket(c.category);
    row.appliedTotal = round2(row.appliedTotal + amount);
    if (c.budgetItemId && amount !== 0) row.itemIds.add(c.budgetItemId);
  }

  return [...byCategory.values()]
    .filter((row) => row.plannedTotal !== 0 || row.appliedTotal !== 0)
    .map(({ category, plannedTotal, appliedTotal, itemIds }) => ({
      category,
      plannedTotal,
      appliedTotal,
      // One line per category is the invariant. Anything else means a line was
      // deleted or half-migrated, and the control says "unattached" rather than
      // picking a winner the next push would disagree with.
      attachedItemId: itemIds.size === 1 ? [...itemIds][0] : null,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * What the planner screen and the budget screen both show above the button:
 * how much is forecast, how much of it is already in the budget, and what a
 * push would move.
 */
export function summarizePlannedCosts({ entries = [], contributions = [] } = {}) {
  const counted = countable(entries);
  const sum = (rows) => round2(rows.reduce((s, r) => s + r.amount, 0));

  const plannedTotal = sum(counted);
  const appliedTotal = round2(contributions.reduce((s, c) => s + round2(c.appliedAmount), 0));

  return {
    plannedTotal,
    appliedTotal,
    delta: round2(plannedTotal - appliedTotal),
    fall: sum(counted.filter((e) => e.half === 'fall')),
    spring: sum(counted.filter((e) => e.half === 'spring')),
    supersededTotal: sum(entries.filter((e) => e.superseded && !e.excluded)),
    matchupCount: new Set(counted.map((e) => e.matchupId)).size,
  };
}

/**
 * Whether a given estimate is already carried by the season budget.
 *
 * Gates the "add to ledger" action: filing a cost the budget has never seen
 * would put spend on the books that no fee was ever sized to cover. Matched at
 * (matchup, category, half) because that is the grain a contribution is written
 * at — several cost rows in one category share one contribution between them.
 */
export function isCostBudgeted(cost, matchup, contributions = []) {
  if (!cost || !matchup) return false;
  const half = halfForMatchup(matchup);
  const category = cost.category || 'OPE';
  return contributions.some(
    (c) => c.matchupId === matchup.id && c.category === category && c.half === half && round2(c.appliedAmount) !== 0,
  );
}

/**
 * Estimates that are ready to be filed in the ledger, in planner order.
 *
 * The same three gates the single-row action applies, applied in bulk: already
 * filed is skipped (the ledger row is the truth once it exists), a game that is
 * cancelled or was never scheduled is skipped (nothing was spent), and anything
 * the budget has not seen is skipped — filing that would put spend on the books
 * that no fee was ever sized to cover. Pure so the count on the button and the
 * set the action actually files can never drift apart.
 */
export function costsReadyForLedger({ plannedCosts = [], matchups = [], contributions = [] } = {}) {
  const byMatchup = new Map(matchups.map((m) => [m.id, m]));
  const ready = [];
  for (const cost of plannedCosts) {
    if (cost?.ledgerTxId) continue;
    if (round2(cost?.amount) === 0) continue;
    const matchup = byMatchup.get(cost.matchupId);
    if (!matchup || !FORECAST_STATUSES.has(matchup.status)) continue;
    if (!isCostBudgeted(cost, matchup, contributions)) continue;
    ready.push({ cost, matchup });
  }
  return ready;
}

/** Total estimate on a single matchup, for the planner row's badge. */
export function matchupPlannedTotal(matchupId, plannedCosts = []) {
  return round2(plannedCosts.filter((c) => c.matchupId === matchupId).reduce((s, c) => s + round2(c.amount), 0));
}
