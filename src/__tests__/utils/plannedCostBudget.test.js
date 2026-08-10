// planPlannedCostsPush decides how much of the planner's FORECAST lands in the
// season budget, and the budget is what every player is eventually billed from.
// Two failure modes matter: pushing the forecast twice (every family charged
// twice for games that have not happened), and carrying both the estimate and
// the real receipt for the same game once actuals arrive. These tests pin the
// delta arithmetic and the supersede rule that prevent them.
import { describe, it, expect } from 'vitest';
import {
  buildPlannedEntries,
  planPlannedCostsPush,
  applyPlannedPlanToItems,
  summarizePlannedCosts,
  matchupPlannedTotal,
  halfForMatchup,
  isCostBudgeted,
  PLANNED_LINE_LABEL,
} from '../../utils/plannedCostBudget';

const matchup = (id, overrides = {}) => ({
  id,
  status: 'open',
  matchDate: '2025-09-13',
  promotedEventId: null,
  ...overrides,
});

const cost = (matchupId, amount, category = 'LEA', overrides = {}) => ({
  id: `cost_${matchupId}_${category}_${amount}`,
  matchupId,
  category,
  label: 'Referees',
  amount,
  ...overrides,
});

const contribution = (matchupId, amount, overrides = {}) => ({
  id: `contrib_${matchupId}`,
  matchupId,
  category: 'LEA',
  half: 'fall',
  budgetItemId: 'item_LEA',
  appliedAmount: amount,
  ...overrides,
});

const line = (category, overrides = {}) => ({
  id: `item_${category}`,
  category,
  label: PLANNED_LINE_LABEL,
  income: 0,
  expensesFall: 0,
  expensesSpring: 0,
  ...overrides,
});

describe('halfForMatchup', () => {
  it('splits on the season boundary', () => {
    expect(halfForMatchup(matchup('m1', { matchDate: '2025-09-13' }))).toBe('fall');
    expect(halfForMatchup(matchup('m1', { matchDate: '2026-03-02' }))).toBe('spring');
  });

  it('counts an undated preseason matchup in fall', () => {
    expect(halfForMatchup(matchup('m1', { matchDate: null }))).toBe('fall');
  });
});

describe('buildPlannedEntries', () => {
  it('rolls a matchup’s costs up per category and half', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1')],
      plannedCosts: [cost('m1', 120), cost('m1', 30), cost('m1', 75, 'OPE')],
    });

    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.category === 'LEA').amount).toBe(150);
    expect(entries.find((e) => e.category === 'OPE').amount).toBe(75);
  });

  it('drops costs whose matchup no longer exists', () => {
    const entries = buildPlannedEntries({ matchups: [], plannedCosts: [cost('gone', 100)] });
    expect(entries).toEqual([]);
  });

  it('marks a cancelled or never-scheduled game as excluded', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1', { status: 'cancelled' }), matchup('m2', { status: 'dns' })],
      plannedCosts: [cost('m1', 100), cost('m2', 100)],
    });
    expect(entries.every((e) => e.excluded)).toBe(true);
  });

  it('supersedes an estimate once the promoted event’s real spend is in the budget', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1', { status: 'confirmed', promotedEventId: 'evt1' })],
      plannedCosts: [cost('m1', 120), cost('m1', 60, 'OPE')],
      eventContributions: [{ eventId: 'evt1', category: 'LEA', half: 'fall', appliedAmount: 140 }],
    });

    expect(entries.find((e) => e.category === 'LEA').superseded).toBe(true);
    // Only the category with actuals is replaced — the rest is still a forecast.
    expect(entries.find((e) => e.category === 'OPE').superseded).toBe(false);
  });
});

