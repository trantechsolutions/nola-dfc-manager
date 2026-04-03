import { supabase } from '../supabase';

export const clubService = {
  getAllClubs: async () => {
    const { data, error } = await supabase.from('clubs').select('*').order('name');
    if (error) throw error;
    return (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      logoUrl: c.logo_url,
      settings: c.settings,
    }));
  },

  createClub: async ({ name, slug }) => {
    const { data, error } = await supabase.from('clubs').insert({ name, slug }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, slug: data.slug };
  },

  deleteClub: async (clubId) => {
    // Get all teams and cascade-delete each one
    const { data: teams } = await supabase.from('teams').select('id').eq('club_id', clubId);
    for (const t of teams || []) {
      // Inline team cascade delete
      const { data: tss } = await supabase.from('team_seasons').select('id').eq('team_id', t.id);
      for (const ts of tss || []) {
        await supabase.from('transactions').delete().eq('team_season_id', ts.id);
        await supabase.from('budget_items').delete().eq('team_season_id', ts.id);
        await supabase.from('player_seasons').delete().eq('team_season_id', ts.id);
      }
      await supabase.from('team_seasons').delete().eq('team_id', t.id);
      await supabase.from('team_events').delete().eq('team_id', t.id);
      await supabase.from('blackouts').delete().eq('team_id', t.id);
      await supabase.from('user_roles').delete().eq('team_id', t.id);
      const { data: players } = await supabase.from('players').select('id').eq('team_id', t.id);
      for (const p of players || []) {
        await supabase.from('guardians').delete().eq('player_id', p.id);
        await supabase.from('documents').delete().eq('player_id', p.id);
        await supabase.from('medical_forms').delete().eq('player_id', p.id);
      }
      if (players?.length)
        await supabase
          .from('players')
          .delete()
          .in(
            'id',
            players.map((p) => p.id),
          );
      await supabase.from('teams').delete().eq('id', t.id);
    }
    // Delete club-level records
    await supabase.from('user_roles').delete().eq('club_id', clubId);
    await supabase.from('custom_categories').delete().eq('club_id', clubId);
    await supabase.from('documents').delete().eq('club_id', clubId);
    const { error } = await supabase.from('clubs').delete().eq('id', clubId);
    if (error) throw error;
  },

  updateClub: async (clubId, updates) => {
    const row = {};
    if ('name' in updates) row.name = updates.name;
    if ('slug' in updates) row.slug = updates.slug;
    if ('logoUrl' in updates) row.logo_url = updates.logoUrl;
    if ('settings' in updates) row.settings = updates.settings;
    const { error } = await supabase.from('clubs').update(row).eq('id', clubId);
    if (error) throw error;
  },

  getClub: async (clubId) => {
    const { data, error } = await supabase.from('clubs').select('*').eq('id', clubId).single();
    if (error) throw error;
    return { id: data.id, name: data.name, slug: data.slug, logoUrl: data.logo_url, settings: data.settings };
  },

  getClubForUser: async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('club_id, clubs(*), team_id, teams(club_id, name)')
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const row = data[0];
    const club = row.clubs || (row.teams ? { id: row.teams.club_id } : null);
    if (!club) return null;
    return { id: club.id, name: club.name, slug: club.slug };
  },
};
