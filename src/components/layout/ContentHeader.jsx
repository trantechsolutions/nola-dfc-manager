import { ChevronRight } from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import { useNavigation } from '../../context/NavigationContext';
import { getPageMeta } from '../../utils/pageMeta';

/**
 * ContentHeader — AdminLTE `.app-content-header`.
 *
 * Page title on the left, breadcrumb trail on the right. Both are derived
 * from the live nav items (see utils/pageMeta.js), so adding a sidebar entry
 * is all it takes for a route to get a correct title and crumb.
 */
export default function ContentHeader() {
  const { appNavItems, clubNavItems, seasonNavItems, teamNavItems, currentView, navigate, teams, selectedTeamId } =
    useNavigation();
  const { t } = useT();

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0] || null;

  const { title, crumbs } = getPageMeta(currentView, {
    navGroups: [
      { section: 'app', items: appNavItems },
      { section: 'club', items: clubNavItems },
      { section: 'season', items: seasonNavItems },
      { section: 'team', items: teamNavItems },
    ],
    t,
    teamName: selectedTeam?.name,
  });

  return (
    <div className="app-content-header">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={12} className="opacity-50" />}
                  {crumb.to && !isLast ? (
                    <button
                      onClick={() => navigate(crumb.to)}
                      className="transition-colors hover:text-primary hover:underline"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span
                      className={isLast ? 'font-semibold text-foreground' : undefined}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
