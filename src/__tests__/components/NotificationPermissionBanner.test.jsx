// Guards the iOS gating logic: in a Safari tab, PushManager is absent so
// isSupported() is false, and before this gating existed the banner rendered
// nothing at all — iPhone users were never told installing is what unlocks
// alerts. These tests pin that behaviour down.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUsePush = vi.fn();
const mockUseInstall = vi.fn();

vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: () => mockUsePush(),
}));
vi.mock('../../hooks/useInstallPrompt', () => ({
  useInstallPrompt: () => mockUseInstall(),
}));

import { I18nProvider } from '../../i18n/I18nContext';
import NotificationPermissionBanner from '../../components/NotificationPermissionBanner';

// ── Harness ───────────────────────────────────────────────────────────────────

const subscribe = vi.fn().mockResolvedValue({ success: true });
const promptInstall = vi.fn().mockResolvedValue({ outcome: 'accepted' });

function setPush(overrides = {}) {
  mockUsePush.mockReturnValue({
    isSupported: true,
    permission: 'default',
    isSubscribed: false,
    isLoading: false,
    subscribe,
    ...overrides,
  });
}

function setInstall(overrides = {}) {
  mockUseInstall.mockReturnValue({
    needsManualInstall: false,
    canPrompt: false,
    promptInstall,
    installState: 'unsupported',
    isInstalled: false,
    ...overrides,
  });
}

const renderBanner = () =>
  render(
    <I18nProvider>
      <NotificationPermissionBanner />
    </I18nProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setPush();
  setInstall();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('enable variant', () => {
  it('offers to enable notifications when push is available and unasked', () => {
    renderBanner();
    expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
  });

  it('subscribes when Enable is tapped', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /^enable$/i }));
    await waitFor(() => expect(subscribe).toHaveBeenCalled());
  });

  it('stays hidden once permission has already been answered', () => {
    setPush({ permission: 'granted' });
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden when the user is already subscribed', () => {
    setPush({ isSubscribed: true });
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden where push is unsupported and no install path exists', () => {
    setPush({ isSupported: false });
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('does not reappear after being dismissed', async () => {
    const { container } = renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('iOS install variant', () => {
  it('prompts to install instead of hiding, even though push reports unsupported', () => {
    setPush({ isSupported: false });
    setInstall({ needsManualInstall: true });

    renderBanner();

    expect(screen.getByText(/add cantera to your home screen/i)).toBeInTheDocument();
  });

  it('takes precedence over the enable variant', () => {
    setInstall({ needsManualInstall: true });

    renderBanner();

    expect(screen.queryByText('Enable Notifications')).not.toBeInTheDocument();
    expect(screen.getByText(/add cantera to your home screen/i)).toBeInTheDocument();
  });

  it('opens the walkthrough when no native prompt is available', async () => {
    setPush({ isSupported: false });
    setInstall({ needsManualInstall: true, canPrompt: false });

    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /show me how/i }));

    expect(await screen.findByText(/add to home screen/i)).toBeInTheDocument();
    expect(promptInstall).not.toHaveBeenCalled();
  });

  it('fires the native prompt instead of the walkthrough when one was captured', async () => {
    setPush({ isSupported: false });
    setInstall({ needsManualInstall: true, canPrompt: true });

    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /show me how/i }));

    await waitFor(() => expect(promptInstall).toHaveBeenCalled());
  });

  it('tracks its own dismissal separately from the enable banner', async () => {
    setPush({ isSupported: false });
    setInstall({ needsManualInstall: true });

    const { container } = renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /not now/i }));

    expect(container).toBeEmptyDOMElement();
    // The enable-variant key must be untouched, so a later install still gets asked.
    expect(localStorage.getItem('push_banner_dismissed_v1')).toBeNull();
    expect(localStorage.getItem('install_banner_dismissed_v1')).toBe('1');
  });
});
