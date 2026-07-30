import { supabase } from '../supabase';

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
};
