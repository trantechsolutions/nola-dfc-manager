import { useCallback } from 'react';
import { useData } from '../context/DataContext';
import { logAuditEvent } from '../services/auditService';

/**
 * useImpersonationGuard — blocks write operations when a staff member is
 * impersonating a parent. Returns a `guardedAction` wrapper and a boolean
 * `isReadOnly` flag.
 *
 * Usage:
 *   const { isReadOnly, guardedAction } = useImpersonationGuard(user);
 *   const handleSave = guardedAction(async (data) => { ... });
 *
 * When isReadOnly is true, `guardedAction` no-ops and logs an audit event
 * instead of executing the wrapped function.
 */
export function useImpersonationGuard(user) {
  const { viewingAsParent, impersonatingAs } = useData();

  const guardedAction = useCallback(
    (fn, { action = 'blocked_write', tableName = 'unknown' } = {}) =>
      async (...args) => {
        if (!viewingAsParent) return fn(...args);

        logAuditEvent({
          tableName,
          action: `impersonation_${action}_blocked`,
          changedBy: user?.id,
          metadata: {
            impersonating_player_id: impersonatingAs?.id,
            impersonating_player_name: `${impersonatingAs?.firstName} ${impersonatingAs?.lastName}`,
            blocked_args: JSON.stringify(args).slice(0, 500),
          },
        });
        return { success: false, error: 'read_only_mode' };
      },
    [viewingAsParent, impersonatingAs, user],
  );

  return { isReadOnly: viewingAsParent, guardedAction };
}
