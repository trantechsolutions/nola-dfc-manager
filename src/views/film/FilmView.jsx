import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import PageTabs from '../../components/layout/PageTabs';
import { FilmProvider, formatDate, useFilm, useFilmText } from '../../film/FilmContext';
import { GAME_PAGES } from '../../film/pages';
import { FilmStatus } from './filmUi';
import FilmSeason from './FilmSeason';
import FilmLibrary from './FilmLibrary';
import FilmGame from './FilmGame';

/**
 * The team's game film: the season overview, the library of games, and each game's pages. Open to anyone on
 * the team; row-level security decides what they get (coaches also get the breakdowns and the squad).
 *
 *   /film/:teamId                 season overview
 *   /film/:teamId/library         every game, newest first
 *   /film/:teamId/game/:slug/:page  one game (report, highlights)
 */
export default function FilmView() {
  const { teamId } = useParams();
  return (
    <FilmProvider teamId={teamId}>
      <FilmShell />
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
 * Where you are in the film, each step a way back: Game film › Library › vs Opponent · date › Match report.
 * The season overview is the film's home, so "Game film" leads there.
 */
function FilmBreadcrumbs() {
  const { teamId, games } = useFilm();
  const { t, locale } = useFilmText();
  const { pathname } = useLocation();
  const base = `/film/${teamId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  const [, section, slug, page] = rest.split('/');
  const g = section === 'game' ? games.find((x) => x.slug === slug) : null;

  const crumbs = [{ label: t('appTitle'), to: base }];
  if (section === 'library' || g) crumbs.push({ label: t('library'), to: `${base}/library` });
  else crumbs.push({ label: t('seasonOverview') });
  if (g) {
    const report = `${base}/game/${g.slug}/report`;
    crumbs.push({ label: `${t('vs')} ${g.opponent} · ${formatDate(g.date, locale, 'short')}`, to: report });
    if (GAME_PAGES[page]) crumbs.push({ label: t(GAME_PAGES[page]) });
  }
  // The last step is the page you're on, so it isn't a link.
  crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1].label };

  return (
    <nav aria-label={t('breadcrumb')}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs font-semibold text-muted-foreground">
        {crumbs.map((c, i) => (
          <li key={i} className="flex items-center gap-x-1">
            {i > 0 && <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
            {c.to ? (
              <Link to={c.to} className="hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
