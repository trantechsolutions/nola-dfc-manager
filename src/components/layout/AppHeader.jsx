import { useEffect, useRef, useState } from 'react';
import { Bell, Check, ChevronDown, CircleHelp, GitCommit, Globe, LogOut, Megaphone } from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import { useNavigation } from '../../context/NavigationContext';
import { useDestinations } from '../../hooks/useDestinations';
import { useAttention } from '../../hooks/useAttention';
import { tabTarget } from '../../utils/navMemory';
import { roleLabel } from '../../utils/roleLabel';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { pushService } from '../../services/pushService';
import IosInstallSheet from '../IosInstallSheet';
import { APP_NAME } from '../../utils/constants';

/**
 * AppHeader — the one bar of chrome every screen shares.
 *
 * Left: whose team this is (the team switcher, which also holds the season).
 * Middle, from 768px up: the destination tabs; on phones they move to the
 * bottom tab bar. Right: notifications and the account menu, which holds the
 * settings people change once — appearance, language — so they stop costing
 * header space on every screen.
 */
export default function AppHeader() {
  const { navigate } = useNavigation();
  const { destinations, active } = useDestinations();
  const { badges } = useAttention();
  const { t } = useT();

  return (
    <header className="app-header border-b border-border bg-card">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-2 px-3 md:gap-6 md:px-6">
        <TeamSwitcher />

        <nav aria-label="Main" className="hidden h-full items-stretch gap-1 md:flex">
          {destinations.map((dest) => {
            const isActive = active?.id === dest.id;
            return (
              <button
                key={dest.id}
                type="button"
                onClick={() => navigate(tabTarget(dest, active?.id))}
                aria-current={isActive ? 'page' : undefined}
                className={`relative px-3 text-sm font-semibold transition-colors ${
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {dest.label}
                <TabBadge value={badges[dest.id]} t={t} />
                {isActive && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <NotificationsMenu />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * The team's colour, name and season — and, when there is a choice to make,
 * the place to make it. Team and season live together because they are one
 * question ("which squad, which year am I looking at?") and both re-scope
 * every page beneath them.
 */
function TeamSwitcher() {
  const {
    club,
    teams = [],
    selectedTeamId,
    setSelectedTeamId,
    seasons = [],
    selectedSeason,
    setSelectedSeason,
    singleTeam,
  } = useNavigation();
  const { t } = useT();

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0] || null;
  const name = selectedTeam?.name || club?.name || APP_NAME;
  const teamChoices = !singleTeam && teams.length > 1 ? teams : [];
  const seasonChoices = selectedTeam && seasons.length > 1 ? seasons : [];
  const canSwitch = teamChoices.length > 0 || seasonChoices.length > 0;

  const identity = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-bold"
        style={{
          backgroundColor: 'var(--team)',
          color: 'var(--team-foreground)',
          boxShadow: 'inset 0 0 0 1px var(--team-edge)',
        }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <span className="min-w-0 text-left">
        <span className="block max-w-[11rem] truncate text-sm font-semibold leading-tight text-foreground sm:max-w-[16rem]">
          {name}
        </span>
        {selectedTeam && selectedSeason && (
          <span className="block truncate text-xs leading-tight text-muted-foreground">{selectedSeason}</span>
        )}
      </span>
    </span>
  );

  if (!canSwitch) return <div className="min-w-0 shrink">{identity}</div>;

  return (
    <HeaderDropdown
      align="left"
      width="w-72"
      label={t('nav.switchTeam')}
      trigger={
        <span className="flex min-w-0 items-center gap-1.5 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-muted">
          {identity}
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </span>
      }
    >
      {(close) => (
        <div className="max-h-[70vh] overflow-y-auto">
          {teamChoices.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                {club?.name ? club.name : t('nav.yourTeams')}
              </p>
              {teamChoices.map((team) => (
                <ChoiceItem
                  key={team.id}
                  selected={team.id === selectedTeam?.id}
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    close();
                  }}
                  swatch={team.colorPrimary || 'var(--primary)'}
                  label={team.name}
                  hint={[team.ageGroup, team.gender, team.tier].filter(Boolean).join(' ')}
                />
              ))}
            </>
          )}
          {seasonChoices.length > 0 && (
            <>
              <p
                className={`px-4 pb-1 pt-2 text-xs font-semibold text-muted-foreground ${
                  teamChoices.length > 0 ? 'mt-1 border-t border-border' : ''
                }`}
              >
                {t('common.season')}
              </p>
              {seasonChoices.map((season) => (
                <ChoiceItem
                  key={season.id}
                  selected={season.id === selectedSeason}
                  onClick={() => {
                    setSelectedSeason(season.id);
                    close();
                  }}
                  label={season.id}
                  hint={season.id === selectedTeam?.activeSeasonId ? t('nav.activeSeason') : null}
                />
              ))}
            </>
          )}
        </div>
      )}
    </HeaderDropdown>
  );
}

/**
 * A count (a parent's open checklist items) or a dot (fees outstanding) on a
 * destination tab. Shared with the phone tab bar so the two never disagree.
 */
export function TabBadge({ value, t, floating = false }) {
  if (!value) return null;
  const label = value === 'dot' ? t('nav.feesOutstanding') : t('nav.toDoCount', { n: value });
  const position = floating ? 'absolute -right-1.5 -top-1' : 'ml-1.5 align-middle';
  return value === 'dot' ? (
    <span className={`${position} inline-block h-2 w-2 rounded-full bg-warning`} role="status" aria-label={label} />
  ) : (
    <span
      className={`${position} inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-xs font-semibold leading-none text-primary-foreground tabular-nums`}
      role="status"
      aria-label={label}
    >
      {value}
    </span>
  );
}

function ChoiceItem({ selected, onClick, swatch, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted ${
        selected ? 'bg-muted' : ''
      }`}
    >
      {swatch && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: swatch }} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-popover-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {selected && <Check size={16} className="shrink-0 text-primary" />}
    </button>
  );
}

const THEME_LABEL_KEYS = { light: 'nav.themeLight', dark: 'nav.themeDark', system: 'nav.themeSystem' };

function AccountMenu() {
  const { navigate, user, effectiveRole, toggleLocale, locale, cycleTheme, theme, ThemeIcon, supabase } =
    useNavigation();
  const { t } = useT();

  return (
    <HeaderDropdown
      align="right"
      width="w-72"
      label={t('nav.account')}
      trigger={
        <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-semibold uppercase text-foreground transition-colors hover:bg-secondary">
          {(user?.email || '?').charAt(0)}
        </span>
      }
    >
      {(close) => (
        <>
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-popover-foreground">{user?.email}</p>
            <p className="truncate text-xs text-muted-foreground">{roleLabel(effectiveRole, t)}</p>
          </div>
          {/* Settings rows keep the menu open: the change is visible behind it,
              and the next tap is usually the other setting. */}
          <MenuItem
            icon={ThemeIcon}
            label={t('nav.theme')}
            value={t(THEME_LABEL_KEYS[theme] || 'nav.themeSystem')}
            onClick={cycleTheme}
          />
          <MenuItem
            icon={Globe}
            label={t('nav.language')}
            value={locale === 'es' ? 'Español' : 'English'}
            onClick={toggleLocale}
          />
          <div className="my-1 border-t border-border" />
          <MenuItem
            icon={CircleHelp}
            label={t('nav.help')}
            onClick={() => {
              navigate('/help');
              close();
            }}
          />
          <MenuItem
            icon={GitCommit}
            label={t('nav.updateLog')}
            onClick={() => {
              navigate('/changelog');
              close();
            }}
          />
          <div className="my-1 border-t border-border" />
          <MenuItem
            icon={LogOut}
            label={t('nav.signOut')}
            destructive
            onClick={() => {
              close();
              supabase.auth.signOut();
            }}
          />
        </>
      )}
    </HeaderDropdown>
  );
}

/**
 * Notification bell — owns push-subscription state and the staff broadcast
 * composer. iOS withholds Web Push until the PWA is installed, so an
 * uninstalled iOS user gets the install route instead of a button that
 * cannot succeed.
 */
function NotificationsMenu() {
  const { selectedTeamId, teams = [], effectiveIsStaff } = useNavigation();
  const { t } = useT();
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
        label={t('nav.notifications')}
        trigger={
          <span className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Bell size={18} />
            {isSupported && !isSubscribed && !needsManualInstall && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-warning" />
            )}
          </span>
        }
      >
        {(close) => (
          <>
            <div className="border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold text-popover-foreground">{t('nav.notifications')}</p>
            </div>

            {needsManualInstall ? (
              <MenuItem
                icon={Bell}
                label={t('nav.installForNotifications')}
                onClick={() => {
                  setShowIosSheet(true);
                  close();
                }}
              />
            ) : (
              isSupported &&
              (isSubscribed ? (
                <p className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-success">
                  <Bell size={16} /> {t('nav.notificationsOn')}
                </p>
              ) : (
                <MenuItem icon={Bell} label={t('nav.turnOnNotifications')} onClick={subscribe} />
              ))
            )}

            {/* Broadcasting is a staff job — a parent's bell is just their own
                notification switch. */}
            {selectedTeamId && effectiveIsStaff !== false && (
              <div className="border-t border-border p-3">
                <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Megaphone size={13} /> {t('nav.messageTeam')}
                </label>
                <textarea
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder={t('nav.messagePlaceholder')}
                  rows={2}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
                <button
                  onClick={() => handleBroadcast(close)}
                  disabled={broadcastSending || !broadcastMsg.trim()}
                  className="mt-1.5 w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {broadcastSending ? t('nav.sending') : t('nav.sendMessage')}
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

/** Header dropdown with click-outside and Escape dismissal. */
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
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="flex min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} ${width} z-50 mt-2 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-md`}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, value, onClick, destructive }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
        destructive ? 'text-destructive hover:bg-muted' : 'text-popover-foreground hover:bg-muted'
      }`}
    >
      {Icon && <Icon size={16} className="shrink-0" />}
      <span className="flex-1">{label}</span>
      {value && <span className="text-muted-foreground">{value}</span>}
    </button>
  );
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}
