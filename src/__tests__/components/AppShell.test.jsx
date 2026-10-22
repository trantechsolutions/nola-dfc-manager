// Smoke coverage for the app shell: header, content and footer render, the
// destination tabs and section pills agree on where the user is, and the
// account menu owns sign-out. Destination grouping itself is unit-tested in
// utils/navDestinations.test.js.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LayoutDashboard, ReceiptText, Calendar, FileSpreadsheet } from 'lucide-react';

// `virtual:git-info` is aliased to src/__tests__/stubs/gitInfo.js in vitest.config.js.
vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ isSupported: false, isSubscribed: false, subscribe: vi.fn() }),
}));
vi.mock('../../hooks/useInstallPrompt', () => ({
  useInstallPrompt: () => ({ needsManualInstall: false }),
}));

import { I18nProvider } from '../../i18n/I18nContext';
import { NavigationContext } from '../../context/NavigationContext';
import AppShell from '../../components/layout/AppShell';
import { registerScreenPanel, resetScreenPanels } from '../../hooks/useScreenPanel';

const navigate = vi.fn();
const signOut = vi.fn();

const navValue = {
  club: { id: 'c1', name: 'NOLA DFC' },
  teams: [{ id: 't1', name: 'U12 Boys', ageGroup: 'U12', gender: 'Boys', tier: 'Premier', colorPrimary: '#0a7c3e' }],
  selectedTeamId: 't1',
  setSelectedTeamId: vi.fn(),
  appNavItems: [],
  clubNavItems: [],
  seasonNavItems: [
    { id: 'dashboard', label: 'Season Overview', icon: LayoutDashboard, section: 'season' },
    { id: 'finance/budget', label: 'Budget', icon: FileSpreadsheet, section: 'season' },
    { id: 'finance/ledger', label: 'Ledger', icon: ReceiptText, section: 'season' },
  ],
  teamNavItems: [{ id: 'schedule', label: 'Schedule', icon: Calendar, section: 'team' }],
  selectedSeason: '2025-26',
  setSelectedSeason: vi.fn(),
  seasons: [{ id: '2025-26' }, { id: '2024-25' }],
  currentView: 'finance/ledger',
  navigate,
  user: { email: 'coach@example.com' },
  effectiveRole: 'team_manager',
  toggleLocale: vi.fn(),
  locale: 'en',
  cycleTheme: vi.fn(),
  theme: 'light',
  ThemeIcon: () => <span data-testid="theme-icon" />,
  supabase: { auth: { signOut } },
  effectiveIsStaff: true,
  isClubAdmin: false,
  canEditLedger: false,
  setTxToEdit: vi.fn(),
  setShowTxForm: vi.fn(),
  singleTeam: false,
};

// The header tabs and the phone tab bar are both in the DOM (jsdom applies no
// Tailwind breakpoints), so region-scope every ambiguous query.
const header = (container) => within(container.querySelector('.app-header'));
const tabBar = (container) => within(container.querySelector('.app-tabbar'));

function renderShell() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <NavigationContext.Provider value={navValue}>
          <AppShell>
            <p>page body</p>
          </AppShell>
        </NavigationContext.Provider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetScreenPanels();
  });

  it('renders the header, main content and footer', () => {
    const { container } = renderShell();
    expect(container.querySelector('.app-header')).toBeInTheDocument();
    expect(container.querySelector('.app-main')).toBeInTheDocument();
    expect(container.querySelector('.app-footer')).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('titles the page from the active nav item and lists its sibling pages', () => {
    renderShell();
    expect(screen.getByRole('heading', { name: 'Ledger' })).toBeInTheDocument();
    const pills = screen.getByRole('navigation', { name: /pages in this section/i });
    expect(within(pills).getByRole('button', { name: 'Ledger' })).toHaveAttribute('aria-current', 'page');
    expect(within(pills).getByRole('button', { name: 'Budget' })).not.toHaveAttribute('aria-current');
  });

  it('lights the destination the current page belongs to, in both tab sets', () => {
    const { container } = renderShell();
    for (const tabs of [header(container), tabBar(container)]) {
      expect(tabs.getByRole('button', { name: 'Money' })).toHaveAttribute('aria-current', 'page');
      expect(tabs.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
    }
  });

  it('opens the first page of a destination from its tab', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await user.click(tabBar(container).getByRole('button', { name: 'Schedule' }));
    expect(navigate).toHaveBeenCalledWith('/schedule');
  });

  it('signs out from the account menu', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(header(container).getByRole('button', { name: /^account$/i }));
    expect(header(container).getByText('coach@example.com')).toBeInTheDocument();
    await user.click(header(container).getByRole('button', { name: /sign out/i }));

    expect(signOut).toHaveBeenCalled();
  });

  it('switches season from the team switcher', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(header(container).getByRole('button', { name: /switch team or season/i }));
    await user.click(header(container).getByRole('button', { name: /2024-25/ }));

    expect(navValue.setSelectedSeason).toHaveBeenCalledWith('2024-25');
  });

  it('paints the selected team colour onto the document', () => {
    renderShell();
    expect(document.documentElement.style.getPropertyValue('--team-fill-light')).toBe('#0a7c3e');
  });

  it('stamps the build into the footer', () => {
    renderShell();
    expect(screen.getByText(/build 123 · abc1234/)).toBeInTheDocument();
  });

  // A panel presenting as a full screen replaces the app rather than covering
  // it, so the shell gets out of the way — without losing what the page held.
  describe('while a full-screen panel is presenting', () => {
    it('hides itself, taking the chrome out of the accessibility tree', () => {
      const { container } = renderShell();
      const wrapper = container.querySelector('.app-wrapper');
      expect(wrapper).not.toHaveAttribute('hidden');

      act(() => {
        registerScreenPanel();
      });

      expect(wrapper).toHaveAttribute('hidden');
    });

    it('comes back when the last panel closes', () => {
      const { container } = renderShell();
      const wrapper = container.querySelector('.app-wrapper');

      let releaseOuter;
      let releaseInner;
      act(() => {
        releaseOuter = registerScreenPanel();
      });
      act(() => {
        releaseInner = registerScreenPanel();
      });

      // A form opened over a detail screen: one closing is not all of them.
      act(() => releaseInner());
      expect(wrapper).toHaveAttribute('hidden');

      act(() => releaseOuter());
      expect(wrapper).not.toHaveAttribute('hidden');
    });

    it('stays mounted, so the page keeps what it was holding', () => {
      renderShell();
      act(() => {
        registerScreenPanel();
      });

      // Still in the document — hidden, not unmounted. An unmounted list would
      // come back with its filters, search and expanded rows all reset.
      expect(screen.getByText('page body')).toBeInTheDocument();
    });

    // Hiding a subtree collapses the document's scroll height, and the browser
    // does not put the offset back. Without this the list returns at the top.
    it('puts the page back where it was scrolled to', async () => {
      renderShell();
      // jsdom's scrollTo is a no-op that never moves scrollY, so the offset the
      // shell reads has to be planted directly.
      Object.defineProperty(window, 'scrollY', { value: 640, configurable: true, writable: true });
      const scrollTo = vi.spyOn(window, 'scrollTo');

      let release;
      act(() => {
        release = registerScreenPanel();
      });
      act(() => release());

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 640));
      scrollTo.mockRestore();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
    });
  });
});
