import { supabase } from '../supabase';

export const seasonService = {
  getAllSeasons: async () => {
    const { data, error } = await supabase.from('seasons').select('*').order('id', { ascending: false });
    if (error) throw error;
    return data.map((s) => ({ id: s.id, name: s.name }));
  },

  saveSeason: async (seasonId, data) => {
    const row = {
      id: seasonId,
      name: data.name || seasonId,
    };
    const { error } = await supabase.from('seasons').upsert(row, { onConflict: 'id' });
    if (error) throw error;
  },

  deleteSeason: async (seasonId) => {
    // Delete all child records (no CASCADE on FKs)
    await supabase.from('transactions').delete().eq('season_id', seasonId);
    await supabase.from('budget_items').delete().eq('season_id', seasonId);
    await supabase.from('player_seasons').delete().eq('season_id', seasonId);
    await supabase.from('documents').delete().eq('season_id', seasonId);
    await supabase.from('team_seasons').delete().eq('season_id', seasonId);
    const { error } = await supabase.from('seasons').delete().eq('id', seasonId);
    if (error) throw error;
  },
};
