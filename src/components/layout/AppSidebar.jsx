import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ShieldCheck, X } from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import { useNavigation } from '../../context/NavigationContext';
import { useLayout } from '../../context/LayoutContext';
import { APP_NAME } from '../../utils/constants';

/**
 * AppSidebar — AdminLTE `.app-sidebar`.
 *
 * One element serves both breakpoints: a 250px pane that minifies to a 4.6rem
 * icon rail on desktop, and an off-canvas drawer on mobile. The width/transform
 * switching lives in index.css (`.app-sidebar`) so it stays declarative;
 * this component only supplies structure and state hooks.
 */
export default function AppSidebar() {
  const {
    club,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    appNavItems,
    clubNavItems,
    seasonNavItems,
    teamNavItems,
    selectedSeason,
    setSelectedSeason,
    seasons,
    currentView,
    navigate,
    user,
    effectiveRole,
    singleTeam,
  } = useNavigation();
  const { collapsed, mobileOpen, closeMobile, desktop } = useLayout();
  const { t } = useT();

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0] || null;
  const brandName = club?.name || APP_NAME;

  const go = (id) => {
    navigate(`/${id}`);
    closeMobile();
  };

  const navGroups = [
    { section: 'app', label: 'App', items: appNavItems },
    { section: 'club', label: t('common.club'), items: clubNavItems },
    { section: 'season', label: t('common.season'), items: seasonNavItems },
    { section: 'team', label: selectedTeam?.name || t('common.team'), items: teamNavItems },
  ].filter((group) => group.items.length > 0);

  return (
    <aside
      className="app-sidebar bg-sidebar text-sidebar-foreground shadow-lg"
      data-open={mobileOpen ? 'true' : 'false'}
      // Parked off-screen on mobile it is still in the DOM — `inert` keeps it
      // out of the tab order and off the accessibility tree until it slides in.
      inert={!desktop && !mobileOpen}
      aria-label="Main navigation"
    >
      {/* ═══ BRAND ═══ AdminLTE's 3.5rem `.sidebar-brand` */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar-brand px-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sm font-bold uppercase text-sidebar-primary-foreground">
          {initials(brandName)}
        </span>
        <span className="sidebar-label truncate text-base font-semibold tracking-tight text-white">{brandName}</span>
        <button
          onClick={closeMobile}
          className="sidebar-label ml-auto rounded p-1 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-white md:hidden"
          aria-label={t('common.close')}
        >
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-wrapper">
        {/* ═══ CONTEXT PICKERS ═══ hidden in the minified rail, restored on hover */}
        <div className="sidebar-only-wide space-y-2 px-3 py-3">
          {!singleTeam && teams.length > 1 ? (
            <SidebarPicker
              label={t('common.team')}
              value={selectedTeam?.name || t('common.team')}
              options={teams.map((team) => ({
                id: team.id,
                label: team.name,
                hint: [team.ageGroup, team.gender, team.tier].filter(Boolean).join(' · '),
                dot: team.colorPrimary || 'var(--primary)',
              }))}
              selectedId={selectedTeamId}
              onSelect={setSelectedTeamId}
            />
          ) : (
            selectedTeam && (
              <div className="rounded-md bg-sidebar-accent px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">{t('common.team')}</p>
                <p className="truncate text-sm font-semibold text-white">{selectedTeam.name}</p>
              </div>
            )
          )}

          {selectedTeam && seasons.length > 0 && (
            <SidebarPicker
              label={t('common.season')}
              value={selectedSeason}
              options={seasons.map((season) => ({ id: season.id, label: season.id }))}
              selectedId={selectedSeason}
              onSelect={setSelectedSeason}
            />
          )}
        </div>

        {/* ═══ NAV ═══ */}
        <nav className="pb-4">
          {navGroups.map((group) => (
            <div key={group.section} className="mb-1">
              <p className="sidebar-label px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-sidebar-heading">
                {group.label}
              </p>
              <ul className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const isActive = currentView === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => go(item.id)}
                        title={collapsed ? item.label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        }`}
                      >
                        <item.icon size={18} className="shrink-0" />
                        <span className="sidebar-label truncate text-left">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* ═══ USER PANEL ═══ AdminLTE's `.user-panel`, informational only —
          every action lives in the header dropdown. */}
      <div className="flex shrink-0 items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sidebar-foreground">
          <ShieldCheck size={16} />
        </span>
        <div className="sidebar-label min-w-0">
          <p className="truncate text-xs font-semibold text-white">{user?.email}</p>
          <p className="truncate text-xs capitalize text-sidebar-muted">{effectiveRole?.replace(/_/g, ' ')}</p>
        </div>
      </div>
    </aside>
  );
}

/** Dark dropdown used for the team and season selectors. */
function SidebarPicker({ label, value, options, selectedId, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${open ? 'z-[60]' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md bg-sidebar-accent px-3 py-2 text-left transition-colors hover:brightness-125"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">{label}</span>
          <span className="block truncate text-sm font-semibold text-white">{value}</span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-sidebar-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                option.id === selectedId ? 'bg-muted' : ''
              }`}
            >
              {option.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: option.dot }} />}
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-popover-foreground">{option.label}</span>
                {option.hint && <span className="block text-xs text-muted-foreground">{option.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
}
