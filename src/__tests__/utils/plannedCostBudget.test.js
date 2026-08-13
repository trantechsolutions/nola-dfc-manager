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
  plannedCategoryTargets,
  costsReadyForLedger,
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

  it('lets the planner override the date', () => {
    expect(halfForMatchup(matchup('m1', { matchDate: '2025-09-13', seasonHalf: 'spring' }))).toBe('spring');
    expect(halfForMatchup(matchup('m1', { matchDate: '2026-03-02', seasonHalf: 'fall' }))).toBe('fall');
  });

  it('is what makes an undated game budgetable as spring', () => {
    expect(halfForMatchup(matchup('m1', { matchDate: null }))).toBe('fall');
    expect(halfForMatchup(matchup('m1', { matchDate: null, seasonHalf: 'spring' }))).toBe('spring');
  });

  it('falls back to the date when the value is not a half', () => {
    expect(halfForMatchup(matchup('m1', { matchDate: '2026-03-02', seasonHalf: '' }))).toBe('spring');
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

describe('planPlannedCostsPush — moving a matchup between halves', () => {
  it('takes the money out of one half and puts it in the other', () => {
    // The manager re-labels a fall game as spring on the planner.
    const entries = buildPlannedEntries({
      matchups: [matchup('m1', { seasonHalf: 'spring' })],
      plannedCosts: [cost('m1', 150)],
    });
    const owned = line('LEA', { expensesFall: 150 });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 150)],
      budgetItems: [owned],
    });

    const items = applyPlannedPlanToItems([owned], plan);
    expect(items[0]).toMatchObject({ expensesFall: 0, expensesSpring: 150 });
    // The season is no worse off, the money just sits on the other side.
    expect(plan.netDelta).toBe(0);
    // The fall contribution is retired rather than left claiming money the
    // fall side no longer holds.
    expect(plan.removals).toEqual([expect.objectContaining({ half: 'fall' })]);
    expect(plan.upserts).toEqual([expect.objectContaining({ half: 'spring', appliedAmount: 150 })]);
  });
});

