import { supabase } from '../supabase';

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
    // Upsert-then-prune: write all rows first, then remove any rows
    // that are no longer in the set. This prevents a data-loss window
    // that the previous delete-then-insert pattern had.
    const rows = items.map((item) => ({
      ...(item.id && !item.id.startsWith('item_') ? { id: item.id } : {}),
      season_id: seasonId,
      category: item.category,
      label: item.label,
      income: item.income || 0,
      expenses_fall: item.expensesFall || 0,
      expenses_spring: item.expensesSpring || 0,
      ...(teamSeasonId ? { team_season_id: teamSeasonId } : {}),
    }));

    let persistedIds = [];
    if (rows.length > 0) {
      const { data, error } = await supabase
        .from('budget_items')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
        .select('id');
      if (error) throw error;
      persistedIds = data.map((r) => r.id);
    }

    // Delete any rows in the DB that are no longer in this save set
    let existingQuery = supabase.from('budget_items').select('id').eq('season_id', seasonId);
    if (teamSeasonId) existingQuery = existingQuery.eq('team_season_id', teamSeasonId);
    const { data: existing, error: fetchErr } = await existingQuery;
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
