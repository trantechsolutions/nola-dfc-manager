import { describe, it, expect } from 'vitest';
import {
  INSTALL_STATE,
  isIOS,
  isSafari,
  isStandalone,
  needsIosManualInstall,
  getInstallState,
} from '../../utils/platform';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

const makeNav = (userAgent, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints });

/** Builds a window stub whose matchMedia reports the given display modes. */
const makeWin = ({ standaloneFlag = undefined, displayModes = [] } = {}) => ({
  navigator: { standalone: standaloneFlag },
  matchMedia: (query) => ({ matches: displayModes.some((mode) => query.includes(mode)) }),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isIOS', () => {
  it('detects iPhone Safari', () => {
    expect(isIOS(makeNav(UA.iphoneSafari))).toBe(true);
  });

  it('detects iPadOS 13+ reporting a Macintosh UA with touch points', () => {
    expect(isIOS(makeNav(UA.ipadOS, 5))).toBe(true);
  });

  it('does not misidentify a real Mac as iOS', () => {
    expect(isIOS(makeNav(UA.macSafari, 0))).toBe(false);
  });

  it('returns false for Android and desktop Chrome', () => {
    expect(isIOS(makeNav(UA.androidChrome))).toBe(false);
    expect(isIOS(makeNav(UA.desktopChrome))).toBe(false);
  });

  it('returns false when navigator is unavailable', () => {
    expect(isIOS(undefined)).toBe(false);
  });
});

describe('isSafari', () => {
  it('is true for Safari proper', () => {
    expect(isSafari(makeNav(UA.iphoneSafari))).toBe(true);
  });

  it('is false for Chrome on iOS, which cannot add to the Home Screen', () => {
    expect(isSafari(makeNav(UA.iphoneChrome))).toBe(false);
  });

  it('is false for Android Chrome despite the Safari UA token', () => {
    expect(isSafari(makeNav(UA.androidChrome))).toBe(false);
  });
});

describe('isStandalone', () => {
  it('is true when iOS sets navigator.standalone', () => {
    expect(isStandalone(makeWin({ standaloneFlag: true }))).toBe(true);
  });

  it('is true when the display-mode media query matches', () => {
    expect(isStandalone(makeWin({ displayModes: ['standalone'] }))).toBe(true);
  });

  it('accepts the minimal-ui fallback declared in display_override', () => {
    expect(isStandalone(makeWin({ displayModes: ['minimal-ui'] }))).toBe(true);
  });

  it('is false in a plain browser tab', () => {
    expect(isStandalone(makeWin())).toBe(false);
  });

  it('is false when matchMedia is unavailable', () => {
    expect(isStandalone({ navigator: {} })).toBe(false);
  });
});

describe('needsIosManualInstall', () => {
  it('is true for iOS in a browser tab — the case where push silently fails', () => {
    expect(needsIosManualInstall({ nav: makeNav(UA.iphoneSafari), win: makeWin() })).toBe(true);
  });

  it('is false once the iOS app is installed to the Home Screen', () => {
    expect(needsIosManualInstall({ nav: makeNav(UA.iphoneSafari), win: makeWin({ standaloneFlag: true }) })).toBe(
      false,
    );
  });

  it('is false on Android, where push works in-tab', () => {
    expect(needsIosManualInstall({ nav: makeNav(UA.androidChrome), win: makeWin() })).toBe(false);
  });
});

describe('getInstallState', () => {
  it('reports INSTALLED when running standalone, even with a deferred prompt', () => {
    expect(
      getInstallState({
        hasDeferredPrompt: true,
        nav: makeNav(UA.androidChrome),
        win: makeWin({ displayModes: ['standalone'] }),
      }),
    ).toBe(INSTALL_STATE.INSTALLED);
  });

  it('reports PROMPTABLE when beforeinstallprompt was captured', () => {
    expect(getInstallState({ hasDeferredPrompt: true, nav: makeNav(UA.androidChrome), win: makeWin() })).toBe(
      INSTALL_STATE.PROMPTABLE,
    );
  });

  it('reports IOS_MANUAL for iOS Safari in a tab', () => {
    expect(getInstallState({ nav: makeNav(UA.iphoneSafari), win: makeWin() })).toBe(INSTALL_STATE.IOS_MANUAL);
  });

  it('reports UNSUPPORTED for Chrome on iOS, which has no install path', () => {
    expect(getInstallState({ nav: makeNav(UA.iphoneChrome), win: makeWin() })).toBe(INSTALL_STATE.UNSUPPORTED);
  });

  it('reports UNSUPPORTED for a desktop browser with no captured prompt', () => {
    expect(getInstallState({ nav: makeNav(UA.desktopChrome), win: makeWin() })).toBe(INSTALL_STATE.UNSUPPORTED);
  });
});