describe('planPlannedCostsPush — attaching to an existing line', () => {
  const handWritten = (overrides = {}) => ({
    id: 'item_manual',
    category: 'LEA',
    label: 'League dues',
    income: 0,
    expensesFall: 400,
    expensesSpring: 0,
    ...overrides,
  });

  it('puts a first push straight onto the chosen line instead of creating one', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 150)] });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [],
      budgetItems: [handWritten()],
      targets: { LEA: 'item_manual' },
    });

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      item: { id: 'item_manual' },
      from: 400,
      to: 550,
      delta: 150,
      isNew: false,
    });
    expect(plan.upserts[0].budgetItemId).toBe('item_manual');
  });

  it('MOVES money already applied rather than adding a second helping', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 150)] });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 150)],
      budgetItems: [line('LEA', { expensesFall: 150 }), handWritten()],
      targets: { LEA: 'item_manual' },
    });

    // The season total is unchanged: the old line gives back exactly what the
    // chosen line takes. Anything else re-bills every family.
    expect(plan.netDelta).toBe(0);
    const items = applyPlannedPlanToItems([line('LEA', { expensesFall: 150 }), handWritten()], plan);
    expect(items.find((i) => i.id === 'item_manual').expensesFall).toBe(550);
    // The emptied planner-owned line is swept up rather than left at $0.
    expect(items.find((i) => i.label === PLANNED_LINE_LABEL)).toBeUndefined();
    expect(plan.upserts.every((u) => u.budgetItemId === 'item_manual')).toBe(true);
  });

  it('moves both halves of a category together', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1'), matchup('m2', { matchDate: '2026-04-11' })],
      plannedCosts: [cost('m1', 100), cost('m2', 60)],
    });
    const priorFall = contribution('m1', 100);
    const priorSpring = contribution('m2', 60, { id: 'contrib_m2', half: 'spring' });
    const owned = line('LEA', { expensesFall: 100, expensesSpring: 60 });

    const plan = planPlannedCostsPush({
      entries,
      contributions: [priorFall, priorSpring],
      budgetItems: [owned, handWritten()],
      targets: { LEA: 'item_manual' },
    });

    const items = applyPlannedPlanToItems([owned, handWritten()], plan);
    const target = items.find((i) => i.id === 'item_manual');
    expect(target).toMatchObject({ expensesFall: 500, expensesSpring: 60 });
    expect(items.find((i) => i.label === PLANNED_LINE_LABEL)).toBeUndefined();
    expect(plan.netDelta).toBe(0);
  });

  it('leaves a hand-authored line behind even when the move empties it', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 150)] });
    const other = handWritten({ id: 'item_other', label: 'Referees', expensesFall: 150 });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 150, { budgetItemId: 'item_other' })],
      budgetItems: [other, handWritten({ expensesFall: 0 })],
      targets: { LEA: 'item_manual' },
    });

    const items = applyPlannedPlanToItems([other, handWritten({ expensesFall: 0 })], plan);
    expect(items.find((i) => i.id === 'item_other')).toMatchObject({ expensesFall: 0 });
    expect(items.find((i) => i.id === 'item_manual')).toMatchObject({ expensesFall: 150 });
  });

  it('ignores a target from another category', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 150)] });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [],
      budgetItems: [handWritten({ id: 'item_tou', category: 'TOU' })],
      targets: { LEA: 'item_tou' },
    });

    expect(plan.changes[0]).toMatchObject({ category: 'LEA', isNew: true });
  });

  it('re-adds the forecast when the line it was on has been deleted by hand', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 150)] });
    // budget_item_id is nulled, not cascaded, when a line is deleted.
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 150, { budgetItemId: null })],
      budgetItems: [],
    });

    expect(plan.changes[0]).toMatchObject({ isNew: true, delta: 150, to: 150 });
  });
});

describe('planPlannedCostsPush — linking without amending', () => {
  const handWritten = (overrides = {}) => ({
    id: 'item_manual',
    category: 'LEA',
    label: 'League dues',
    income: 0,
    expensesFall: 360,
    expensesSpring: 0,
    ...overrides,
  });

  it('records the link and leaves the line exactly as the treasurer typed it', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 360)] });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [],
      budgetItems: [handWritten()],
      targets: { LEA: 'item_manual' },
      linkOnly: { LEA: true },
    });

    // No change at all — the money is already in that line.
    expect(plan.changes).toHaveLength(0);
    expect(plan.netDelta).toBe(0);
    // But the push must still run, or the link is never written.
    expect(plan.noop).toBe(false);
    expect(plan.upserts).toEqual([
      expect.objectContaining({ matchupId: 'm1', appliedAmount: 360, budgetItemId: 'item_manual' }),
    ]);
    expect(applyPlannedPlanToItems([handWritten()], plan)[0].expensesFall).toBe(360);
  });

  it('is a no-op once the link is already on record', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 360)] });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 360, { budgetItemId: 'item_manual' })],
      budgetItems: [handWritten()],
      targets: { LEA: 'item_manual' },
      linkOnly: { LEA: true },
    });

    expect(plan.noop).toBe(true);
  });

  it('tops the linked line up by the difference when the forecast later grows', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 400)] });
    // The flag is not sticky: a later push maintains the line normally.
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 360, { budgetItemId: 'item_manual' })],
      budgetItems: [handWritten()],
      targets: { LEA: 'item_manual' },
    });

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ from: 360, to: 400, delta: 40 });
  });

  it('still backs the money out of a line it previously fed', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 360)] });
    const owned = line('LEA', { expensesFall: 360 });
    const plan = planPlannedCostsPush({
      entries,
      contributions: [contribution('m1', 360, { budgetItemId: 'item_LEA' })],
      budgetItems: [owned, handWritten()],
      targets: { LEA: 'item_manual' },
      linkOnly: { LEA: true },
    });

    // Linking must not leave the old line funding games the manual line now
    // covers — that is the double-count the whole feature exists to avoid.
    expect(plan.changes).toEqual([expect.objectContaining({ item: owned, delta: -360, to: 0 })]);
    const items = applyPlannedPlanToItems([owned, handWritten()], plan);
    expect(items.find((i) => i.id === 'item_manual').expensesFall).toBe(360);
    expect(items.find((i) => i.label === PLANNED_LINE_LABEL)).toBeUndefined();
  });

  it('ignores the flag when no line was chosen to link to', () => {
    const entries = buildPlannedEntries({ matchups: [matchup('m1')], plannedCosts: [cost('m1', 360)] });
    const plan = planPlannedCostsPush({ entries, contributions: [], budgetItems: [], linkOnly: { LEA: true } });

    expect(plan.changes[0]).toMatchObject({ isNew: true, delta: 360 });
  });
});

