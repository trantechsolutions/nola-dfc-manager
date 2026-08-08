// planEventBudgetPush decides how much of an event's spend lands in the season
// budget, and the budget is what every player is eventually billed from. The
// failure mode that matters is double-counting: push an event twice and the
// roster gets charged for it twice. These tests pin the delta arithmetic that
// prevents that, plus the corrections (edit / delete / recategorise / reschedule)
// that have to flow back OUT of the budget.
import { describe, it, expect } from 'vitest';
import {
  planEventBudgetPush,
  applyPlanToItems,
  totalsByCategory,
  getSeasonHalf,
  EVENT_LINE_LABEL,
} from '../../utils/eventBudgetPush';

const expense = (amount, category = 'TOU', overrides = {}) => ({
  id: `tx_${Math.random().toString(36).slice(2)}`,
  amount: -Math.abs(amount),
  category,
  title: 'Expense',
  ...overrides,
});

const line = (category, overrides = {}) => ({
  id: `item_${category}`,
  category,
  label: EVENT_LINE_LABEL,
  income: 0,
  expensesFall: 0,
  expensesSpring: 0,
  ...overrides,
});

describe('getSeasonHalf', () => {
  it('puts July through December in fall', () => {
    expect(getSeasonHalf('2025-07-01')).toBe('fall');
    expect(getSeasonHalf('2025-12-31')).toBe('fall');
  });

  it('puts January through June in spring', () => {
    expect(getSeasonHalf('2026-01-01')).toBe('spring');
    expect(getSeasonHalf('2026-06-30')).toBe('spring');
  });

  it('does not slip a day backwards across a month boundary', () => {
    // Parsed as UTC midnight this is Dec 31 in any US zone — and therefore fall.
    expect(getSeasonHalf('2026-01-01T00:00:00')).toBe('spring');
  });
});

describe('totalsByCategory', () => {
  it('sums expenses as positive magnitudes, grouped by category', () => {
    const totals = totalsByCategory([expense(250, 'TOU'), expense(75, 'TOU'), expense(120, 'OPE')]);
    expect(totals).toEqual({ TOU: 325, OPE: 120 });
  });

  it('ignores transfers', () => {
    expect(totalsByCategory([expense(250, 'TOU'), expense(500, 'TRF')])).toEqual({ TOU: 250 });
  });

  it('defaults an uncategorised expense to operating', () => {
    expect(totalsByCategory([{ id: 'tx1', amount: -40 }])).toEqual({ OPE: 40 });
  });
});

describe('planEventBudgetPush — first push', () => {
  it('creates one line per category and records what it applied', () => {
    const plan = planEventBudgetPush({
      expenses: [expense(250, 'TOU'), expense(75, 'TOU'), expense(120, 'OPE')],
      contributions: [],
      budgetItems: [],
      half: 'fall',
    });

    expect(plan.changes).toHaveLength(2);
    expect(plan.netDelta).toBe(445);
    const tou = plan.changes.find((c) => c.category === 'TOU');
    expect(tou).toMatchObject({ from: 0, to: 325, delta: 325, isNew: true, field: 'expensesFall' });
    expect(plan.upserts.map((u) => u.appliedAmount).sort()).toEqual([120, 325]);
  });

  it('adds to an existing event line rather than making a second one', () => {
    const plan = planEventBudgetPush({
      expenses: [expense(100, 'TOU')],
      contributions: [],
      budgetItems: [line('TOU', { expensesFall: 300 })],
      half: 'fall',
    });

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ from: 300, to: 400, delta: 100, isNew: false });
  });

  it('leaves a hand-authored line in the same category untouched', () => {
    const handWritten = { ...line('TOU'), id: 'hand', label: 'Gulf Coast Registration', expensesFall: 900 };
    const plan = planEventBudgetPush({
      expenses: [expense(100, 'TOU')],
      contributions: [],
      budgetItems: [handWritten],
      half: 'fall',
    });

    expect(plan.changes[0].isNew).toBe(true);
    expect(plan.changes[0].item.id).not.toBe('hand');
    expect(handWritten.expensesFall).toBe(900);
  });

  it('writes to the spring column for a spring event', () => {
    const plan = planEventBudgetPush({
      expenses: [expense(100, 'TOU')],
      contributions: [],
      budgetItems: [],
      half: 'spring',
    });
    expect(plan.changes[0].field).toBe('expensesSpring');
  });
});

