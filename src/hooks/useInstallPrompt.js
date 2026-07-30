import { useState, useEffect, useCallback } from 'react';
import { INSTALL_STATE, getInstallState, isStandalone, needsIosManualInstall } from '../utils/platform';

/**
 * useInstallPrompt — drives the "add this app to your device" flow.
 *
 * Chromium fires `beforeinstallprompt`, which must be captured and deferred so
 * we can trigger the native sheet from our own UI. Safari fires nothing at all,
 * so iOS gets a manual Share → Add to Home Screen walkthrough instead. Both
 * paths converge on a single `installState`.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      // Suppress Chrome's own mini-infobar so the prompt fires from our CTA.
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Launching from the Home Screen after install opens a fresh document, but
    // display-mode can also flip in place — keep the flag honest either way.
    let media;
    const handleDisplayModeChange = (event) => {
      if (event.matches) setIsInstalled(true);
    };
    if (typeof window.matchMedia === 'function') {
      media = window.matchMedia('(display-mode: standalone)');
      media.addEventListener?.('change', handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      media?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  /**
   * Fires the native install sheet. Returns the user's choice, or null when no
   * deferred prompt is available (iOS, or already installed).
   */
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return { outcome: null };
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      // The event is single-use — Chrome re-fires it on a later visit if declined.
      setDeferredPrompt(null);
      if (choice?.outcome === 'accepted') setIsInstalled(true);
      return choice ?? { outcome: null };
    } catch {
      setDeferredPrompt(null);
      return { outcome: null };
    }
  }, [deferredPrompt]);

  const installState = isInstalled ? INSTALL_STATE.INSTALLED : getInstallState({ hasDeferredPrompt: !!deferredPrompt });

  return {
    installState,
    isInstalled,
    canPrompt: !!deferredPrompt,
    promptInstall,
    // True when push cannot work until the user installs manually (iOS in-tab).
    needsManualInstall: !isInstalled && needsIosManualInstall(),
  };
}
