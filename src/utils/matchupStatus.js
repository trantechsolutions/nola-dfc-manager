// src/utils/matchupStatus.js
// Status lifecycle for a Matchup (a proposed-or-confirmed game against an
// outside team). Confirming is the one transition with side effects — it's
// what promotes a matchup into team_events — so it's modeled as a single,
// explicit edge rather than something that falls out of date logic.

export const MATCHUP_STATUSES = ['open', 'tentative', 'confirmed', 'dns', 'cancelled'];

const TRANSITIONS = {
  open: ['tentative', 'confirmed', 'dns', 'cancelled'],
  tentative: ['open', 'confirmed', 'dns', 'cancelled'],
  confirmed: ['cancelled'],
  dns: [],
  cancelled: [],
};

/**
 * Can a matchup move from one status to another?
 */
export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * Statuses a matchup can legally move to from its current status.
 */
export function nextStatuses(from) {
  return TRANSITIONS[from] || [];
}

/**
 * A terminal status has no further transitions — reopening play for that
 * week means creating a new matchup (see reschedule_of_id), not un-terminating
 * this one.
 */
export function isTerminal(status) {
  return (TRANSITIONS[status] || []).length === 0;
}

/**
 * Fields to carry over when duplicating a matchup row. Resets status to
 * `open` and drops anything tied to this specific instance (the team_events
 * promotion link, the reschedule chain) so the copy starts a clean
 * negotiation instead of silently sharing state with the original.
 */
export function buildDuplicatePayload(matchup) {
  return {
    teamId: matchup.teamId,
    seasonId: matchup.seasonId,
    weekLabel: matchup.weekLabel,
    status: 'open',
    source: matchup.source,
    isHome: matchup.isHome,
    opponentName: matchup.opponentName,
    leagueMatchId: matchup.leagueMatchId,
    matchDate: matchup.matchDate,
    matchTime: matchup.matchTime,
    location: matchup.location,
    field: matchup.field,
    deadlineDate: matchup.deadlineDate,
    notes: matchup.notes,
  };
}

/**
 * Display metadata for each status, styled to match EVENT_TYPES in
 * eventClassifier.js.
 */
export const MATCHUP_STATUS_META = {
  open: { label: 'Open', colorLight: 'bg-blue-50 text-blue-700', dot: 'bg-blue-400' },
  tentative: { label: 'Tentative', colorLight: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  confirmed: { label: 'Confirmed', colorLight: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400' },
  dns: { label: 'DNS', colorLight: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  cancelled: { label: 'Cancelled', colorLight: 'bg-rose-50 text-rose-700', dot: 'bg-rose-400' },
};
