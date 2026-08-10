import { supabase } from '../supabase';
import { canTransition, buildDuplicatePayload } from '../utils/matchupStatus';
import { financeService } from './financeService';

const mapMatchup = (m) => ({
  id: m.id,
  teamId: m.team_id,
  seasonId: m.season_id,
  weekLabel: m.week_label,
  status: m.status,
  source: m.source,
  isHome: m.is_home,
  opponentName: m.opponent_name,
  leagueMatchId: m.league_match_id,
  matchDate: m.match_date,
  matchTime: m.match_time,
  location: m.location,
  field: m.field,
  deadlineDate: m.deadline_date,
  notes: m.notes,
  promotedEventId: m.promoted_event_id,
  rescheduleOfId: m.reschedule_of_id,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
});

const toRow = (m) => ({
  ...(m.teamId !== undefined ? { team_id: m.teamId } : {}),
  ...(m.seasonId !== undefined ? { season_id: m.seasonId } : {}),
  ...(m.weekLabel !== undefined ? { week_label: m.weekLabel } : {}),
  ...(m.status !== undefined ? { status: m.status } : {}),
  ...(m.source !== undefined ? { source: m.source } : {}),
  ...(m.isHome !== undefined ? { is_home: m.isHome } : {}),
  ...(m.opponentName !== undefined ? { opponent_name: m.opponentName } : {}),
  ...(m.leagueMatchId !== undefined ? { league_match_id: m.leagueMatchId } : {}),
  ...(m.matchDate !== undefined ? { match_date: m.matchDate } : {}),
  ...(m.matchTime !== undefined ? { match_time: m.matchTime } : {}),
  ...(m.location !== undefined ? { location: m.location } : {}),
  ...(m.field !== undefined ? { field: m.field } : {}),
  ...(m.deadlineDate !== undefined ? { deadline_date: m.deadlineDate } : {}),
  ...(m.notes !== undefined ? { notes: m.notes } : {}),
  ...(m.promotedEventId !== undefined ? { promoted_event_id: m.promotedEventId } : {}),
  ...(m.rescheduleOfId !== undefined ? { reschedule_of_id: m.rescheduleOfId } : {}),
});

const mapPlannedCost = (c) => ({
  id: c.id,
  matchupId: c.matchup_id,
  category: c.category,
  label: c.label || '',
  amount: Number(c.amount) || 0,
  ledgerTxId: c.ledger_tx_id || null,
});

