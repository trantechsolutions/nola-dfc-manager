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
    // Delete existing items scoped to this context
    let delQuery = supabase.from('budget_items').delete().eq('season_id', seasonId);
    if (teamSeasonId) delQuery = delQuery.eq('team_season_id', teamSeasonId);
    await delQuery;

    if (items.length > 0) {
      const rows = items.map((item) => ({
        season_id: seasonId,
        category: item.category,
        label: item.label,
        income: item.income || 0,
        expenses_fall: item.expensesFall || 0,
        expenses_spring: item.expensesSpring || 0,
        ...(teamSeasonId ? { team_season_id: teamSeasonId } : {}),
      }));
      const { error } = await supabase.from('budget_items').insert(rows);
      if (error) throw error;
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
    // Get all team_season IDs for this team first
    const { data: tsData, error: tsErr } = await supabase
      .from('team_seasons')
      .select('id, season_id')
      .eq('team_id', teamId);
    if (tsErr) throw tsErr;
    if (!tsData || tsData.length === 0) return [];

    const tsIds = tsData.map((ts) => ts.id);
    const tsMap = Object.fromEntries(tsData.map((ts) => [ts.id, ts.season_id]));

    const { data, error } = await supabase.from('budget_items').select('*').in('team_season_id', tsIds);
    if (error) throw error;
    return data.map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
      teamSeasonId: item.team_season_id,
      seasonId: tsMap[item.team_season_id] || item.season_id,
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
