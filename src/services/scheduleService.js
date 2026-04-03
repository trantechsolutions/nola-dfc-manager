import { supabase } from '../supabase';

export const scheduleService = {
  syncTeamEvents: async (teamId, events) => {
    if (!teamId || !events.length) return 0;

    // Fetch existing rows so we can preserve admin-locked types
    const { data: existing } = await supabase
      .from('team_events')
      .select('uid, event_type, type_locked')
      .eq('team_id', teamId);
    const lockedMap = {};
    (existing || []).forEach((e) => {
      if (e.type_locked) lockedMap[e.uid] = e.event_type;
    });

    const rows = events.map((e) => ({
      team_id: teamId,
      uid: e.id,
      title: e.title,
      description: e.description || null,
      location: e.location || null,
      event_date: new Date(e.timestamp * 1000).toISOString(),
      event_type: lockedMap[e.id] ?? (e.eventType || 'event'),
      type_locked: e.id in lockedMap,
      is_cancelled: e.isCancelled || false,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('team_events').upsert(rows, { onConflict: 'team_id,uid' });
    if (error) throw error;
    return rows.length;
  },

  updateTeamEventType: async (id, newType) => {
    const { error } = await supabase
      .from('team_events')
      .update({ event_type: newType, type_locked: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  getTeamEvents: async (teamId) => {
    if (!teamId) return [];
    const { data, error } = await supabase
      .from('team_events')
      .select('*')
      .eq('team_id', teamId)
      .order('event_date', { ascending: false });
    if (error) throw error;
    return data.map((e) => ({
      id: e.id,
      uid: e.uid,
      teamId: e.team_id,
      title: e.title,
      description: e.description,
      location: e.location,
      eventDate: e.event_date,
      eventType: e.event_type,
      typeLocked: e.type_locked || false,
      isCancelled: e.is_cancelled,
    }));
  },

  getAllBlackouts: async (teamId = null) => {
    let query = supabase.from('blackouts').select('*');
    if (teamId) {
      query = query.or(`team_id.eq.${teamId},team_id.is.null`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data.map((b) => b.date_str);
  },

  saveBlackout: async (dateStr, teamId = null) => {
    const { error } = await supabase
      .from('blackouts')
      .upsert(
        { date_str: dateStr, is_blackout: true, ...(teamId ? { team_id: teamId } : {}) },
        { onConflict: 'date_str' },
      );
    if (error) throw error;
  },

  deleteBlackout: async (dateStr) => {
    const { error } = await supabase.from('blackouts').delete().eq('date_str', dateStr);
    if (error) throw error;
  },
};
