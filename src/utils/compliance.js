// Season compliance.
//
// A player is IN COMPLIANCE for a season when every REQUIRED item on that
// season's checklist is satisfied. The checklist is the definition — see
// sql/season_checklists_migration.sql and ./checklist.js.
//
// The staff switches for medical release / ReePlayer waiver / club registration
// are gone — PlayerModal and RosterManagement render PlayerCompliancePanel, the
// admin mirror of what the parent sees. Teams express those as checklist items
// now, so the list follows what they actually ask for each season.
//
// player_seasons.medical_release survives as DATA, not as a switch: the in-app
// medical form writes it, and an item carrying `linkedForm: 'medical_release'`
// reads it (see formStatusForPlayer). getCompliance() below is what reads those
// raw flags; nothing derives "compliant" from them any more.
// reeplayer_waiver / club_registration are no longer written by any UI.

import {
  computeChecklistSummary,
  formStatusByPlayer,
  indexResponses,
  isItemSatisfied,
  isAwaitingVerification,
} from './checklist';

/** Per-item status for one player, as the admin panels render it. */
export const ITEM_STATUS = {
  COMPLETE: 'complete',
  AWAITING: 'awaiting',
  INCOMPLETE: 'incomplete',
};

/**
 * The raw per-season flags for a player. Still the source of truth for the
 * medical release (which the in-app form writes) and for the two staff-set
 * toggles — just no longer the definition of compliance.
 */
export function getCompliance(player, seasonId) {
  const sp = (seasonId && player?.seasonProfiles?.[seasonId]) || {};
  return {
    medicalRelease: sp.medicalRelease === true,
    reePlayerWaiver: sp.reePlayerWaiver === true,
    clubRegistration: sp.clubRegistration === true,
  };
}

/**
 * Roll a season's checklist up into the compliance shape every roster view reads.
 *
 * Pass the checklist items and response rows for ONE (team, season); players
 * should be that season's roster. The result is a plain object so consumers can
 * hold it in context and index it per player without recomputing.
 *
 * A season with no checklist yields `hasChecklist: false` and marks everyone
 * compliant: nothing has been asked of anyone yet, and a brand-new season should
 * not paint the whole roster red before an admin has authored a single item.
 */
export function buildCompliance({ items = [], responses = [], players = [], seasonId, today } = {}) {
  const formsByPlayer = formStatusByPlayer(players, seasonId);
  const summary = computeChecklistSummary(items, players, responses, {
    ...(today ? { today } : {}),
    formsByPlayer,
  });

  const requiredItems = summary.items.filter((item) => item.required);

  return {
    hasChecklist: summary.items.length > 0,
    items: summary.items,
    requiredItems,
    // Per-item counts across the roster, for the breakdown tiles that used to
    // read "medical / ReePlayer / club registration".
    perItem: summary.perItem,
    byPlayer: summary.progressByPlayer,
    // Kept on the index so the per-player admin panels can render each item's
    // own state without refetching or recomputing the whole roster.
    responsesByPlayer: indexResponses(responses),
    formsByPlayer,
    compliantCount: summary.playersComplete,
    total: summary.playerCount,
    pct: summary.pct,
  };
}

/** An empty index — the shape consumers get before the checklist has loaded. */
export const EMPTY_COMPLIANCE = {
  hasChecklist: false,
  items: [],
  requiredItems: [],
  perItem: [],
  byPlayer: {},
  responsesByPlayer: {},
  formsByPlayer: {},
  compliantCount: 0,
  total: 0,
  pct: 0,
};

/**
 * Is this player compliant, given a built index?
 *
 * Defaults to true for a player the index has never heard of — an unknown
 * player is one the checklist has asked nothing of, which is the same reasoning
 * as the no-checklist case above. Callers wanting "has outstanding work" should
 * read `outstandingFor` instead of negating this.
 */
export function isCompliant(compliance, playerId) {
  const progress = compliance?.byPlayer?.[playerId];
  return progress ? progress.complete : true;
}

/** Required items this player still owes, newest-authored order preserved. */
export function outstandingFor(compliance, playerId) {
  const progress = compliance?.byPlayer?.[playerId];
  if (!progress) return [];
  return progress.outstanding.filter((item) => item.required);
}

/** Progress for one player, or a benign zero-state if they are not indexed. */
export function progressFor(compliance, playerId) {
  return (
    compliance?.byPlayer?.[playerId] || {
      total: 0,
      requiredTotal: 0,
      requiredDone: 0,
      pct: 100,
      complete: true,
      outstanding: [],
      overdue: [],
      awaitingVerification: [],
    }
  );
}

/** The response row backing one player's item, if any. */
export function responseFor(compliance, playerId, itemKey) {
  return compliance?.responsesByPlayer?.[playerId]?.[itemKey];
}

/** Linked-form completion for one player, e.g. `{ medical_release: true }`. */
export function formsFor(compliance, playerId) {
  return compliance?.formsByPlayer?.[playerId] || {};
}

/**
 * How one item reads for one player: complete, awaiting a staff sign-off, or
 * still outstanding. Drives the per-player compliance panels on the admin side.
 */
export function itemStatusFor(compliance, playerId, item) {
  const response = responseFor(compliance, playerId, item?.key);
  const forms = formsFor(compliance, playerId);
  if (isItemSatisfied(item, response, forms)) return ITEM_STATUS.COMPLETE;
  if (isAwaitingVerification(item, response, forms)) return ITEM_STATUS.AWAITING;
  return ITEM_STATUS.INCOMPLETE;
}