describe('planEventBudgetPush — re-push', () => {
  const priorContribution = (overrides = {}) => ({
    id: 'c1',
    category: 'TOU',
    half: 'fall',
    appliedAmount: 325,
    budgetItemId: 'item_TOU',
    ...overrides,
  });

  it('is a no-op when nothing changed', () => {
    const plan = planEventBudgetPush({
      expenses: [expense(325, 'TOU')],
      contributions: [priorContribution()],
      budgetItems: [line('TOU', { expensesFall: 325 })],
      half: 'fall',
    });

    expect(plan.noop).toBe(true);
    expect(plan.netDelta).toBe(0);
  });

  it('applies only the delta when an expense is added', () => {
    const plan = planEventBudgetPush({
      expenses: [expense(325, 'TOU'), expense(60, 'TOU')],
      contributions: [priorContribution()],
      budgetItems: [line('TOU', { expensesFall: 325 })],
      half: 'fall',
    });

    expect(plan.netDelta).toBe(60);
    expect(plan.changes[0]).toMatchObject({ from: 325, to: 385, delta: 60 });
    expect(plan.upserts[0]).toMatchObject({ id: 'c1', appliedAmount: 385 });
  });

  it('backs money out when an expense is deleted', () => {
    const plan = planEventBudgetPush({
      expenses: [expense(200, 'TOU')],
      contributions: [priorContribution()],
      budgetItems: [line('TOU', { expensesFall: 325 })],
      half: 'fall',
    });

    expect(plan.netDelta).toBe(-125);
    expect(plan.changes[0]).toMatchObject({ from: 325, to: 200, delta: -125 });
  });

  it('removes the contribution and zeroes the line when all spend is deleted', () => {
    const plan = planEventBudgetPush({
      expenses: [],
      contributions: [priorContribution()],
      budgetItems: [line('TOU', { expensesFall: 325 })],
      half: 'fall',
    });

    expect(plan.netDelta).toBe(-325);
    expect(plan.changes[0].to).toBe(0);
    expect(plan.removals).toHaveLength(1);
    expect(plan.upserts).toHaveLength(0);
  });

  it('moves money between categories when an expense is recategorised', () => {
    const plan = planEventBudgetPush({
      expenses: [expense(325, 'OPE')],
      contributions: [priorContribution()],
      budgetItems: [line('TOU', { expensesFall: 325 })],
      half: 'fall',
    });

    expect(plan.netDelta).toBe(0);
    expect(plan.changes.find((c) => c.category === 'TOU')).toMatchObject({ delta: -325, to: 0 });
    expect(plan.changes.find((c) => c.category === 'OPE')).toMatchObject({ delta: 325, isNew: true });
  });

  it('moves money between halves when the event is rescheduled across the new year', () => {
    const plan = planEventBudgetPush({
      expenses: [expense(325, 'TOU')],
      contributions: [priorContribution({ half: 'fall' })],
      budgetItems: [line('TOU', { expensesFall: 325 })],
      half: 'spring',
    });

    // Fall gives the money back, spring takes it — net zero, not double-counted.
    expect(plan.netDelta).toBe(0);
    expect(plan.changes.find((c) => c.field === 'expensesFall')).toMatchObject({ delta: -325, to: 0 });
    expect(plan.changes.find((c) => c.field === 'expensesSpring')).toMatchObject({ delta: 325 });
    expect(plan.upserts[0]).toMatchObject({ half: 'spring', appliedAmount: 325 });
  });

  it('does not double-count across three consecutive pushes', () => {
    let items = [];
    let contributions = [];
    const expenses = [expense(325, 'TOU')];

    for (let i = 0; i < 3; i += 1) {
      const plan = planEventBudgetPush({ expenses, contributions, budgetItems: items, half: 'fall' });
      items = applyPlanToItems(items, plan);
      contributions = plan.upserts.map((u, idx) => ({
        id: `c${idx}`,
        category: u.category,
        half: u.half,
        appliedAmount: u.appliedAmount,
        budgetItemId: u.budgetItemId || items.find((it) => it.category === u.category)?.id,
      }));
    }

    expect(items).toHaveLength(1);
    expect(items[0].expensesFall).toBe(325);
  });
});

describe('applyPlanToItems', () => {
  it('folds changes in without disturbing untouched lines', () => {
    const other = { ...line('OPE'), id: 'other', label: 'Coach Fees', expensesFall: 500 };
    const plan = planEventBudgetPush({
      expenses: [expense(100, 'TOU')],
      contributions: [],
      budgetItems: [other],
      half: 'fall',
    });

    const next = applyPlanToItems([other], plan, { seasonId: '2025-2026', teamSeasonId: 'ts1' });
    expect(next).toHaveLength(2);
    expect(next.find((i) => i.id === 'other').expensesFall).toBe(500);
    expect(next.find((i) => i.label === EVENT_LINE_LABEL)).toMatchObject({
      expensesFall: 100,
      seasonId: '2025-2026',
      teamSeasonId: 'ts1',
    });
  });
});
