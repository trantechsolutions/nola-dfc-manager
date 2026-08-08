import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { checklistService } from '../services/checklistService';
import { indexResponses } from '../utils/checklist';
import { useRealtimeRefresh } from './useRealtimeRefresh';

/**
 * Loads the (team, season) checklist and its responses.
 *
 * Pass `playerId` from the parent side to fetch only that player's rows — a
 * guardian's RLS grant covers their own player, and pulling the whole roster's
 * responses would fail the policy silently rather than usefully.
 *
 * The reload is keyed on (teamId, seasonId) so switching season in the picker
 * swaps the whole list, which is the point: every season gets its own.
 */
export function useChecklist({ teamId, seasonId, playerId = null, enabled = true } = {}) {
  const [checklist, setChecklist] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Realtime echoes our own writes straight back. A background refetch must not
  // flip `loading`, or the consumer swaps the whole view for its spinner on
  // every cell click. `silent` keeps the current render on screen while the
  // fresh rows land underneath it.
  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!enabled || !teamId || !seasonId) {
        setChecklist(null);
        setResponses([]);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const found = await checklistService.getChecklist(teamId, seasonId);
        setChecklist(found);
        if (!found) {
          setResponses([]);
          return;
        }
        const rows = playerId
          ? await checklistService.getPlayerResponses(found.id, playerId)
          : await checklistService.getResponses(found.id);
        setResponses(rows);
      } catch (e) {
        setError(e);
        setChecklist(null);
        setResponses([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [enabled, teamId, seasonId, playerId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Held while a batch of writes is in flight. Each write echoes back through
  // realtime, so without this a 40-cell bulk save triggers 40 full refetches
  // that all race the optimistic rows already merged in.
  const batchingRef = useRef(false);

  /** Wrap a run of writes so realtime stays quiet until it finishes. */
  const runBatch = useCallback(
    async (fn) => {
      batchingRef.current = true;
      try {
        return await fn();
      } finally {
        batchingRef.current = false;
        await load({ silent: true });
      }
    },
    [load],
  );

  // Keeps the admin matrix filling in as parents work through the list on their
  // own devices. Scoped to this checklist so one team's traffic doesn't wake
  // another's. See sql/season_checklists_migration.sql for the publication setup.
  useRealtimeRefresh(
    checklist?.id ? `realtime-checklist-${checklist.id}` : null,
    [{ table: 'checklist_responses', filter: `checklist_id=eq.${checklist?.id}` }],
    () => {
      if (batchingRef.current) return;
      load({ silent: true });
    },
    Boolean(checklist?.id),
  );

  const responsesByPlayer = useMemo(() => indexResponses(responses), [responses]);

  /** Merge one server row back in without re-fetching the whole matrix. */
  const applyResponse = useCallback((row) => {
    if (!row) return;
    setResponses((prev) => {
      const idx = prev.findIndex((r) => r.playerId === row.playerId && r.itemKey === row.itemKey);
      if (idx === -1) return [...prev, row];
      const next = prev.slice();
      next[idx] = row;
      return next;
    });
  }, []);

  const saveResponse = useCallback(
    async (args) => {
      const row = await checklistService.upsertResponse({ checklistId: checklist?.id, ...args });
      applyResponse(row);
      return row;
    },
    [checklist?.id, applyResponse],
  );

  const setVerification = useCallback(
    async (args) => {
      const row = await checklistService.setVerification({ checklistId: checklist?.id, ...args });
      applyResponse(row);
      return row;
    },
    [checklist?.id, applyResponse],
  );

  return {
    checklist,
    setChecklist,
    responses,
    responsesByPlayer,
    loading,
    error,
    refresh: load,
    runBatch,
    saveResponse,
    setVerification,
  };
}

export default useChecklist;
