import { supabase } from '../supabase';
import { KeepEntry } from '../film/schema';

// Following a kept game live (sql/live_game_migration.sql): everyone on the team reads the scorekeeper's log.

// A game is live from its first whistle until full time, or until it's gone quiet for three hours (a game the
// scorekeeper never closed).
const QUIET_MS = 3 * 60 * 60 * 1000;

const missing = (error) =>
  ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code) ||
  /keeper_entries|keeper_game_summaries/.test(error?.message || '');

const parse = (raw) => {
  const r = KeepEntry.safeParse(raw);
  return r.success ? r.data : null;
};

export const liveGameService = {
  /**
   * Every kept game on the team, newest first:
   * [{ game, eventId, opponent, gameDate, startedAt, lastAt, finished, score: { us, them }, live }]
   */
  async getSummaries(teamId) {
    if (!teamId) return [];
    const { data, error } = await supabase.rpc('keeper_game_summaries', { p_team_id: teamId });
    if (error) {
      if (missing(error)) return [];
      throw error;
    }
    const now = Date.now();
    return (data || []).map((r) => ({
      game: r.game,
      eventId: r.event_id || null,
      opponent: r.opponent || '',
      gameDate: r.game_date,
      startedAt: r.started_at,
      lastAt: r.last_at,
      finished: !!r.finished,
      score: { us: r.score_us || 0, them: r.score_them || 0 },
      live: !r.finished && !!r.started_at && now - new Date(r.last_at).getTime() < QUIET_MS,
    }));
  },

  /** A game's whole log, in the order it was kept. */
  async getEntries(teamId, game) {
    const { data, error } = await supabase
      .from('keeper_entries')
      .select('entry')
      .eq('team_id', teamId)
      .eq('game', game)
      .order('created_at');
    if (error) throw error;
    return (data || []).map((r) => parse(r.entry)).filter(Boolean);
  },

  /** Calls `onEntry` with each new entry as the scorekeeper logs it. Returns the unsubscribe. */
  subscribe(teamId, game, onEntry) {
    const channel = supabase
      .channel(`live-${teamId}-${game}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'keeper_entries', filter: `game=eq.${game}` },
        (payload) => {
          if (payload.new?.team_id !== teamId) return;
          const e = parse(payload.new.entry);
          if (e) onEntry(e);
        },
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};
