import { supabase } from '../supabase';

// A series session's uid is its day, so rewriting a series updates the same rows (and keeps their RSVPs).
const sessionUid = (seriesId, day) => `series-${seriesId}-${day}`;

const newUid = () =>
  `app-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

// The events among `ids` that money hangs off (a ledger entry or a budget push). Deleting one would cascade
// away budget records and unlink expenses, so those are cancelled or kept instead.
async function eventsWithMoney(ids) {
  if (!ids.length) return new Set();
  const [{ data: tx, error: txErr }, { data: budget, error: budgetErr }] = await Promise.all([
    supabase.from('transactions').select('event_id').in('event_id', ids),
    supabase.from('budget_event_contributions').select('event_id').in('event_id', ids),
  ]);
  if (txErr) throw txErr;
  if (budgetErr) throw budgetErr;
  return new Set([...(tx || []), ...(budget || [])].map((r) => r.event_id));
}

export const scheduleService = {
  // `source` marks who owns the rows: 'feed' for a regular sync, 'app' for the one-time import when a team
  // switches to running its schedule here (sql/app_schedule_migration.sql). `keepAppEvents` is for a team that
  // runs feed and app together (sql/hybrid_schedule_migration.sql): events added in the app are never matched,
  // overwritten or pruned by the feed.
  syncTeamEvents: async (teamId, events, { source, keepAppEvents = false } = {}) => {
    if (!teamId || !events.length) return 0;

    // Fetch existing rows so we can preserve admin-locked types
    const { data: allExisting } = await supabase
      .from('team_events')
      .select('uid, event_date, event_type, type_locked, source')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });
    const existing = keepAppEvents ? (allExisting || []).filter((e) => e.source !== 'app') : allExisting;
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
        ...(source ? { source } : {}),
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase.from('team_events').upsert(rows, { onConflict: 'team_id,uid' });
    if (error) throw error;

    await scheduleService.pruneStaleUpcomingEvents(
      teamId,
      rows.map((r) => r.uid),
      { keepAppEvents },
    );
    return rows.length;
  },

  // The feed is the source of truth for today onward: anything from today
  // forward that it no longer lists (dropped from the calendar, or left behind
  // by a previous feed URL) is removed. Past events are history and are never
  // touched. Events with money attached (ledger entries or a budget push) are
  // kept — deleting them would cascade away budget contribution records and
  // unlink expenses.
  pruneStaleUpcomingEvents: async (teamId, keepUids, { keepAppEvents = false } = {}) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: upcoming, error } = await supabase
      .from('team_events')
      .select('id, uid, source')
      .eq('team_id', teamId)
      .gte('event_date', startOfToday.toISOString());
    if (error) throw error;

    const keep = new Set(keepUids);
    const staleIds = (upcoming || [])
      .filter((e) => !keep.has(e.uid) && !(keepAppEvents && e.source === 'app'))
      .map((e) => e.id);
    if (!staleIds.length) return 0;

    const linked = await eventsWithMoney(staleIds);

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

  // Columns from sql/event_scores_migration.sql. Null clears a score.
  updateTeamEventScore: async (id, scoreFor, scoreAgainst) => {
    const { error } = await supabase
      .from('team_events')
      .update({ score_for: scoreFor, score_against: scoreAgainst, updated_at: new Date().toISOString() })
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
      // Absent until sql/event_scores_migration.sql has run; null means no result yet.
      scoreFor: e.score_for ?? null,
      scoreAgainst: e.score_against ?? null,
      // Absent until sql/app_schedule_migration.sql has run.
      endDate: e.end_date ?? null,
      arrivalMinutes: e.arrival_minutes ?? null,
      uniform: e.uniform ?? null,
      opponent: e.opponent ?? null,
      isHome: e.is_home ?? null,
      seriesId: e.series_id ?? null,
      seriesDetached: e.series_detached || false,
      source: e.source || 'feed',
    }));
  },

  // ── Events the app runs (teams.schedule_source = 'app') ──
  // `row` is utils/eventSeries.js eventRow(): the columns from the event editor.

  createEvent: async (teamId, row) => {
    const { data, error } = await supabase
      .from('team_events')
      .insert({ ...row, team_id: teamId, uid: newUid() })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  // A session of a series edited on its own leaves the series: later changes to the series skip it.
  updateEvent: async (id, row, { detach = false } = {}) => {
    const { error } = await supabase
      .from('team_events')
      .update({ ...row, ...(detach ? { series_detached: true } : {}) })
      .eq('id', id);
    if (error) throw error;
  },

  setEventCancelled: async (id, isCancelled) => {
    const { error } = await supabase
      .from('team_events')
      .update({ is_cancelled: isCancelled, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /** Deletes an event, unless money hangs off it: then it returns false and the event stays (cancel it instead). */
  deleteEvent: async (id) => {
    if ((await eventsWithMoney([id])).has(id)) return false;
    const { error } = await supabase.from('team_events').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  /**
   * A repeating practice and its sessions.
   * series: { title, eventType, location, weekdays, startTime, endTime, startsOn, endsOn, arrivalMinutes,
   *           uniform, notes, skipBlackouts }
   * sessions: expandSeries(series).sessions; base: eventRow() for the first session (the shared columns).
   */
  createSeries: async (teamId, series, sessions, base) => {
    const { data, error } = await supabase
      .from('team_event_series')
      .insert({
        team_id: teamId,
        title: base.title,
        event_type: base.event_type,
        location: base.location,
        weekdays: series.weekdays,
        start_time: series.startTime,
        end_time: series.endTime || null,
        starts_on: series.startsOn,
        ends_on: series.endsOn,
        arrival_minutes: base.arrival_minutes,
        uniform: base.uniform,
        notes: base.description,
        skip_blackouts: series.skipBlackouts !== false,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
      })
      .select('id')
      .single();
    if (error) throw error;
    await scheduleService.writeSessions(teamId, data.id, sessions, base);
    return data.id;
  },

  /**
   * Changes a series from `fromDay` on: its sessions from then are rewritten to match, sessions it no
   * longer makes are removed (or cancelled, when money hangs off them), and sessions edited on their own
   * are left alone. Earlier sessions are history and stay as they were.
   */
  updateSeries: async (teamId, seriesId, series, sessions, base, fromDay) => {
    const { error } = await supabase
      .from('team_event_series')
      .update({
        title: base.title,
        event_type: base.event_type,
        location: base.location,
        weekdays: series.weekdays,
        start_time: series.startTime,
        end_time: series.endTime || null,
        ends_on: series.endsOn,
        arrival_minutes: base.arrival_minutes,
        uniform: base.uniform,
        notes: base.description,
        skip_blackouts: series.skipBlackouts !== false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', seriesId);
    if (error) throw error;

    const { data: existing, error: exErr } = await supabase
      .from('team_events')
      .select('id, uid, event_date, series_detached')
      .eq('series_id', seriesId);
    if (exErr) throw exErr;
    const from = new Date(`${fromDay}T00:00:00`).getTime();
    const later = (existing || []).filter((e) => new Date(e.event_date).getTime() >= from);
    const detached = new Set(later.filter((e) => e.series_detached).map((e) => e.uid));

    const keep = sessions.filter((s) => s.start.getTime() >= from && !detached.has(sessionUid(seriesId, s.day)));
    await scheduleService.writeSessions(teamId, seriesId, keep, base);

    const wanted = new Set(keep.map((s) => sessionUid(seriesId, s.day)));
    const gone = later.filter((e) => !e.series_detached && !wanted.has(e.uid)).map((e) => e.id);
    await scheduleService.removeSessions(gone);
  },

  /** Ends a series before `fromDay`: its sessions from then are removed (or cancelled, when money hangs off them). */
  endSeries: async (seriesId, fromDay) => {
    const { data, error } = await supabase
      .from('team_events')
      .select('id, event_date')
      .eq('series_id', seriesId)
      .gte('event_date', new Date(`${fromDay}T00:00:00`).toISOString());
    if (error) throw error;
    await scheduleService.removeSessions((data || []).map((e) => e.id));
    const { count } = await supabase
      .from('team_events')
      .select('id', { count: 'exact', head: true })
      .eq('series_id', seriesId);
    if (!count) {
      await supabase.from('team_event_series').delete().eq('id', seriesId);
    } else {
      const lastDay = new Date(`${fromDay}T00:00:00`);
      lastDay.setDate(lastDay.getDate() - 1);
      const pad = (n) => String(n).padStart(2, '0');
      await supabase
        .from('team_event_series')
        .update({ ends_on: `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}` })
        .eq('id', seriesId);
    }
  },

  /** A series as the editor reads it: { id, weekdays, startTime, endTime, startsOn, endsOn, skipBlackouts }. */
  getSeries: async (seriesId) => {
    const { data, error } = await supabase
      .from('team_event_series')
      .select('id, weekdays, start_time, end_time, starts_on, ends_on, skip_blackouts')
      .eq('id', seriesId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      weekdays: data.weekdays || [],
      startTime: (data.start_time || '').slice(0, 5),
      endTime: (data.end_time || '').slice(0, 5),
      startsOn: data.starts_on,
      endsOn: data.ends_on,
      skipBlackouts: data.skip_blackouts !== false,
    };
  },

  writeSessions: async (teamId, seriesId, sessions, base) => {
    const rows = sessions.map((s) => ({
      ...base,
      team_id: teamId,
      uid: sessionUid(seriesId, s.day),
      series_id: seriesId,
      event_date: s.start.toISOString(),
      end_date: s.end ? s.end.toISOString() : null,
      is_cancelled: false,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase
        .from('team_events')
        .upsert(rows.slice(i, i + 100), { onConflict: 'team_id,uid' });
      if (error) throw error;
    }
  },

  removeSessions: async (ids) => {
    if (!ids.length) return;
    const linked = await eventsWithMoney(ids);
    const deletable = ids.filter((id) => !linked.has(id));
    const kept = ids.filter((id) => linked.has(id));
    if (deletable.length) {
      const { error } = await supabase.from('team_events').delete().in('id', deletable);
      if (error) throw error;
    }
    if (kept.length) {
      const { error } = await supabase
        .from('team_events')
        .update({ is_cancelled: true, series_detached: true, updated_at: new Date().toISOString() })
        .in('id', kept);
      if (error) throw error;
    }
  },

  /**
   * The team's own subscribe link (supabase/functions/team-calendar), for a team whose schedule runs here.
   * Null before the migration, or for someone not on the team.
   */
  getCalendarFeedUrl: async (teamId) => {
    if (!teamId) return null;
    const { data, error } = await supabase.rpc('team_calendar_token', { p_team_id: teamId });
    if (error || !data) return null;
    const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    return base ? `${base}/functions/v1/team-calendar?t=${encodeURIComponent(data)}` : null;
  },

  /** Who runs the team's schedule: 'feed' (a calendar feed), 'app' (this app) or 'hybrid' (both). */
  setScheduleSource: async (teamId, source) => {
    const { error } = await supabase.from('teams').update({ schedule_source: source }).eq('id', teamId);
    if (error) throw error;
  },

  // ── RSVPs (event_rsvps) ──

  /** Every answer for these events: [{ eventId, playerId, status, note, updatedAt }]. */
  getRsvps: async (eventIds) => {
    if (!eventIds.length) return [];
    const rows = [];
    for (let i = 0; i < eventIds.length; i += 200) {
      const { data, error } = await supabase
        .from('event_rsvps')
        .select('event_id, player_id, status, note, updated_at')
        .in('event_id', eventIds.slice(i, i + 200));
      if (error) {
        // Before the migration: nobody has answered anything.
        if (['42P01', 'PGRST205'].includes(error.code)) return [];
        throw error;
      }
      rows.push(...(data || []));
    }
    return rows.map((r) => ({
      eventId: r.event_id,
      playerId: r.player_id,
      status: r.status,
      note: r.note,
      updatedAt: r.updated_at,
    }));
  },

  /** Sets a player's answer; null clears it. A "can't go" can carry an optional note (the reason). */
  setRsvp: async (eventId, playerId, status, note = null) => {
    if (!status) {
      const { error } = await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('player_id', playerId);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from('event_rsvps').upsert(
      {
        event_id: eventId,
        player_id: playerId,
        status,
        note: status === 'no' ? note?.trim() || null : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,player_id' },
    );
    if (error) throw error;
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