describe('plannedCategoryTargets', () => {
  it('reports the forecast per category and the line carrying it', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1'), matchup('m2')],
      plannedCosts: [cost('m1', 100), cost('m2', 50, 'TOU')],
    });

    const rows = plannedCategoryTargets({
      entries,
      contributions: [contribution('m1', 100, { budgetItemId: 'item_manual' })],
    });

    expect(rows).toEqual([
      { category: 'LEA', plannedTotal: 100, appliedTotal: 100, attachedItemId: 'item_manual' },
      { category: 'TOU', plannedTotal: 50, appliedTotal: 0, attachedItemId: null },
    ]);
  });

  it('reports no attachment when a category is split across two lines', () => {
    const entries = buildPlannedEntries({
      matchups: [matchup('m1'), matchup('m2')],
      plannedCosts: [cost('m1', 100), cost('m2', 50)],
    });

    const [row] = plannedCategoryTargets({
      entries,
      contributions: [
        contribution('m1', 100, { budgetItemId: 'item_a' }),
        contribution('m2', 50, { id: 'contrib_m2', budgetItemId: 'item_b' }),
      ],
    });

    expect(row.attachedItemId).toBeNull();
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

describe('costsReadyForLedger', () => {
  const budgeted = (matchupId) => contribution(matchupId, 100, { id: `c_${matchupId}`, matchupId });

  it('offers only budgeted estimates that are not already filed', () => {
    const m1 = matchup('m1');
    const m2 = matchup('m2');
    const ready = costsReadyForLedger({
      plannedCosts: [cost('m1', 100), cost('m1', 50, 'LEA', { id: 'filed', ledgerTxId: 'tx_1' }), cost('m2', 75)],
      matchups: [m1, m2],
      // Only m1 has been pushed into the budget.
      contributions: [budgeted('m1')],
    });

    expect(ready).toEqual([{ cost: expect.objectContaining({ matchupId: 'm1' }), matchup: m1 }]);
  });

  it('skips games that were cancelled or never scheduled', () => {
    const dead = matchup('m1', { status: 'cancelled' });
    const ready = costsReadyForLedger({
      plannedCosts: [cost('m1', 100)],
      matchups: [dead],
      contributions: [budgeted('m1')],
    });

    expect(ready).toEqual([]);
  });

  it('skips zero-amount estimates and orphaned rows', () => {
    const ready = costsReadyForLedger({
      plannedCosts: [cost('m1', 0), cost('gone', 100)],
      matchups: [matchup('m1')],
      contributions: [budgeted('m1')],
    });

    expect(ready).toEqual([]);
  });
});

describe('matchupPlannedTotal', () => {
  it('adds up only the rows for that matchup', () => {
    const costs = [cost('m1', 120), cost('m1', 30, 'OPE'), cost('m2', 999)];
    expect(matchupPlannedTotal('m1', costs)).toBe(150);
  });
});
