import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useT } from '../i18n/I18nContext';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { t } = useT();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[200] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 dark:bg-slate-950 text-white text-xs font-semibold shadow-lg">
      <WifiOff size={14} className="shrink-0 text-amber-400" />
      <span>{t('common.offlineNotice', 'You are offline — showing cached data')}</span>
    </div>
  );
}
