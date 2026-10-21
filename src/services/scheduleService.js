import { supabase } from '../supabase';

export const scheduleService = {
  syncTeamEvents: async (teamId, events) => {
    if (!teamId || !events.length) return 0;

    // Fetch existing rows so we can preserve admin-locked types
    const { data: existing } = await supabase
      .from('team_events')
      .select('uid, event_date, event_type, type_locked')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });
    const lockedMap = {};
    (existing || []).forEach((e) => {
      if (e.type_locked) lockedMap[e.uid] = e.event_type;
    });

    // A new feed URL lists the same games under the new provider's UIDs. An
    // incoming event with an unknown UID that starts at the same moment as an
    // existing row is that row's game, so it updates the original (oldest) row
    // in place instead of inserting a duplicate.
    const incomingUids = new Set(events.map((e) => e.id));
    const knownUids = new Set((existing || []).map((e) => e.uid));
    const uidByTime = {};
    (existing || []).forEach((e) => {
      if (incomingUids.has(e.uid) || !e.event_date) return;
      const t = new Date(e.event_date).getTime();
      if (!(t in uidByTime)) uidByTime[t] = e.uid;
    });
    const claimed = new Set();
    const resolveUid = (e) => {
      if (knownUids.has(e.id)) return e.id;
      const match = uidByTime[e.timestamp * 1000];
      if (match && !claimed.has(match)) {
        claimed.add(match);
        return match;
      }
      return e.id;
    };

    const rows = events.map((e) => {
      const uid = resolveUid(e);
      return {
        team_id: teamId,
        uid,
        title: e.title,
        description: e.description || null,
        location: e.location || null,
        event_date: new Date(e.timestamp * 1000).toISOString(),
        event_type: lockedMap[uid] ?? (e.eventType || 'event'),
        type_locked: uid in lockedMap,
        is_cancelled: e.isCancelled || false,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase.from('team_events').upsert(rows, { onConflict: 'team_id,uid' });
    if (error) throw error;

    await scheduleService.pruneStaleUpcomingEvents(
      teamId,
      rows.map((r) => r.uid),
    );
    return rows.length;
  },

  // The feed is the source of truth for today onward: anything from today
  // forward that it no longer lists (dropped from the calendar, or left behind
  // by a previous feed URL) is removed. Past events are history and are never
  // touched. Events with money attached (ledger entries or a budget push) are
  // kept — deleting them would cascade away budget contribution records and
  // unlink expenses.
  pruneStaleUpcomingEvents: async (teamId, keepUids) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: upcoming, error } = await supabase
      .from('team_events')
      .select('id, uid')
      .eq('team_id', teamId)
      .gte('event_date', startOfToday.toISOString());
    if (error) throw error;

    const keep = new Set(keepUids);
    const staleIds = (upcoming || []).filter((e) => !keep.has(e.uid)).map((e) => e.id);
    if (!staleIds.length) return 0;

    const [{ data: txLinks, error: txErr }, { data: budgetLinks, error: budgetErr }] = await Promise.all([
      supabase.from('transactions').select('event_id').in('event_id', staleIds),
      supabase.from('budget_event_contributions').select('event_id').in('event_id', staleIds),
    ]);
    if (txErr) throw txErr;
    if (budgetErr) throw budgetErr;
    const linked = new Set([...(txLinks || []), ...(budgetLinks || [])].map((r) => r.event_id));

    const deletable = staleIds.filter((id) => !linked.has(id));
    if (!deletable.length) return 0;
    const { error: delErr } = await supabase.from('team_events').delete().in('id', deletable);
    if (delErr) throw delErr;
    return deletable.length;
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
