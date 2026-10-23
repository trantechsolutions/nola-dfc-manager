import { Plus } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { useNavigation } from '../context/NavigationContext';
import { useDestinations } from '../hooks/useDestinations';
import { useAttention } from '../hooks/useAttention';
import { tabTarget } from '../utils/navMemory';
import { TabBadge } from './layout/AppHeader';
import { usePanelRoute } from '../hooks/usePanelRoute';
import { PANELS } from '../utils/panelRoute';

/**
 * Phone tab bar — the same destinations as the header tabs, under the thumb.
 * A parent gets four; a team manager five. Manage isn't here: it opens from
 * the account menu on a phone (see AppHeader), so the bar stays at five.
 */
export default function MobileBottomNav() {
  const { navigate, canEditLedger, effectiveIsStaff } = useNavigation();
  const { destinations, active } = useDestinations();
  const { badges } = useAttention();
  const { t } = useT();
  // The panel renders app-wide, so the button can open it from any route
  // without navigating away first — it just adds the panel to the URL.
  const { openPanel } = usePanelRoute();

  // Recording a payment is the one write a team manager does from the
  // sideline; it floats where money is on screen, and nowhere else.
  const showAdd = canEditLedger && effectiveIsStaff && (active?.id === 'home' || active?.id === 'money');

  return (
    <>
      {showAdd && (
        <button
          type="button"
          onClick={() => openPanel(PANELS.TX)}
          className="fixed bottom-[calc(var(--app-tabbar-h)+env(safe-area-inset-bottom)+1rem)] right-4 z-[1030] grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95 md:hidden"
          aria-label={t('nav.addTransaction')}
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      <nav
        aria-label="Main"
        className="app-tabbar fixed inset-x-0 bottom-0 z-[1030] flex border-t border-border bg-card md:hidden"
      >
        {destinations
          .filter((dest) => dest.phoneTab)
          .map((dest) => {
            const isActive = active?.id === dest.id;
            return (
              <button
                key={dest.id}
                type="button"
                onClick={() => navigate(tabTarget(dest, active?.id))}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {isActive && (
                  <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" aria-hidden="true" />
                )}
                <span className="relative">
                  <dest.icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
                  <TabBadge value={badges[dest.id]} t={t} floating />
                </span>
                <span className="max-w-full truncate px-1">{dest.label}</span>
              </button>
            );
          })}
      </nav>
    </>
  );
}
