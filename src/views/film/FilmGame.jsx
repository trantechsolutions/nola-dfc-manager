import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import PageTabs from '../../components/layout/PageTabs';
import { useFilm, useFilmText } from '../../film/FilmContext';
import { GAME_PAGES } from '../../film/pages';
import { T } from '../../film/RichText';
import { Eyebrow, FilmStatus, useDateLine } from './filmUi';
import FilmMatchReport from './FilmMatchReport';
import FilmHighlights from './FilmHighlights';

const VIEWS = { report: FilmMatchReport, highlights: FilmHighlights };
const PAGES = Object.fromEntries(Object.entries(GAME_PAGES).map(([id, key]) => [id, { key, C: VIEWS[id] }]));

/** One game: the header every page shares (score, scorers, the games either side), its tabs, the page. */
export default function FilmGame() {
  const { slug, page } = useParams();
  const { games, teamId, shortName } = useFilm();
  const { t } = useFilmText();
  const navigate = useNavigate();
  const g = games.find((x) => x.slug === slug);

  useEffect(() => {
    if (g && PAGES[page]) {
      document.title = `${shortName} ${g.score.us}–${g.score.them} ${g.opponent} · ${t(PAGES[page].key)}`;
    }
  }, [g, page, shortName, t]);

  if (!g) {
    return (
      <FilmStatus>
        <p>{t('notFound')}</p>
        <Link to={`/film/${teamId}/library`} className="font-semibold text-primary hover:underline">
          {t('allGames')}
        </Link>
      </FilmStatus>
    );
  }
  if (!PAGES[page]) return <Navigate to={`/film/${teamId}/game/${slug}/report`} replace />;

  const { C } = PAGES[page];
  const tabs = Object.entries(PAGES)
    .filter(([id]) => id !== 'highlights' || g.highlights.clips.length > 0)
    .map(([id, p]) => ({ id, label: t(p.key) }));
  return (
    <div className="space-y-4">
      <GameHeader g={g} page={page} />
      <PageTabs
        label={t('ghPages')}
        tabs={tabs}
        active={page}
        onChange={(id) => navigate(`/film/${teamId}/game/${slug}/${id}`)}
      />
      <C game={g} />
    </div>
  );
}

function GameHeader({ g, page }) {
  const { games, teamId, shortName: US } = useFilm();
  const { t } = useFilmText();
  const dateLine = useDateLine(g);
  // The list line often ends with the venue, which the date line already gives.
  const strip = (x) => x.replace(/\s*·\s*(Home|Away|Local|Visitante)\s*$/i, '');
  const context = strip(g.listContext.en)
    ? { en: strip(g.listContext.en), es: strip(g.listContext.es) || strip(g.listContext.en) }
    : null;
  const order = [...games].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const at = order.findIndex((x) => x.slug === g.slug);
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const to = (x) => `/film/${teamId}/game/${x.slug}/${page}`;

  return (
    <header className="rounded-md border border-border bg-card p-4 shadow-sm sm:p-5">
      <Eyebrow>
        {dateLine}
        {context && (
          <>
            {' · '}
            <T t={context} />
          </>
        )}
      </Eyebrow>
      <h1
        className="mt-2 flex flex-wrap items-baseline gap-x-3 text-2xl font-extrabold sm:text-3xl"
        aria-label={`${US} ${g.score.us}, ${g.opponent} ${g.score.them}`}
      >
        <span className="text-primary">{US}</span>
        <span className="tabular-nums text-foreground">
          {g.score.us}–{g.score.them}
        </span>
        <span className="text-accent">{g.opponent}</span>
      </h1>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
          {t('ht')} {g.score.htUs}–{g.score.htThem}
        </span>
        {g.goals.map((x, i) => (
          <span
            key={i}
            className={`rounded px-2 py-0.5 font-medium ${x.t === 'D' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'}`}
          >
            <T t={x.label} />
          </span>
        ))}
      </div>
      <div className="mt-3 flex justify-between gap-2 text-xs font-semibold text-muted-foreground">
        {prev ? (
          <Link to={to(prev)} title={t('ghPrev')} className="hover:text-foreground">
            ‹ {prev.score.us}–{prev.score.them} {prev.opponent}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={to(next)} title={t('ghNext')} className="hover:text-foreground">
            {next.score.us}–{next.score.them} {next.opponent} ›
          </Link>
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}
