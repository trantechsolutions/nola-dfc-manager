import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { INSTALL_STATE } from '../../utils/platform';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

// ── Harness ───────────────────────────────────────────────────────────────────

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

const originalUserAgent = navigator.userAgent;
const originalMatchMedia = window.matchMedia;

/** Points navigator.userAgent at a fixture without disturbing other tests. */
function setUserAgent(ua) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

/** matchMedia stub reporting whether the app is running standalone. */
function setStandalone(standalone) {
  window.matchMedia = vi.fn(() => ({
    matches: standalone,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

/** A `beforeinstallprompt`-shaped event with the accept/dismiss choice baked in. */
function makeInstallEvent(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt');
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

beforeEach(() => {
  setUserAgent(ANDROID_UA);
  setStandalone(false);
});

afterEach(() => {
  Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
  window.matchMedia = originalMatchMedia;
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useInstallPrompt', () => {
  it('starts with no prompt available and reports UNSUPPORTED on a bare browser', () => {
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.canPrompt).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.installState).toBe(INSTALL_STATE.UNSUPPORTED);
  });

  it('captures beforeinstallprompt and becomes PROMPTABLE', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });

    await waitFor(() => expect(result.current.canPrompt).toBe(true));
    expect(result.current.installState).toBe(INSTALL_STATE.PROMPTABLE);
  });

  it('suppresses the browser mini-infobar so the prompt fires from our own CTA', () => {
    renderHook(() => useInstallPrompt());
    const event = makeInstallEvent();
    const preventDefault = vi.spyOn(event, 'preventDefault');

    act(() => {
      window.dispatchEvent(event);
    });

    expect(preventDefault).toHaveBeenCalled();
  });

  it('promptInstall opens the native sheet and marks installed on accept', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = makeInstallEvent('accepted');

    act(() => {
      window.dispatchEvent(event);
    });
    await waitFor(() => expect(result.current.canPrompt).toBe(true));

    let choice;
    await act(async () => {
      choice = await result.current.promptInstall();
    });

    expect(event.prompt).toHaveBeenCalled();
    expect(choice.outcome).toBe('accepted');
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.installState).toBe(INSTALL_STATE.INSTALLED);
  });

  it('does not mark installed when the user dismisses the prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(makeInstallEvent('dismissed'));
    });
    await waitFor(() => expect(result.current.canPrompt).toBe(true));

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(result.current.isInstalled).toBe(false);
    // The event is single-use — it must not be reusable after being consumed.
    expect(result.current.canPrompt).toBe(false);
  });

  it('promptInstall is a safe no-op when no prompt was captured', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    let choice;
    await act(async () => {
      choice = await result.current.promptInstall();
    });

    expect(choice).toEqual({ outcome: null });
    expect(result.current.isInstalled).toBe(false);
  });

  it('marks installed when the appinstalled event fires', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    await waitFor(() => expect(result.current.isInstalled).toBe(true));
    expect(result.current.canPrompt).toBe(false);
  });

  it('flags needsManualInstall for iOS in a browser tab', () => {
    setUserAgent(IPHONE_UA);
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.needsManualInstall).toBe(true);
    expect(result.current.installState).toBe(INSTALL_STATE.IOS_MANUAL);
  });

  it('clears needsManualInstall once iOS is running standalone', () => {
    setUserAgent(IPHONE_UA);
    setStandalone(true);
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.needsManualInstall).toBe(false);
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.installState).toBe(INSTALL_STATE.INSTALLED);
  });

  it('never flags needsManualInstall on Android, where push works in-tab', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.needsManualInstall).toBe(false);
  });

  it('detaches its listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useInstallPrompt());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('appinstalled', expect.any(Function));
  });
});
