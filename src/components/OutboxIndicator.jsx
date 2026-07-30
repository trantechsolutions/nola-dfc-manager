import { CloudUpload, RefreshCw } from 'lucide-react';
import { useOutbox } from '../hooks/useOutbox';
import { useT } from '../i18n/I18nContext';

/**
 * Shows how many edits are waiting to reach the server. Without this, a write
 * made offline looks identical to one that saved — the user has no way to tell
 * that closing the app would strand it.
 *
 * Sits above OfflineBanner so the two can coexist while offline.
 */
export default function OutboxIndicator() {
  const { pendingCount, isFlushing, flush } = useOutbox();
  const { t } = useT();

  if (pendingCount === 0) return null;

  return (
    <button
      onClick={flush}
      disabled={isFlushing}
      className="fixed bottom-11 inset-x-0 z-[200] flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-amber-950 text-xs font-semibold shadow-lg disabled:opacity-80"
    >
      {isFlushing ? (
        <RefreshCw size={13} className="shrink-0 animate-spin" />
      ) : (
        <CloudUpload size={13} className="shrink-0" />
      )}
      <span>
        {isFlushing
          ? t('common.outboxSyncing', 'Syncing changes…')
          : t('common.outboxPending', '{{count}} change(s) waiting to sync').replace('{{count}}', pendingCount)}
      </span>
    </button>
  );
}
