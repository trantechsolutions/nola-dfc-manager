import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import PageTabs from '../../components/layout/PageTabs';
import { FilmProvider, useFilm, useFilmText } from '../../film/FilmContext';
import { FilmStatus } from './filmUi';
import FilmSeason from './FilmSeason';
import FilmLibrary from './FilmLibrary';
import FilmGame from './FilmGame';
import FilmScorekeeper from './FilmScorekeeper';

/**
 * The Stats tab: the team's game film (the season overview, the library of games, and each game's pages), and
 * at its foot the scorekeeper for the team's stat keepers. Open to anyone on the team; row-level security
 * decides what they get (coaches also get the breakdowns and the squad).
 *
 *   /film/:teamId                 season overview
 *   /film/:teamId/library         every game, newest first
 *   /film/:teamId/game/:slug/:page  one game (report, highlights)
 */
export default function FilmView() {
  const { teamId } = useParams();
  return (
    <FilmProvider teamId={teamId}>
      <div className="space-y-8">
        <FilmShell />
        <FilmScorekeeper teamId={teamId} />
      </div>
    </FilmProvider>
  );
}

function FilmShell() {
  const film = useFilm();
  const { t } = useFilmText();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const base = `/film/${film.teamId}`;
  const inGame = pathname.startsWith(`${base}/game/`);
  const tab = pathname.startsWith(`${base}/library`) || inGame ? 'library' : 'season';

  // A new page starts at the top, unless it's an in-page link.
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  if (film.status === 'loading') return <FilmStatus>{t('loading')}</FilmStatus>;
  if (film.status === 'error') {
    return (
      <FilmStatus>
        <p>{t('loadFailed')}</p>
        <button
          type="button"
          onClick={film.retry}
          className="rounded-lg border border-border px-3 py-1.5 font-semibold"
        >
          {t('retry')}
        </button>
      </FilmStatus>
    );
  }
  if (!film.games.length) return <FilmStatus>{t('noGames')}</FilmStatus>;

  return (
    <div className="space-y-4">
      <FilmBreadcrumbs />
      {!inGame && (
        <PageTabs
          label={t('appTitle')}
          tabs={[
            { id: 'season', label: t('seasonOverview') },
            { id: 'library', label: t('library'), count: film.games.length },
          ]}
          active={tab}
          onChange={(id) => navigate(id === 'season' ? base : `${base}/library`)}
        />
      )}
      <Routes>
        <Route index element={<FilmSeason />} />
        <Route path="library" element={<FilmLibrary />} />
        <Route path="game/:slug" element={<Navigate to="report" replace />} />
        <Route path="game/:slug/:page" element={<FilmGame />} />
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </div>
  );
}

/**
 * Inside a game, the way back out: Game film › Library › vs Opponent, on one line. The game's tabs already
 * say which of its pages you're on, and on the season and library pages the tabs are the navigation, so the
 * trail only appears in a game.
 */
function FilmBreadcrumbs() {
  const { teamId, games } = useFilm();
  const { t } = useFilmText();
  const { pathname } = useLocation();
  const base = `/film/${teamId}`;
  const [, section, slug] = (pathname.startsWith(base) ? pathname.slice(base.length) : '').split('/');
  const g = section === 'game' ? games.find((x) => x.slug === slug) : null;
  if (!g) return null;

  const crumbs = [
    { label: t('appTitle'), to: base },
    { label: t('library'), to: `${base}/library` },
  ];
  return (
    <nav aria-label={t('breadcrumb')}>
      <ol className="flex min-w-0 items-center gap-x-1 whitespace-nowrap text-sm font-semibold text-muted-foreground">
        {crumbs.map((c) => (
          <li key={c.to} className="flex shrink-0 items-center gap-x-1">
            <Link to={c.to} className="inline-flex min-h-9 items-center hover:text-foreground hover:underline">
              {c.label}
            </Link>
            <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
          </li>
        ))}
        <li className="min-w-0 truncate text-foreground" aria-current="page">
          {t('vs')} {g.opponent}
        </li>
      </ol>
    </nav>
  );
}
