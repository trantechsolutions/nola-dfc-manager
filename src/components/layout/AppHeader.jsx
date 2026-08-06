import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, GitCommit, Globe, LogOut, Megaphone, Menu, PanelLeft, User } from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import { useNavigation } from '../../context/NavigationContext';
import { useLayout } from '../../context/LayoutContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { pushService } from '../../services/pushService';
import IosInstallSheet from '../IosInstallSheet';
import { APP_NAME } from '../../utils/constants';

/**
 * AppHeader — AdminLTE `.app-header` navbar.
 *
 * Left: the sidebar toggle (minify on desktop, off-canvas on mobile) plus the
 * active team · season readout. Right: the notification, theme, language and
 * user dropdowns. Every account-level action lives here rather than in the
 * sidebar, matching AdminLTE's navbar-owns-the-user-menu convention.
 */
export default function AppHeader() {
  const {
    club,
    teams,
    selectedTeamId,
    selectedSeason,
    navigate,
    user,
    effectiveRole,
    toggleLocale,
    locale,
    cycleTheme,
    theme,
    ThemeIcon,
    supabase,
  } = useNavigation();
  const { toggleSidebar, collapsed } = useLayout();
  const { t } = useT();

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0] || null;

  return (
    <header className="app-header flex items-center gap-1 border-b border-border bg-card px-2 md:px-3">
      <button
        onClick={toggleSidebar}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Menu size={20} className="md:hidden" />
        <PanelLeft size={20} className="hidden md:block" />
      </button>

      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-sm font-semibold text-foreground md:hidden">{club?.name || APP_NAME}</p>
        <p className="hidden truncate text-sm text-muted-foreground md:block">
          {selectedTeam && <span className="font-semibold text-foreground">{selectedTeam.name}</span>}
          {selectedTeam && selectedSeason && <span className="px-1.5">·</span>}
          {selectedSeason}
        </p>
      </div>

      <NotificationsMenu />

      <button
        onClick={cycleTheme}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={`Theme: ${theme}`}
        aria-label={`Theme: ${theme}`}
      >
        <ThemeIcon size={18} />
      </button>

      <button
        onClick={toggleLocale}
        className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={locale === 'en' ? 'Español' : 'English'}
        aria-label="Toggle language"
      >
        <Globe size={18} />
        <span className="absolute right-0.5 top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-accent text-[9px] font-bold uppercase text-accent-foreground">
          {locale}
        </span>
      </button>

      <HeaderDropdown
        align="right"
        width="w-64"
        trigger={
          <span className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-foreground">
              <User size={15} />
            </span>
            <ChevronDown size={14} className="hidden md:block" />
          </span>
        }
        label="Account menu"
      >
        {(close) => (
          <>
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-popover-foreground">{user?.email}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{effectiveRole?.replace(/_/g, ' ')}</p>
            </div>
            <MenuItem
              icon={GitCommit}
              label="Update Log"
              onClick={() => {
                navigate('/changelog');
                close();
              }}
            />
            <div className="my-1 border-t border-border" />
            <MenuItem
              icon={LogOut}
              label={t('common.logout')}
              destructive
              onClick={() => {
                close();
                supabase.auth.signOut();
              }}
            />
          </>
        )}
      </HeaderDropdown>
    </header>
  );
}

/**
 * Notification bell — owns push-subscription state and the staff broadcast
 * composer. iOS withholds Web Push until the PWA is installed, so an
 * uninstalled iOS user gets the install route instead of a button that
 * cannot succeed.
 */
function NotificationsMenu() {
  const { selectedTeamId, teams } = useNavigation();
  const { isSubscribed, isSupported, subscribe } = usePushNotifications();
  const { needsManualInstall } = useInstallPrompt();
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null;

  const handleBroadcast = async (close) => {
    if (!broadcastMsg.trim()) return;
    setBroadcastSending(true);
    try {
      await pushService.broadcast({
        teamId: selectedTeamId || undefined,
        title: selectedTeam?.name || 'Team Update',
        body: broadcastMsg.trim(),
        url: '/dashboard',
      });
      setBroadcastMsg('');
      close();
    } catch (e) {
      console.error('[broadcast]', e);
    } finally {
      setBroadcastSending(false);
    }
  };

  return (
    <>
      <HeaderDropdown
        align="right"
        width="w-72"
        label="Notifications"
        trigger={
          <span className="relative flex rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Bell size={18} />
            {isSupported && !isSubscribed && !needsManualInstall && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning" />
            )}
          </span>
        }
      >
        {(close) => (
          <>
            <div className="border-b border-border px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notifications</p>
            </div>

            {needsManualInstall ? (
              <MenuItem
                icon={Bell}
                label="Install for Notifications"
                onClick={() => {
                  setShowIosSheet(true);
                  close();
                }}
              />
            ) : (
              isSupported &&
              (isSubscribed ? (
                <p className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-success">
                  <Bell size={16} /> Notifications on
                </p>
              ) : (
                <MenuItem icon={Bell} label="Enable Notifications" onClick={subscribe} />
              ))
            )}

            {selectedTeamId && (
              <div className="border-t border-border p-3">
                <label className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <Megaphone size={13} /> Broadcast to Team
                </label>
                <textarea
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="Message to team…"
                  rows={2}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs focus:border-ring focus:outline-none"
                />
                <button
                  onClick={() => handleBroadcast(close)}
                  disabled={broadcastSending || !broadcastMsg.trim()}
                  className="mt-1.5 w-full rounded-md bg-primary py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
                >
                  {broadcastSending ? 'Sending…' : 'Send'}
                </button>
              </div>
            )}
          </>
        )}
      </HeaderDropdown>
      {showIosSheet && <IosInstallSheet onClose={() => setShowIosSheet(false)} />}
    </>
  );
}

/** Navbar dropdown with click-outside and Escape dismissal. */
function HeaderDropdown({ trigger, children, align = 'right', width = 'w-64', label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={label}>
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} ${width} z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg`}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, destructive }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
        destructive ? 'text-destructive hover:bg-destructive/10' : 'text-popover-foreground hover:bg-muted'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
