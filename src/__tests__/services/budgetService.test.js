import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Harness ───────────────────────────────────────────────────────────────────

// A stand-in for the PostgREST query builder that records what each save would
// put on the wire. Only the chains budgetService actually uses are modelled:
//   .upsert(rows, opts).select('id')
//   .insert(rows).select('id')
//   .select('id').eq(...).eq(...)
//   .delete().in('id', ids)
const state = vi.hoisted(() => ({ upserts: [], inserts: [], deletes: [], existing: [] }));

vi.mock('../../supabase', () => {
  const ok = (data) => Promise.resolve({ data, error: null });
  return {
    supabase: {
      from: () => ({
        upsert: (rows, options) => {
          state.upserts.push({ rows, options });
          return { select: () => ok(rows.map((r) => ({ id: r.id }))) };
        },
        insert: (rows) => {
          state.inserts.push({ rows });
          return { select: () => ok(rows.map((_, i) => ({ id: `generated-id-${i}` }))) };
        },
        select: () => {
          const query = {
            filters: {},
            eq(column, value) {
              this.filters[column] = value;
              return this;
            },
            then: (resolve, reject) => ok(state.existing).then(resolve, reject),
          };
          state.lastSelect = query;
          return query;
        },
        delete: () => ({
          in: (column, ids) => {
            state.deletes.push({ column, ids });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    },
  };
});

const { budgetService } = await import('../../services/budgetService');

const TEAM_SEASON = '5f1b0c9e-3a2d-4c8b-9e7f-1a2b3c4d5e6f';
const SAVED_ITEM = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const item = (overrides = {}) => ({
  id: `item_${Math.random().toString(36).slice(2, 8)}`,
  category: 'OPE',
  label: 'EQUIPMENT',
  income: 0,
  expensesFall: 200,
  expensesSpring: 0,
  ...overrides,
});

beforeEach(() => {
  state.upserts = [];
  state.inserts = [];
  state.deletes = [];
  state.existing = [];
  state.lastSelect = null;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('saveBudgetItems', () => {
  it('never sends a null id when new items are saved alongside existing ones', async () => {
    // The bug: one batch over the union of keys makes PostgREST write an
    // explicit NULL id for the keyless rows, failing the whole save.
    await budgetService.saveBudgetItems(
      '2026-2027',
      [item({ id: SAVED_ITEM, label: 'REEPLAYER' }), item({ label: 'EQUIPMENT' })],
      TEAM_SEASON,
    );

    const written = [...state.upserts, ...state.inserts].flatMap((call) => call.rows);
    expect(written).toHaveLength(2);
    for (const row of written) {
      expect('id' in row ? row.id : 'absent').not.toBeNull();
    }
    // Each batch is key-uniform, so the union of keys can't introduce an id.
    for (const { rows } of [...state.upserts, ...state.inserts]) {
      const shapes = new Set(rows.map((r) => Object.keys(r).sort().join(',')));
      expect(shapes.size).toBe(1);
    }
  });

  it('updates rows that already exist and inserts the rest', async () => {
    await budgetService.saveBudgetItems(
      '2026-2027',
      [item({ id: SAVED_ITEM, label: 'REEPLAYER', expensesFall: 1200 }), item({ label: 'EQUIPMENT' })],
      TEAM_SEASON,
    );

    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].rows).toEqual([
      {
        id: SAVED_ITEM,
        season_id: '2026-2027',
        team_season_id: TEAM_SEASON,
        category: 'OPE',
        label: 'REEPLAYER',
        income: 0,
        expenses_fall: 1200,
        expenses_spring: 0,
      },
    ]);

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].rows).toHaveLength(1);
    expect(state.inserts[0].rows[0]).not.toHaveProperty('id');
    expect(state.inserts[0].rows[0].label).toBe('EQUIPMENT');
  });

  it.each([
    ['cloned', 'clone_1712000000000_ab12'],
    ['suggested', 'sug_1712000000000_cd34'],
    ['newly added', 'item_1712000000000_ef56'],
  ])('treats a %s item as new rather than sending its placeholder id', async (_label, id) => {
    await budgetService.saveBudgetItems('2026-2027', [item({ id })], TEAM_SEASON);

    expect(state.upserts).toHaveLength(0);
    expect(state.inserts[0].rows[0]).not.toHaveProperty('id');
  });

  it('prunes only rows that dropped out of the save set', async () => {
    const removed = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
    state.existing = [{ id: SAVED_ITEM }, { id: removed }];

    await budgetService.saveBudgetItems('2026-2027', [item({ id: SAVED_ITEM })], TEAM_SEASON);

    expect(state.deletes).toEqual([{ column: 'id', ids: [removed] }]);
  });

  it('keeps rows that were just inserted', async () => {
    state.existing = [{ id: 'generated-id-0' }];

    await budgetService.saveBudgetItems('2026-2027', [item()], TEAM_SEASON);

    expect(state.deletes).toHaveLength(0);
  });

  it('scopes the prune to the team season so other teams keep their budgets', async () => {
    await budgetService.saveBudgetItems('2026-2027', [item()], TEAM_SEASON);

    expect(state.lastSelect.filters).toEqual({
      season_id: '2026-2027',
      team_season_id: TEAM_SEASON,
    });
  });

  it('refuses to run without a team season instead of deleting every team’s items', async () => {
    await expect(budgetService.saveBudgetItems('2026-2027', [], null)).rejects.toThrow(/teamSeasonId/);
    expect(state.deletes).toHaveLength(0);
  });
});
