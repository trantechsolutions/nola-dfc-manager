import { supabase } from '../supabase';
import { normalizeItems } from '../utils/checklist';

const mapChecklist = (row) =>
  row && {
    id: row.id,
    teamId: row.team_id,
    seasonId: row.season_id,
    title: row.title || '',
    items: normalizeItems(row.items),
    isPublished: row.is_published === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };

const mapResponse = (row) =>
  row && {
    id: row.id,
    checklistId: row.checklist_id,
    playerId: row.player_id,
    itemKey: row.item_key,
    completed: row.completed === true,
    value: row.value ?? '',
    documentId: row.document_id,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    verified: row.verified === true,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    updatedAt: row.updated_at,
  };

export const checklistService = {
  /** The one checklist for a (team, season), or null if none has been created. */
  getChecklist: async (teamId, seasonId) => {
    if (!teamId || !seasonId) return null;
    const { data, error } = await supabase
      .from('season_checklists')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .maybeSingle();
    if (error) throw error;
    return mapChecklist(data);
  },

  /**
   * Candidate sources for "Clone from…". Every checklist the caller can read
   * (RLS decides that) minus the one being cloned into, newest season first.
   * Carries the team name so a club admin can tell two teams' lists apart.
   */
  listChecklistSources: async ({ excludeTeamId, excludeSeasonId } = {}) => {
    const { data, error } = await supabase
      .from('season_checklists')
      .select('id, team_id, season_id, title, items, is_published, updated_at, teams(name)')
      .order('season_id', { ascending: false });
    if (error) throw error;
    return (data || [])
      .filter((row) => !(row.team_id === excludeTeamId && row.season_id === excludeSeasonId))
      .map((row) => ({
        ...mapChecklist(row),
        teamName: row.teams?.name || '',
        itemCount: Array.isArray(row.items) ? row.items.length : 0,
      }));
  },

  saveChecklist: async ({ teamId, seasonId, title, items, isPublished, updatedBy }) => {
    const { data, error } = await supabase
      .from('season_checklists')
      .upsert(
        {
          team_id: teamId,
          season_id: seasonId,
          title: title || null,
          items: normalizeItems(items),
          is_published: isPublished === true,
          updated_by: updatedBy || null,
        },
        { onConflict: 'team_id,season_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return mapChecklist(data);
  },

  deleteChecklist: async (checklistId) => {
    const { error } = await supabase.from('season_checklists').delete().eq('id', checklistId);
    if (error) throw error;
  },

  /**
   * Copy another checklist's items into (teamId, seasonId). Items only —
   * responses are never carried across, because a new season means everyone
   * starts from zero. Lands as a draft so the admin can edit before parents see it.
   */
  cloneChecklist: async ({ sourceChecklistId, teamId, seasonId, updatedBy }) => {
    const { data: source, error: readErr } = await supabase
      .from('season_checklists')
      .select('title, items')
      .eq('id', sourceChecklistId)
      .single();
    if (readErr) throw readErr;

    return checklistService.saveChecklist({
      teamId,
      seasonId,
      title: source.title,
      items: source.items,
      isPublished: false,
      updatedBy,
    });
  },

  /** Every response on a checklist — the admin progress matrix. */
  getResponses: async (checklistId) => {
    if (!checklistId) return [];
    const { data, error } = await supabase.from('checklist_responses').select('*').eq('checklist_id', checklistId);
    if (error) throw error;
    return (data || []).map(mapResponse);
  },

  getPlayerResponses: async (checklistId, playerId) => {
    if (!checklistId || !playerId) return [];
    const { data, error } = await supabase
      .from('checklist_responses')
      .select('*')
      .eq('checklist_id', checklistId)
      .eq('player_id', playerId);
    if (error) throw error;
    return (data || []).map(mapResponse);
  },

  /**
   * Record a parent's (or admin's) answer to one item.
   *
   * `completed_at`/`completed_by` are stamped on the transition to done and
   * cleared on the way back, so the timestamp always describes the current state.
   * Verification columns are deliberately absent — the DB trigger in
   * sql/season_checklists_migration.sql would overwrite them for non-staff anyway.
   */
  upsertResponse: async ({ checklistId, playerId, itemKey, completed, value, documentId, userId }) => {
    const isDone = completed === true;
    const { data, error } = await supabase
      .from('checklist_responses')
      .upsert(
        {
          checklist_id: checklistId,
          player_id: playerId,
          item_key: itemKey,
          completed: isDone,
          value: value ?? null,
          document_id: documentId ?? null,
          completed_at: isDone ? new Date().toISOString() : null,
          completed_by: isDone ? userId || null : null,
        },
        { onConflict: 'checklist_id,player_id,item_key' },
      )
      .select()
      .single();
    if (error) throw error;
    return mapResponse(data);
  },

  /**
   * Move one (player, item) to a target `{ completed, verified }` state.
   *
   * Sequencing matters and is easy to get wrong, so it lives here rather than in
   * each caller: the sign-off is dropped BEFORE completion is cleared, so a row
   * can never sit un-completed while still carrying a stale confirmation.
   */
  applyCellState: async ({ checklistId, playerId, itemKey, next, current, userId }) => {
    const wasCompleted = current?.completed === true;
    const wasVerified = current?.verified === true;

    if (wasVerified && !next.verified) {
      await checklistService.setVerification({ checklistId, playerId, itemKey, verified: false, userId });
    }
    if (wasCompleted !== next.completed) {
      await checklistService.upsertResponse({
        checklistId,
        playerId,
        itemKey,
        completed: next.completed,
        // Clearing completion clears the parent's answer with it; keeping it
        // would leave an orphaned value that silently re-satisfies the item.
        value: next.completed ? (current?.value ?? null) : null,
        documentId: next.completed ? (current?.documentId ?? null) : null,
        userId,
      });
    }
    if (!wasVerified && next.verified) {
      await checklistService.setVerification({ checklistId, playerId, itemKey, verified: true, userId });
    }
  },

  /** Staff sign-off. Rejected by the DB trigger for anyone who is not staff. */
  setVerification: async ({ checklistId, playerId, itemKey, verified, userId }) => {
    const isVerified = verified === true;
    const { data, error } = await supabase
      .from('checklist_responses')
      .upsert(
        {
          checklist_id: checklistId,
          player_id: playerId,
          item_key: itemKey,
          verified: isVerified,
          verified_at: isVerified ? new Date().toISOString() : null,
          verified_by: isVerified ? userId || null : null,
        },
        { onConflict: 'checklist_id,player_id,item_key' },
      )
      .select()
      .single();
    if (error) throw error;
    return mapResponse(data);
  },
};
