// Pushing an event's expenses into the season budget.
//
// The schedule side and the budget side are otherwise only related by category
// code: a transaction carries `category`, a budget item carries the same codes,
// and nothing records that a given event's spend was ever budgeted for. That is
// fine until someone pushes the same event twice — without a record of what was
// already applied, the second push adds the whole total again.
//
// So every push writes a CONTRIBUTION row per (event, category) holding the
// amount it put into the budget. A re-push moves the line by the delta between
// what the event totals now and what this event applied last time, which makes
// the operation idempotent and makes corrections (an expense edited, deleted,
// or recategorised) flow through as a negative delta instead of stranding money
// in the budget.
//
// Pure and DB-free on purpose — the arithmetic here decides what players are
// eventually billed, so it has to be testable without a database.

/** Budget lines this module writes to, one per category, created on demand. */
export const EVENT_LINE_LABEL = 'Event Expenses';

/**
 * Which half of the season a date falls in. Seasons run July 1 -> June 30
 * (see seasonUtils.getSeasonDateRange), so July..December is fall and
 * January..June is spring.
 */
export function getSeasonHalf(dateStr) {
  if (!dateStr) return 'fall';
  // Parse as a plain calendar date. `new Date('2025-01-15')` is UTC midnight,
  // which in any negative-offset zone is still the 14th locally and can land on
  // the wrong side of a month boundary; noon local is immune to that.
  const d = new Date(`${String(dateStr).split('T')[0]}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'fall';
  return d.getMonth() >= 6 ? 'fall' : 'spring';
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Expense rows only: transfers move money between accounts, they aren't spend. */
function expenseRows(expenses) {
  return expenses.filter((tx) => tx && tx.category !== 'TRF');
}

/**
 * What the event currently totals, per category. Amounts are stored negative on
 * expense transactions; the budget stores expenses as positive magnitudes.
 */
export function totalsByCategory(expenses = []) {
  const totals = {};
  for (const tx of expenseRows(expenses)) {
    const cat = tx.category || 'OPE';
    totals[cat] = round2((totals[cat] || 0) + Math.abs(Number(tx.amount) || 0));
  }
  return totals;
}

/**
 * Plan a push without performing it.
 *
 * @param {object[]} expenses      Transactions linked to the event.
 * @param {object[]} contributions Prior contribution rows for THIS event.
 * @param {object[]} budgetItems   The team-season's current budget items.
 * @param {string}   half          'fall' | 'spring' — from the event's own date,
 *                                 so one event lands wholly in one half rather
 *                                 than splintering across two by expense date.
 * @returns {{
 *   changes: object[], upserts: object[], removals: object[],
 *   netDelta: number, noop: boolean
 * }}
 */
export function planEventBudgetPush({ expenses = [], contributions = [], budgetItems = [], half = 'fall' } = {}) {
  const field = half === 'spring' ? 'expensesSpring' : 'expensesFall';
  const totals = totalsByCategory(expenses);
  const appliedByKey = new Map();
  for (const c of contributions) {
    appliedByKey.set(`${c.category}::${c.half}`, c);
  }

  // Every category that either has spend now or had spend applied before. The
  // second half of that union is what backs out money for a deleted expense.
  const categories = new Set([...Object.keys(totals), ...contributions.map((c) => c.category)]);

  const changes = [];
  const upserts = [];
  const removals = [];

  for (const category of [...categories].sort()) {
    const target = round2(totals[category] || 0);

    // A category's prior contribution may sit in the OTHER half if the event was
    // moved across the season boundary between pushes. Back the old half out in
    // full and apply the new total to the new one, or the money is counted twice.
    for (const c of contributions) {
      if (c.category !== category || c.half === half) continue;
      const staleField = c.half === 'spring' ? 'expensesSpring' : 'expensesFall';
      const item = budgetItems.find((i) => i.id === c.budgetItemId) || null;
      if (item && Number(c.appliedAmount) !== 0) {
        changes.push({
          category,
          half: c.half,
          field: staleField,
          item,
          from: round2(item[staleField]),
          to: round2(round2(item[staleField]) - round2(c.appliedAmount)),
          delta: -round2(c.appliedAmount),
          isNew: false,
        });
      }
      removals.push(c);
    }

    const prior = appliedByKey.get(`${category}::${half}`);
    const applied = round2(prior?.appliedAmount || 0);
    const delta = round2(target - applied);

    // Nothing budgeted before, nothing spent now — don't create an empty line.
    if (target === 0 && applied === 0) continue;

    if (target === 0) {
      // All spend for this category is gone: back it out and drop the record
      // rather than leaving a zero row that looks like a deliberate $0 budget.
      const item = budgetItems.find((i) => i.id === prior?.budgetItemId) || null;
      if (item && delta !== 0) {
        changes.push({
          category,
          half,
          field,
          item,
          from: round2(item[field]),
          to: round2(round2(item[field]) + delta),
          delta,
          isNew: false,
        });
      }
      if (prior) removals.push(prior);
      continue;
    }

    // Auto-match by category, but to a line this feature owns rather than to
    // whichever hand-authored line happens to share the code — a category
    // routinely holds several items, and silently inflating one of those would
    // make a budget the treasurer wrote no longer say what they wrote.
    let item =
      (prior?.budgetItemId && budgetItems.find((i) => i.id === prior.budgetItemId)) ||
      budgetItems.find((i) => i.category === category && i.label === EVENT_LINE_LABEL) ||
      null;

    const isNew = !item;
    if (isNew) {
      item = {
        id: `push_${category}_${half}`,
        category,
        label: EVENT_LINE_LABEL,
        income: 0,
        expensesFall: 0,
        expensesSpring: 0,
      };
    }

    if (delta !== 0 || isNew) {
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

    upserts.push({
      id: prior?.id || null,
      category,
      half,
      appliedAmount: target,
      // Resolved to a real id by the caller once a new line has been persisted.
      budgetItemId: isNew ? null : item.id,
      placeholderItemId: isNew ? item.id : null,
    });
  }

  const netDelta = round2(changes.reduce((sum, c) => sum + c.delta, 0));
  return { changes, upserts, removals, netDelta, noop: changes.length === 0 && removals.length === 0 };
}

/**
 * Fold a plan's changes into a new budget-item array, ready for saveBudgetItems.
 * Items the plan never touched pass through untouched.
 */
export function applyPlanToItems(budgetItems, plan, { seasonId, teamSeasonId } = {}) {
  const next = budgetItems.map((i) => ({ ...i }));
  for (const change of plan.changes) {
    if (change.isNew) {
      next.push({
        ...change.item,
        [change.field]: change.to,
        ...(seasonId ? { seasonId } : {}),
        ...(teamSeasonId ? { teamSeasonId } : {}),
      });
      continue;
    }
    const target = next.find((i) => i.id === change.item.id);
    if (target) target[change.field] = change.to;
  }
  return next;
}
