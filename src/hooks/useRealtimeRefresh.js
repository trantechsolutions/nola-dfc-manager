// src/hooks/useRealtimeRefresh.js
// Subscribes to postgres_changes on a set of tables and re-runs a refresh
// callback on any insert/update/delete, so views stay live without a full
// page reload. See sql/enable_realtime.sql for the required backend setup
// (tables must be in the supabase_realtime publication with REPLICA IDENTITY
// FULL, or filtered events — especially deletes — silently never arrive).

import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';

/**
 * @param {string} channelName - unique per active scope (include ids that scope the subscription)
 * @param {Array<{table: string, filter?: string}>} tables - tables to watch, each with an optional
 *   Postgres filter string (e.g. `team_id=eq.${teamId}`)
 * @param {() => void} onChange - called on any matching insert/update/delete
 * @param {boolean} [enabled] - skip subscribing until scoping ids are known
 */
export function useRealtimeRefresh(channelName, tables, onChange, enabled = true) {
  // Always call the latest onChange, even if it closes over props/state (like
  // selectedSeason) that changed since the channel was opened but don't
  // themselves appear in channelName.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled || !channelName || !tables?.length) return;

    let channel = supabase.channel(channelName);
    tables.forEach(({ table, filter }) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => onChangeRef.current(),
      );
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled]);
}
