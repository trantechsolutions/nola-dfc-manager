// Platform & install-state detection for the PWA install / push-opt-in flow.
//
// Why this exists: on iOS, Web Push only works once the app has been added to
// the Home Screen (iOS 16.4+). In a normal Safari tab `window.PushManager` is
// absent, so pushService.isSupported() returns false and the notification CTA
// silently disappears — the user is never told that installing is the fix.
// These helpers let the UI distinguish "can't do push" from "can't do push yet".
//
// Every function takes optional `nav` / `win` overrides so they stay pure and
// testable without mutating real globals.

export const INSTALL_STATE = {
  INSTALLED: 'installed', // already running from the Home Screen / app window
  IOS_MANUAL: 'ios-manual', // iOS browser tab — requires Share → Add to Home Screen
  PROMPTABLE: 'promptable', // beforeinstallprompt was captured, we can prompt
  UNSUPPORTED: 'unsupported', // no install path available in this browser
};

/**
 * True on iPhone/iPad/iPod. iPadOS 13+ reports a desktop "Macintosh" UA, so it
 * is detected via touch points — a real Mac reports maxTouchPoints of 0.
 */
export function isIOS(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

/**
 * True for Safari proper — excludes Chrome/Firefox/Edge on iOS, which are
 * Safari-shelled but expose their own UA tokens and cannot install to the
 * Home Screen at all.
 */
export function isSafari(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Android/.test(ua);
}

/**
 * True when the app is running as an installed PWA rather than a browser tab.
 * `navigator.standalone` is the iOS signal; the display-mode media queries
 * cover Android/desktop and the `minimal-ui` / `fullscreen` fallbacks declared
 * in manifest.json's display_override.
 */
export function isStandalone(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return false;
  if (win.navigator?.standalone === true) return true;
  if (typeof win.matchMedia !== 'function') return false;
  return ['standalone', 'minimal-ui', 'fullscreen'].some((mode) => {
    try {
      return win.matchMedia(`(display-mode: ${mode})`).matches;
    } catch {
      return false;
    }
  });
}

/**
 * iOS users in a browser tab cannot receive Web Push until they install. This
 * is the specific "not yet" case the UI must explain rather than hide.
 */
export function needsIosManualInstall({ nav, win } = {}) {
  return isIOS(nav) && !isStandalone(win);
}

/**
 * Collapses the platform signals into a single state the UI can switch on.
 * `hasDeferredPrompt` comes from a captured `beforeinstallprompt` event.
 */
export function getInstallState({ hasDeferredPrompt = false, nav, win } = {}) {
  if (isStandalone(win)) return INSTALL_STATE.INSTALLED;
  if (hasDeferredPrompt) return INSTALL_STATE.PROMPTABLE;
  if (isIOS(nav) && isSafari(nav)) return INSTALL_STATE.IOS_MANUAL;
  return INSTALL_STATE.UNSUPPORTED;
}
