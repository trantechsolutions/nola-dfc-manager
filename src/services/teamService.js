import { supabase } from '../supabase';

export const teamService = {
  getTeams: async (clubId) => {
    const { data, error } = await supabase.from('teams').select('*').eq('club_id', clubId).order('name');
    if (error) throw error;
    return data.map((t) => ({
      id: t.id,
      clubId: t.club_id,
      name: t.name,
      ageGroup: t.age_group,
      gender: t.gender,
      tier: t.tier,
      icalUrl: t.ical_url,
      colorPrimary: t.color_primary,
      colorSecondary: t.color_secondary,
      status: t.status,
      paymentInfo: t.payment_info || '',
    }));
  },

  getTeam: async (teamId) => {
    const { data, error } = await supabase.from('teams').select('*').eq('id', teamId).single();
    if (error) throw error;
    return {
      id: data.id,
      clubId: data.club_id,
      name: data.name,
      ageGroup: data.age_group,
      gender: data.gender,
      tier: data.tier,
      icalUrl: data.ical_url,
      colorPrimary: data.color_primary,
      colorSecondary: data.color_secondary,
      status: data.status,
      paymentInfo: data.payment_info || '',
    };
  },

  createTeam: async (teamData) => {
    const { data, error } = await supabase
      .from('teams')
      .insert({
        club_id: teamData.clubId,
        name: teamData.name,
        age_group: teamData.ageGroup || null,
        gender: teamData.gender || null,
        tier: teamData.tier || null,
        ical_url: teamData.icalUrl || '',
        color_primary: teamData.colorPrimary || '#1e293b',
        color_secondary: teamData.colorSecondary || '#ffffff',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateTeam: async (teamId, updates) => {
    const row = {};
    if ('name' in updates) row.name = updates.name;
    if ('ageGroup' in updates) row.age_group = updates.ageGroup;
    if ('gender' in updates) row.gender = updates.gender;
    if ('tier' in updates) row.tier = updates.tier;
    if ('icalUrl' in updates) row.ical_url = updates.icalUrl;
    if ('colorPrimary' in updates) row.color_primary = updates.colorPrimary;
    if ('colorSecondary' in updates) row.color_secondary = updates.colorSecondary;
    if ('status' in updates) row.status = updates.status;
    if ('paymentInfo' in updates) row.payment_info = updates.paymentInfo;
    const { error } = await supabase.from('teams').update(row).eq('id', teamId);
    if (error) throw error;
  },

  deleteTeam: async (teamId) => {
    // Get all team_seasons for this team
    const { data: tss } = await supabase.from('team_seasons').select('id').eq('team_id', teamId);
    for (const ts of tss || []) {
      await supabase.from('transactions').delete().eq('team_season_id', ts.id);
      await supabase.from('budget_items').delete().eq('team_season_id', ts.id);
      await supabase.from('player_seasons').delete().eq('team_season_id', ts.id);
    }
    await supabase.from('team_seasons').delete().eq('team_id', teamId);
    await supabase.from('team_events').delete().eq('team_id', teamId);
    await supabase.from('blackouts').delete().eq('team_id', teamId);
    await supabase.from('user_roles').delete().eq('team_id', teamId);
    // Delete players and their children
    const { data: players } = await supabase.from('players').select('id').eq('team_id', teamId);
    for (const p of players || []) {
      await supabase.from('guardians').delete().eq('player_id', p.id);
      await supabase.from('documents').delete().eq('player_id', p.id);
      await supabase.from('medical_forms').delete().eq('player_id', p.id);
    }
    if (players?.length) {
      await supabase
        .from('players')
        .delete()
        .in(
          'id',
          players.map((p) => p.id),
        );
    }
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) throw error;
  },

  getTeamSeasons: async (teamId) => {
    const { data, error } = await supabase
      .from('team_seasons')
      .select('*')
      .eq('team_id', teamId)
      .order('season_id', { ascending: false });
    if (error) throw error;
    return data.map((ts) => ({
      id: ts.id,
      teamId: ts.team_id,
      seasonId: ts.season_id,
      isFinalized: ts.is_finalized,
      baseFee: ts.base_fee ? Number(ts.base_fee) : 0,
      bufferPercent: ts.buffer_percent,
      expectedRosterSize: ts.expected_roster_size,
      totalProjectedExpenses: ts.total_projected_expenses ? Number(ts.total_projected_expenses) : null,
      totalProjectedIncome: ts.total_projected_income ? Number(ts.total_projected_income) : null,
    }));
  },

  getTeamSeason: async (teamId, seasonId) => {
    const { data, error } = await supabase
      .from('team_seasons')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      teamId: data.team_id,
      seasonId: data.season_id,
      isFinalized: data.is_finalized,
      baseFee: data.base_fee ? Number(data.base_fee) : 0,
      bufferPercent: data.buffer_percent,
      expectedRosterSize: data.expected_roster_size,
      totalProjectedExpenses: data.total_projected_expenses ? Number(data.total_projected_expenses) : null,
      totalProjectedIncome: data.total_projected_income ? Number(data.total_projected_income) : null,
    };
  },

  saveTeamSeason: async (teamSeasonData) => {
    const row = {
      team_id: teamSeasonData.teamId,
      season_id: teamSeasonData.seasonId,
      is_finalized: teamSeasonData.isFinalized ?? false,
      base_fee: teamSeasonData.baseFee ?? 0,
      buffer_percent: teamSeasonData.bufferPercent ?? 5,
      expected_roster_size: teamSeasonData.expectedRosterSize ?? null,
      total_projected_expenses: teamSeasonData.totalProjectedExpenses ?? null,
      total_projected_income: teamSeasonData.totalProjectedIncome ?? null,
    };
    if (teamSeasonData.id) row.id = teamSeasonData.id;
    const { data, error } = await supabase
      .from('team_seasons')
      .upsert(row, { onConflict: 'team_id,season_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
