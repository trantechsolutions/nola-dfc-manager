import { useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

const DISMISSED_KEY = 'push_banner_dismissed_v1';

export default function NotificationPermissionBanner() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISSED_KEY));
  const [error, setError] = useState(null);

  // Don't show if: not supported, already granted/denied, already subscribed, or dismissed
  const shouldShow = isSupported && permission === 'default' && !isSubscribed && !dismissed;

  if (!shouldShow) return null;

  const handleEnable = async () => {
    setError(null);
    const result = await subscribe();
    if (!result.success && result.error !== 'Permission denied') {
      setError(result.error);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 z-[190] animate-in slide-in-from-bottom duration-300">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <Bell size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white">Enable Notifications</p>
          <p className="text-xs text-slate-400 mt-0.5">Get alerts for schedule changes, payments, and team updates.</p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
        <button onClick={handleDismiss} className="text-slate-500 hover:text-slate-300 shrink-0">
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleEnable}
          disabled={isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black py-2 px-3 rounded-xl transition-colors"
        >
          {isLoading ? 'Enabling…' : 'Enable'}
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 px-3 rounded-xl transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