describe('planPlannedCostsPush', () => {
  it('creates one line per category and sums every matchup into it', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1'), matchup('m2')],
      plannedCosts: [cost('m1', 120), cost('m2', 130)],
    });

    const plan = planPlannedCostsPush({ entries, contributions: [], budgetItems: [] });

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ category: 'LEA', field: 'expensesFall', isNew: true, delta: 250, to: 250 });
    expect(plan.upserts).toHaveLength(2);
    expect(plan.netDelta).toBe(250);
  });

  it('moves the line by the delta on a re-push instead of adding it again', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 200)] });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 150)],
      budgetItems: [line('LEA', { expensesFall: 150 })],
    });

    expect(plan.netDelta).toBe(50);
    expect(plan.changes[0]).toMatchObject({ from: 150, to: 200, delta: 50 });
  });

  it('is a no-op when nothing has changed', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 150)] });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 150)],
      budgetItems: [line('LEA', { expensesFall: 150 })],
    });

    expect(plan.noop).toBe(true);
    expect(plan.netDelta).toBe(0);
  });

  it('backs the money out when a game is cancelled', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1', { status: 'cancelled' })],
      plannedCosts: [cost('m1', 150)],
    });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 150)],
      budgetItems: [line('LEA', { expensesFall: 150 })],
    });

    expect(plan.netDelta).toBe(-150);
    expect(plan.changes[0]).toMatchObject({ to: 0 });
    expect(plan.removals).toHaveLength(1);
  });

  it('backs the money out when the matchup is deleted outright', () => {
    const plan = planPlannedCostsPush({
      entries: [],
      contributions: [contribution('m1', 150)],
      budgetItems: [line('LEA', { expensesFall: 150 })],
    });

    expect(plan.netDelta).toBe(-150);
    expect(plan.removals.map((r) => r.matchupId)).toEqual(['m1']);
  });

  // Deleting a matchup nulls its contribution's matchup_id rather than
  // cascading, so the row survives as the record of money still sitting in the
  // budget. It has to read as a removal, or that money is stranded.
  it('backs out an orphaned contribution left by a deleted matchup', () => {
    const plan = planPlannedCostsPush({
      entries: [],
      contributions: [contribution(null, 150)],
      budgetItems: [line('LEA', { expensesFall: 150 })],
    });

    expect(plan.netDelta).toBe(-150);
    expect(plan.removals).toHaveLength(1);
  });

  it('backs the estimate out once actuals supersede it, so the game is not counted twice', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1', { status: 'confirmed', promotedEventId: 'evt1' })],
      plannedCosts: [cost('m1', 150)],
      eventContributions: [{ eventId: 'evt1', category: 'LEA', half: 'fall', appliedAmount: 165 }],
    });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 150)],
      budgetItems: [line('LEA', { expensesFall: 150 })],
    });

    expect(plan.netDelta).toBe(-150);
    expect(plan.removals).toHaveLength(1);
  });

  it('keeps fall and spring on separate fields of one line', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1'), matchup('m2', { matchDate: '2026-04-11' })],
      plannedCosts: [cost('m1', 100), cost('m2', 60)],
    });
    const plan = planPlannedCostsPush({ entries, contributions: [], budgetItems: [] });

    const items = applyPlannedPlanToItems([], plan);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: 'LEA', expensesFall: 100, expensesSpring: 60 });
  });

  it('never touches a hand-authored line in the same category', () => {
    const handWritten = {
      id: 'item_manual',
      category: 'LEA',
      label: 'League dues',
      income: 0,
      expensesFall: 400,
      expensesSpring: 0,
    };
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 150)] });
    const plan = planPlannedCostsPush({ entries, contributions: [], budgetItems: [handWritten] });

    expect(plan.changes[0].isNew).toBe(true);
    const items = applyPlannedPlanToItems([handWritten], plan);
    expect(items.find((i) => i.id === 'item_manual').expensesFall).toBe(400);
    expect(items.find((i) => i.label === PLANNED_LINE_LABEL).expensesFall).toBe(150);
  });
});

describe('summarizePlannedCosts', () => {
  it('reports what is forecast, what is applied, and what a push would move', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1'), matchup('m2', { matchDate: '2026-02-07' }), matchup('m3', { status: 'cancelled' })],
      plannedCosts: [cost('m1', 100), cost('m2', 60), cost('m3', 500)],
    });

    const summary = summarizePlannedCosts({ entries, contributions: [contribution('m1', 100)] });

    expect(summary).toMatchObject({
      plannedTotal: 160,
      appliedTotal: 100,
      delta: 60,
      fall: 100,
      spring: 60,
      matchupCount: 2,
    });
  });
});

// isCostBudgeted gates the "file this in the ledger" action. Filing a cost the
// budget never absorbed would put spend on the books that no fee was sized to
// cover, so the gate is the only thing standing between a stray tap and an
// unfunded expense.
describe('isCostBudgeted', () => {
  it('accepts a cost whose category and half were pushed', () => {
    expect(isCostBudgeted(cost('m1', 120), matchup('m1'), [contribution('m1', 120)])).toBe(true);
  });

  it('rejects a cost in a category that was never pushed', () => {
    expect(isCostBudgeted(cost('m1', 75, 'OPE'), matchup('m1'), [contribution('m1', 120)])).toBe(false);
  });

  it('rejects when the contribution belongs to another matchup', () => {
    expect(isCostBudgeted(cost('m1', 120), matchup('m1'), [contribution('m2', 120)])).toBe(false);
  });

  it('rejects when the game moved to the other half of the season', () => {
    const moved = matchup('m1', { matchDate: '2026-03-02' });
    expect(isCostBudgeted(cost('m1', 120), moved, [contribution('m1', 120)])).toBe(false);
  });

  it('rejects a zeroed-out contribution', () => {
    expect(isCostBudgeted(cost('m1', 120), matchup('m1'), [contribution('m1', 0)])).toBe(false);
  });
});

describe('matchupPlannedTotal', () => {
  it('adds up only the rows for that matchup', () => {
    const costs = [cost('m1', 120), cost('m1', 30, 'OPE'), cost('m2', 999)];
    expect(matchupPlannedTotal('m1', costs)).toBe(150);
  });
});
