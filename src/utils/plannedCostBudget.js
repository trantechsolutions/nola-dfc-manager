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
 * An undated matchup — the normal state in preseason — is counted in fall.
 * That matches getSeasonHalf's own default and keeps the forecast whole; the
 * planner labels those rows so nobody mistakes the bucket for a decision.
 */
export function halfForMatchup(matchup) {
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
 */
export function planPlannedCostsPush({ entries = [], contributions = [], budgetItems = [] } = {}) {
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
  // One placeholder per category: a single line carries both halves, so two
  // changes must not each invent their own row.
  const created = new Map();

  for (const key of [...new Set([...desired.keys(), ...applied.keys()])].sort()) {
    const [category, half] = key.split('::');
    const field = half === 'spring' ? 'expensesSpring' : 'expensesFall';
    const target = round2(desired.get(key)?.total || 0);
    const priorRows = applied.get(key)?.rows || [];
    const appliedTotal = round2(applied.get(key)?.total || 0);
    const delta = round2(target - appliedTotal);

    // Every contribution whose matchup no longer forecasts this line goes away:
    // that is how a deleted, cancelled, or now-actualised matchup gets its
    // money back out. A deleted matchup leaves its contribution behind with a
    // null matchup_id precisely so this pass can find it.
    const stillWanted = desired.get(key)?.byMatchup || new Map();
    for (const row of priorRows) {
      if (!stillWanted.has(row.matchupId)) removals.push(row);
    }

    if (target === 0 && appliedTotal === 0) continue;

    // Match by category, but only to a line this feature owns — a category
    // routinely holds several hand-authored items, and silently inflating one
    // of those would make the budget no longer say what the treasurer wrote.
    const priorWithItem = priorRows.find((r) => r.budgetItemId) || null;
    let item =
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
      upserts.push({
        id: prior?.id || null,
        matchupId,
        category,
        half,
        appliedAmount: amount,
        // Resolved to a real id by the caller once a new line is persisted.
        budgetItemId: isNew ? null : item.id,
        placeholderItemId: isNew ? item.id : null,
      });
    }
  }

  const netDelta = round2(changes.reduce((sum, c) => sum + c.delta, 0));
  const noop = changes.length === 0 && removals.length === 0;
  return { changes, upserts, removals, netDelta, noop };
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
  return next;
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

/** Total estimate on a single matchup, for the planner row's badge. */
export function matchupPlannedTotal(matchupId, plannedCosts = []) {
  return round2(plannedCosts.filter((c) => c.matchupId === matchupId).reduce((s, c) => s + round2(c.amount), 0));
}
