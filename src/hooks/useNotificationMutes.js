import { useCallback, useEffect, useState } from 'react';
import { notificationPrefs } from '../services/notificationPrefs';

/** This person's muted notification scopes, with a switch that flips one straight away and saves behind it. */
export function useNotificationMutes(enabled = true) {
  const [muted, setMuted] = useState(() => new Set());

  useEffect(() => {
    let live = true;
    if (!enabled) return undefined;
    notificationPrefs.list().then(
      (set) => live && setMuted(set),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [enabled]);

  const toggle = useCallback(async (scope, on) => {
    const flip = (value) =>
      setMuted((prev) => {
        const next = new Set(prev);
        if (value) next.add(scope);
        else next.delete(scope);
        return next;
      });
    flip(on);
    try {
      await notificationPrefs.setMuted(scope, on);
    } catch {
      flip(!on);
    }
  }, []);

  return { muted, toggle };
}