export const matchupService = {
  getMatchups: async (teamId, seasonId) => {
    if (!teamId || !seasonId) return [];
    const { data, error } = await supabase
      .from('matchups')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .order('match_date', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return (data || []).map(mapMatchup);
  },

  createMatchup: async (matchupData) => {
    const row = toRow({ source: 'league_assigned', status: 'open', ...matchupData });
    const { data, error } = await supabase.from('matchups').insert(row).select().single();
    if (error) throw error;
    return mapMatchup(data);
  },

  updateMatchup: async (id, updates) => {
    const { data, error } = await supabase.from('matchups').update(toRow(updates)).eq('id', id).select().single();
    if (error) throw error;
    return mapMatchup(data);
  },

  deleteMatchup: async (id) => {
    const { error } = await supabase.from('matchups').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Expected costs entered on the planner, for every matchup in a team-season.
   *
   * Fetched by (team, season) rather than per matchup so the planner can render
   * every row's estimate without a query per game. The inner join keeps the RLS
   * story identical to matchups themselves.
   */
  getPlannedCosts: async (teamId, seasonId) => {
    if (!teamId || !seasonId) return [];
    const { data, error } = await supabase
      .from('matchup_planned_costs')
      .select('*, matchups!inner(team_id, season_id)')
      .eq('matchups.team_id', teamId)
      .eq('matchups.season_id', seasonId);
    if (error) throw error;
    return (data || []).map(mapPlannedCost);
  },

  createPlannedCost: async ({ matchupId, category = 'OPE', label = '', amount = 0 }) => {
    const { data, error } = await supabase
      .from('matchup_planned_costs')
      .insert({ matchup_id: matchupId, category, label, amount })
      .select()
      .single();
    if (error) throw error;
    return mapPlannedCost(data);
  },

  updatePlannedCost: async (id, updates) => {
    const row = {
      ...(updates.category !== undefined ? { category: updates.category } : {}),
      ...(updates.label !== undefined ? { label: updates.label } : {}),
      ...(updates.amount !== undefined ? { amount: updates.amount } : {}),
    };
    const { data, error } = await supabase.from('matchup_planned_costs').update(row).eq('id', id).select().single();
    if (error) throw error;
    return mapPlannedCost(data);
  },

  deletePlannedCost: async (id) => {
    const { error } = await supabase.from('matchup_planned_costs').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * File an estimate in the ledger as a PENDING expense.
   *
   * The row lands uncleared on purpose: uncleared transactions are excluded
   * from every balance, actuals and player-fee calculation in the app, so a
   * forecast that has been budgeted can sit in the ledger waiting for the
   * treasurer to confirm it actually happened. No account is chosen either —
   * that is part of approving it, since nobody knows yet which account will pay.
   *
   * The estimate keeps the transaction id, so the action can only be taken once.
   * If the treasurer later deletes that transaction the link nulls itself and
   * the estimate offers the action again.
   */
  addPlannedCostToLedger: async ({ cost, matchup, seasonId, teamSeasonId, title, date }) => {
    if (!cost?.id || !seasonId) throw new Error('addPlannedCostToLedger requires a cost and a season');

    const amount = Math.abs(Number(cost.amount) || 0);
    if (amount === 0) throw new Error('Cannot file a $0 estimate in the ledger');

    const tx = await financeService.addTransaction({
      seasonId,
      teamSeasonId: teamSeasonId || null,
      title,
      // Expenses are stored negative, same as every other spend row.
      amount: -amount,
      date: date || matchup?.matchDate || new Date().toISOString().split('T')[0],
      category: cost.category || 'OPE',
      // Only a confirmed matchup has an event to hang the expense on; before
      // that the row stands on its own until the game is promoted.
      eventId: matchup?.promotedEventId || null,
      cleared: false,
    });

    const { data, error } = await supabase
      .from('matchup_planned_costs')
      .update({ ledger_tx_id: tx.id })
      .eq('id', cost.id)
      .select()
      .single();
    if (error) throw error;

    return { transaction: tx, cost: mapPlannedCost(data) };
  },

  /**
   * Clones a matchup as a fresh, open negotiation row — see
   * buildDuplicatePayload for exactly what does and doesn't carry over.
   */
  duplicateMatchup: async (matchup) => {
    return matchupService.createMatchup(buildDuplicatePayload(matchup));
  },

  /**
   * Sets a matchup's status, enforcing the lifecycle rules in matchupStatus.js.
   * Throws if the transition isn't legal instead of silently writing bad state.
   */
  setMatchupStatus: async (matchup, newStatus) => {
    if (!canTransition(matchup.status, newStatus)) {
      throw new Error(`Cannot move matchup from "${matchup.status}" to "${newStatus}"`);
    }
    return matchupService.updateMatchup(matchup.id, { status: newStatus });
  },

  /**
   * Confirms a matchup and promotes it into team_events — the one moment a
   * negotiation row becomes the real, parent-facing schedule entry. Uses a
   * stable uid derived from the matchup id so re-confirming (e.g. after
   * editing date/time) upserts the same team_events row instead of creating
   * a duplicate.
   */
  confirmMatchup: async (matchup, { title } = {}) => {
    if (!canTransition(matchup.status, 'confirmed')) {
      throw new Error(`Cannot confirm a matchup in status "${matchup.status}"`);
    }
    if (!matchup.matchDate) {
      throw new Error('Cannot confirm a matchup with no date set');
    }

    const uid = `matchup-${matchup.id}`;
    const eventDate = matchup.matchTime ? `${matchup.matchDate}T${matchup.matchTime}` : matchup.matchDate;
    const eventTitle =
      title ||
      (matchup.opponentName
        ? `${matchup.isHome === false ? 'Away' : 'Home'} vs ${matchup.opponentName}`
        : 'League Game');

    const { data: eventRow, error: eventError } = await supabase
      .from('team_events')
      .upsert(
        {
          team_id: matchup.teamId,
          uid,
          title: eventTitle,
          description: matchup.notes || null,
          location: [matchup.location, matchup.field].filter(Boolean).join(' — ') || null,
          event_date: new Date(eventDate).toISOString(),
          event_type: matchup.source === 'self_scheduled' ? 'friendly' : 'league',
          type_locked: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'team_id,uid' },
      )
      .select()
      .single();
    if (eventError) throw eventError;

    return matchupService.updateMatchup(matchup.id, { status: 'confirmed', promotedEventId: eventRow.id });
  },

  /**
   * Rainout / postponement flow for a confirmed matchup: marks the original
   * cancelled and spawns a fresh open matchup carrying the same opponent/
   * home-away/source forward, linked back via reschedule_of_id so the
   * negotiation history isn't lost.
   */
  rescheduleMatchup: async (matchup) => {
    if (matchup.status !== 'confirmed') {
      throw new Error('Only a confirmed matchup can be rescheduled');
    }
    await matchupService.updateMatchup(matchup.id, { status: 'cancelled' });
    return matchupService.createMatchup({
      teamId: matchup.teamId,
      seasonId: matchup.seasonId,
      weekLabel: matchup.weekLabel,
      status: 'open',
      source: matchup.source,
      isHome: matchup.isHome,
      opponentName: matchup.opponentName,
      rescheduleOfId: matchup.id,
    });
  },
};
