// Smoke coverage for the AdminLTE shell: every chrome region renders, the
// sidebar toggle drives the right mode per breakpoint, and nav clicks navigate
// then dismiss the mobile drawer. The shell has no logic of its own worth
// unit-testing in isolation — what matters is that the four grid regions and
// the toggle wiring survive refactors.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LayoutDashboard, ReceiptText, Calendar } from 'lucide-react';

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
  teams: [{ id: 't1', name: 'U12 Boys', ageGroup: 'U12', gender: 'Boys', tier: 'Premier' }],
  selectedTeamId: 't1',
  setSelectedTeamId: vi.fn(),
  appNavItems: [],
  clubNavItems: [],
  seasonNavItems: [
    { id: 'dashboard', label: 'Season Overview', icon: LayoutDashboard, section: 'season' },
    { id: 'finance/ledger', label: 'Ledger', icon: ReceiptText, section: 'season' },
  ],
  teamNavItems: [{ id: 'schedule', label: 'Schedule', icon: Calendar, section: 'team' }],
  selectedSeason: '2025-26',
  setSelectedSeason: vi.fn(),
  seasons: [{ id: '2025-26' }],
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

function setViewport(isDesktop) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isDesktop,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

// The bottom tab bar duplicates several nav labels (it is `md:hidden`, but
// jsdom applies no Tailwind), and the email shows in both the sidebar user
// panel and the header menu — so region-scope every ambiguous query.
const sidebar = (container) => within(container.querySelector('.app-sidebar'));
const header = (container) => within(container.querySelector('.app-header'));

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
    window.localStorage.clear();
    setViewport(true);
    resetScreenPanels();
  });

  it('renders all four AdminLTE grid regions', () => {
    const { container } = renderShell();
    expect(container.querySelector('.app-sidebar')).toBeInTheDocument();
    expect(container.querySelector('.app-header')).toBeInTheDocument();
    expect(container.querySelector('.app-main')).toBeInTheDocument();
    expect(container.querySelector('.app-footer')).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('titles the content header from the active nav item and trails a breadcrumb', () => {
    renderShell();
    expect(screen.getByRole('heading', { name: 'Ledger' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Home')).toBeInTheDocument();
    expect(within(crumbs).getByText('U12 Boys')).toBeInTheDocument();
  });

  it('marks the active sidebar entry as the current page', () => {
    const { container } = renderShell();
    expect(sidebar(container).getByRole('button', { name: 'Ledger' })).toHaveAttribute('aria-current', 'page');
    expect(sidebar(container).getByRole('button', { name: 'Schedule' })).not.toHaveAttribute('aria-current');
  });

  it('minifies the sidebar on desktop when the toggle is pressed', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    expect(container.querySelector('.app-wrapper')).toHaveAttribute('data-sidebar', 'expanded');

    await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(container.querySelector('.app-wrapper')).toHaveAttribute('data-sidebar', 'collapsed');
  });

  it('opens the off-canvas drawer on mobile instead of minifying', async () => {
    setViewport(false);
    const user = userEvent.setup();
    const { container } = renderShell();
    expect(container.querySelector('.app-sidebar')).toHaveAttribute('data-open', 'false');

    await user.click(screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i }));
    expect(container.querySelector('.app-sidebar')).toHaveAttribute('data-open', 'true');
    expect(container.querySelector('.app-wrapper')).toHaveAttribute('data-sidebar', 'expanded');
  });

  it('navigates and closes the drawer when a nav entry is chosen', async () => {
    setViewport(false);
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i }));
    await user.click(sidebar(container).getByRole('button', { name: 'Schedule' }));

    expect(navigate).toHaveBeenCalledWith('/schedule');
    expect(container.querySelector('.app-sidebar')).toHaveAttribute('data-open', 'false');
  });

  it('signs out from the header account menu, not the sidebar', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(header(container).getByRole('button', { name: /account menu/i }));
    expect(header(container).getByText('coach@example.com')).toBeInTheDocument();
    await user.click(header(container).getByRole('button', { name: /logout/i }));

    expect(signOut).toHaveBeenCalled();
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
