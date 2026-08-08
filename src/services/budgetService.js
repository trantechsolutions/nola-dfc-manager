import { supabase } from '../supabase';
import { planEventBudgetPush, applyPlanToItems, EVENT_LINE_LABEL } from '../utils/eventBudgetPush';
import { computeSeasonFee } from '../utils/feeCalculator';

// Unsaved rows carry a client-generated placeholder id (`item_`, `sug_`,
// `clone_`, …) so React can key them before they exist in the database. Only a
// real UUID identifies a persisted row — matching on a prefix denylist missed
// the clone/suggestion prefixes and sent `id: "sug_abc123"` to a uuid column.
const PERSISTED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isPersistedId = (id) => typeof id === 'string' && PERSISTED_ID.test(id);

export const budgetService = {
  getBudgetItems: async (seasonId, teamSeasonId = null) => {
    let query = supabase.from('budget_items').select('*').eq('season_id', seasonId);
    if (teamSeasonId) query = query.eq('team_season_id', teamSeasonId);
    const { data, error } = await query;
    if (error) throw error;
    return data.map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
      teamSeasonId: item.team_season_id,
    }));
  },

  saveBudgetItems: async (seasonId, items, teamSeasonId = null) => {
    // Without a team_season the prune below would sweep every team's items for
    // the season, and the insert would violate budget_items.team_season_id NOT
    // NULL anyway. Fail loudly instead of deleting another team's budget.
    if (!teamSeasonId) throw new Error('saveBudgetItems requires a teamSeasonId');

    // Upsert-then-prune: write all rows first, then remove any rows
    // that are no longer in the set. This prevents a data-loss window
    // that the previous delete-then-insert pattern had.
    const toRow = (item) => ({
      season_id: seasonId,
      team_season_id: teamSeasonId,
      category: item.category,
      label: item.label || '',
      income: item.income || 0,
      expenses_fall: item.expensesFall || 0,
      expenses_spring: item.expensesSpring || 0,
    });

    // Existing and new rows go in separate calls. PostgREST inserts a batch as
    // one statement over the union of the objects' keys, and supabase-js
    // defaults the keys a row is missing to NULL rather than the column
    // default — so a single mixed batch sends `id: null` for every new row and
    // the whole save fails on the primary key. That is the "Save failed." seen
    // when adding an item to a budget that already has saved items.
    const existingRows = [];
    const newRows = [];
    for (const item of items) {
      if (isPersistedId(item.id)) existingRows.push({ id: item.id, ...toRow(item) });
      else newRows.push(toRow(item));
    }

    const persistedIds = [];
    if (existingRows.length > 0) {
      const { data, error } = await supabase
        .from('budget_items')
        .upsert(existingRows, { onConflict: 'id', ignoreDuplicates: false })
        .select('id');
      if (error) throw error;
      persistedIds.push(...data.map((r) => r.id));
    }
    if (newRows.length > 0) {
      const { data, error } = await supabase.from('budget_items').insert(newRows).select('id');
      if (error) throw error;
      persistedIds.push(...data.map((r) => r.id));
    }

    // Delete any rows in the DB that are no longer in this save set
    const { data: existing, error: fetchErr } = await supabase
      .from('budget_items')
      .select('id')
      .eq('season_id', seasonId)
      .eq('team_season_id', teamSeasonId);
    if (fetchErr) throw fetchErr;

    const toDelete = (existing || []).map((r) => r.id).filter((id) => !persistedIds.includes(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from('budget_items').delete().in('id', toDelete);
      if (delErr) throw delErr;
    }
  },

  getBudgetItemsByTeamSeason: async (teamSeasonId) => {
    const { data, error } = await supabase.from('budget_items').select('*').eq('team_season_id', teamSeasonId);
    if (error) throw error;
    return data.map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
      teamSeasonId: item.team_season_id,
    }));
  },

  getAllBudgetItemsForTeam: async (teamId) => {
    // Single query: join budget_items → team_seasons filtered by team_id
    const { data, error } = await supabase
      .from('budget_items')
      .select('*, team_seasons!inner(season_id)')
      .eq('team_seasons.team_id', teamId);
    if (error) throw error;
    return (data || []).map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
      teamSeasonId: item.team_season_id,
      seasonId: item.team_seasons?.season_id || item.season_id,
    }));
  },

  getBudgetAmendments: async (teamSeasonId) => {
    const { data, error } = await supabase
      .from('budget_amendments')
      .select('*')
      .eq('team_season_id', teamSeasonId)
      .order('amended_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((a) => ({
      id: a.id,
      teamSeasonId: a.team_season_id,
      amendmentNumber: a.amendment_number,
      reason: a.reason || '',
      totalExpenses: Number(a.amended_total_expenses),
      totalIncome: Number(a.amended_total_income),
      baseFee: Number(a.amended_base_fee),
      amendedAt: a.amended_at,
    }));
  },

  saveBudgetAmendment: async (amendmentData) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const row = {
      team_season_id: amendmentData.teamSeasonId,
      reason: amendmentData.reason || null,
      amended_total_expenses: amendmentData.totalExpenses,
      amended_total_income: amendmentData.totalIncome,
      amended_base_fee: amendmentData.baseFee,
      amended_by: user?.id || null,
    };
    const { data, error } = await supabase.from('budget_amendments').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  /** What this event has already put into the budget. Drives the delta on re-push. */
  getEventContributions: async (teamSeasonId, eventId) => {
    if (!teamSeasonId || !eventId) return [];
    const { data, error } = await supabase
      .from('budget_event_contributions')
      .select('*')
      .eq('team_season_id', teamSeasonId)
      .eq('event_id', eventId);
    if (error) throw error;
    return (data || []).map(mapContribution);
  },

  /** Every event contribution for a team-season, for the "already budgeted" badges. */
  getContributionsForTeamSeason: async (teamSeasonId) => {
    if (!teamSeasonId) return [];
    const { data, error } = await supabase
      .from('budget_event_contributions')
      .select('*')
      .eq('team_season_id', teamSeasonId);
    if (error) throw error;
    return (data || []).map(mapContribution);
  },

  /**
   * Fold an event's expenses into the season budget, matching each expense's
   * category to that category's event line.
   *
   * Idempotent: the plan moves each line by the difference between what the
   * event totals now and what this event applied last time, so pushing twice
   * does not bill the roster twice. See utils/eventBudgetPush.
   *
   * A finalized budget is not edited silently — the same write is recorded as a
   * budget amendment so the change stays on the record. `recalculateBaseFee`
   * decides whether that amendment also re-derives what each player owes; the
   * caller supplies the fee inputs because the roster/buffer/carryover live on
   * the team_season, not here.
   *
   * @returns {{ applied: boolean, netDelta: number, plan: object, amendmentId: string|null }}
   */
  pushEventToBudget: async ({
    seasonId,
    teamSeasonId,
    eventId,
    expenses = [],
    half = 'fall',
    isFinalized = false,
    recalculateBaseFee = false,
    amendmentReason = '',
    feeInputs = null,
    teamId = null,
  }) => {
    if (!seasonId || !teamSeasonId || !eventId) {
      throw new Error('pushEventToBudget requires seasonId, teamSeasonId and eventId');
    }

    const [budgetItems, contributions] = await Promise.all([
      budgetService.getBudgetItems(seasonId, teamSeasonId),
      budgetService.getEventContributions(teamSeasonId, eventId),
    ]);

    const plan = planEventBudgetPush({ expenses, contributions, budgetItems, half });
    if (plan.noop) return { applied: false, netDelta: 0, plan, amendmentId: null };

    // saveBudgetItems takes the whole set and prunes anything missing from it,
    // so the plan has to be folded into every item, not just the changed ones.
    const nextItems = applyPlanToItems(budgetItems, plan, { seasonId, teamSeasonId });
    await budgetService.saveBudgetItems(seasonId, nextItems, teamSeasonId);

    // Re-read to learn the ids of any line the plan created — saveBudgetItems
    // returns nothing, and a contribution has to point at a real row.
    const savedItems = await budgetService.getBudgetItems(seasonId, teamSeasonId);
    const idFor = (category) => savedItems.find((i) => i.category === category && i.label === EVENT_LINE_LABEL)?.id;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let amendmentId = null;
    if (isFinalized) {
      const totals = savedItems.reduce(
        (acc, i) => ({
          expenses: acc.expenses + (Number(i.expensesFall) || 0) + (Number(i.expensesSpring) || 0),
          income: acc.income + (Number(i.income) || 0),
        }),
        { expenses: 0, income: 0 },
      );

      // Derived here, from the totals AFTER the push — deriving it caller-side
      // would compute the fee from the pre-push expenses and land one push
      // behind. Same formula as the budget screen (utils/feeCalculator), which
      // the player_financials view mirrors.
      const nextBaseFee = computeSeasonFee({
        totalExpenses: totals.expenses,
        bufferPercent: feeInputs?.bufferPercent || 0,
        carryoverAmount: feeInputs?.carryoverAmount || 0,
        rosterSize: feeInputs?.rosterSize || 0,
      }).roundedFee;

      const amendment = await budgetService.saveBudgetAmendment({
        teamSeasonId,
        reason: amendmentReason || 'Event expenses pushed to budget',
        totalExpenses: totals.expenses,
        totalIncome: totals.income,
        // Left at the fee already on record unless the caller asked for a
        // re-derive; raising it changes what every family owes.
        baseFee: recalculateBaseFee ? nextBaseFee : Number(feeInputs?.currentBaseFee) || 0,
      });
      amendmentId = amendment?.id || null;

      // Projected totals are refreshed either way — they describe the budget,
      // not the billing. Only base_fee is gated, because only base_fee is what
      // families are charged.
      const tsUpdate = {
        total_projected_expenses: totals.expenses,
        total_projected_income: totals.income,
        ...(recalculateBaseFee ? { base_fee: nextBaseFee } : {}),
      };
      const { error: tsErr } = await supabase.from('team_seasons').update(tsUpdate).eq('id', teamSeasonId);
      if (tsErr) throw tsErr;
    }

    if (plan.removals.length > 0) {
      const removalIds = plan.removals.map((r) => r.id).filter(Boolean);
      if (removalIds.length > 0) {
        const { error } = await supabase.from('budget_event_contributions').delete().in('id', removalIds);
        if (error) throw error;
      }
    }

    if (plan.upserts.length > 0) {
      const rows = plan.upserts.map((u) => ({
        ...(u.id ? { id: u.id } : {}),
        team_season_id: teamSeasonId,
        event_id: eventId,
        category: u.category,
        half: u.half,
        budget_item_id: u.budgetItemId || idFor(u.category) || null,
        applied_amount: u.appliedAmount,
        applied_at: new Date().toISOString(),
        applied_by: user?.id || null,
        amendment_id: amendmentId,
      }));
      // Conflict on the natural key, not the primary key: a re-push of a
      // category whose row we did not read back still has to update in place.
      const { error } = await supabase
        .from('budget_event_contributions')
        .upsert(rows, { onConflict: 'team_season_id,event_id,category,half' });
      if (error) throw error;
    }

    return { applied: true, netDelta: plan.netDelta, plan, amendmentId, teamId };
  },
};

function mapContribution(row) {
  return {
    id: row.id,
    teamSeasonId: row.team_season_id,
    eventId: row.event_id,
    category: row.category,
    half: row.half,
    budgetItemId: row.budget_item_id,
    appliedAmount: Number(row.applied_amount),
    appliedAt: row.applied_at,
    amendmentId: row.amendment_id,
  };
}
