import { useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import IosInstallSheet from './IosInstallSheet';

const DISMISSED_KEY = 'push_banner_dismissed_v1';
const INSTALL_DISMISSED_KEY = 'install_banner_dismissed_v1';

export default function NotificationPermissionBanner() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const { needsManualInstall, canPrompt, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISSED_KEY));
  const [installDismissed, setInstallDismissed] = useState(() => !!localStorage.getItem(INSTALL_DISMISSED_KEY));
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [error, setError] = useState(null);

  // iOS in a browser tab reports push as unsupported, so the enable-variant can
  // never fire there. Surface an install CTA instead of hiding silently.
  const showInstallVariant = needsManualInstall && !installDismissed;
  const showEnableVariant =
    !needsManualInstall && isSupported && permission === 'default' && !isSubscribed && !dismissed;

  if (!showInstallVariant && !showEnableVariant) return null;

  const handleEnable = async () => {
    setError(null);
    const result = await subscribe();
    if (!result.success && result.error !== 'Permission denied') {
      setError(result.error);
    }
  };

  const handleInstall = async () => {
    // Chromium can open the native sheet directly; Safari has no such API, so
    // iOS falls back to the manual walkthrough.
    if (canPrompt) {
      await promptInstall();
      return;
    }
    setShowIosSheet(true);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const handleInstallDismiss = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    setInstallDismissed(true);
  };

  if (showInstallVariant) {
    return (
      <>
        <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-card border border-border rounded-lg shadow-md p-4 z-[190] animate-in slide-in-from-bottom duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Bell size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Add Cantera to your Home Screen</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Required on iPhone and iPad before alerts for schedule changes and payments can reach you.
              </p>
            </div>
            <button
              onClick={handleInstallDismiss}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors"
            >
              Show me how
            </button>
            <button
              onClick={handleInstallDismiss}
              className="flex-1 bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-semibold py-2 px-3 rounded-lg transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        {showIosSheet && <IosInstallSheet onClose={() => setShowIosSheet(false)} />}
      </>
    );
  }

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-card border border-border rounded-lg shadow-md p-4 z-[190] animate-in slide-in-from-bottom duration-300">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Bell size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Enable Notifications</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get alerts for schedule changes, payments, and team updates.
          </p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-muted-foreground shrink-0">
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleEnable}
          disabled={isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors"
        >
          {isLoading ? 'Enabling…' : 'Enable'}
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-semibold py-2 px-3 rounded-lg transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
