import { useT } from '../../i18n/I18nContext';
import { useNavigation } from '../../context/NavigationContext';
import { useDestinations } from '../../hooks/useDestinations';
import { getPageMeta } from '../../utils/pageMeta';

/**
 * ContentHeader — the page title, and the sibling pages of the destination
 * it sits in as a row of pills (Budget · Ledger · Fundraising under Money).
 *
 * Home has no header: its first element is the next-match card, and a title
 * reading "Home" above it would only push that card down the screen.
 */
export default function ContentHeader() {
  const { appNavItems, clubNavItems, seasonNavItems, teamNavItems, currentView, navigate, teams, selectedTeamId } =
    useNavigation();
  const { active } = useDestinations();
  const { t } = useT();

  if (currentView === 'dashboard') return null;

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0] || null;
  const { title } = getPageMeta(currentView, {
    navGroups: [
      { section: 'app', items: appNavItems },
      { section: 'club', items: clubNavItems },
      { section: 'season', items: seasonNavItems },
      { section: 'team', items: teamNavItems },
    ],
    t,
    teamName: selectedTeam?.name,
  });

  const siblings = active && active.items.length > 1 ? active.items : [];

  return (
    <div className="app-content-header">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {siblings.length > 0 && (
        <nav aria-label={t('nav.sectionPages')} className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {siblings.map((item) => {
            const isActive = item.id === currentView;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/${item.id}`)}
                aria-current={isActive ? 'page' : undefined}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
