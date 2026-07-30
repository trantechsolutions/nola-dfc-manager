import { useState, useEffect, useCallback, useRef } from 'react';
import { outbox } from '../services/outboxService';

/**
 * useOutbox — surfaces the pending-mutation count and drives replay.
 *
 * iOS PWAs have no Background Sync API, so the queue can only drain while the
 * app is in the foreground. Replay is triggered by `online` (connectivity came
 * back with the tab open) and `visibilitychange` (the user reopened the app,
 * which on iOS is the common case), plus once on mount for anything left over
 * from a previous session.
 */
export function useOutbox() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const next = await outbox.count();
    if (mountedRef.current) setPendingCount(next);
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    if (mountedRef.current) setIsFlushing(true);
    try {
      await outbox.flush();
    } catch {
      // Swallowed deliberately: this runs un-awaited from event handlers, so a
      // rejection would surface as an unhandled promise. Entries that failed
      // for a retryable reason are already rescheduled inside flush(), and the
      // next online/visibility event tries again.
    } finally {
      if (mountedRef.current) setIsFlushing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;

    const handleOnline = () => flush();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') flush();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    // Drain anything queued before this session started.
    refresh();
    flush();

    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flush, refresh]);

  return { pendingCount, isFlushing, flush, refresh };
}
