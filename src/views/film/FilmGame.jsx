import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageTabs from '../../components/layout/PageTabs';
import { useFilm, useFilmText } from '../../film/FilmContext';
import { GAME_PAGES } from '../../film/pages';
import { Md } from '../../film/RichText';
import { FilmStatus, outcome, stripVenue, useDateLine } from './filmUi';
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

/**
 * The game's score bug, built for a phone held upright: one row per team (colour bar, name, score), each
 * team's goal minutes under its row, then half time and the games either side.
 */
function GameHeader({ g, page }) {
  const { games, teamId, shortName: US } = useFilm();
  const { t, tx } = useFilmText();
  const dateLine = useDateLine(g);
  const context = stripVenue(tx(g.listContext));
  const order = [...games].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const at = order.findIndex((x) => x.slug === g.slug);
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const to = (x) => `/film/${teamId}/game/${x.slug}/${page}`;
  const result = outcome(g.score.us, g.score.them);

  // Goal labels name the team ("BRSC 8'"); under that team's own row the name is noise.
  const names = [US, g.opponent.split(/\s+/)[0]].filter(Boolean);
  const minuteOf = (label) => {
    const text = tx(label);
    // The name may be bolded ("**BRSC** 8'"), so match it with or without the markup.
    for (const n of names) {
      for (const lead of [`**${n}** `, `${n} `]) {
        if (text.toLowerCase().startsWith(lead.toLowerCase())) return text.slice(lead.length);
      }
    }
    return text;
  };
  const rows = [
    { side: 'D', name: US, score: g.score.us, bar: 'bg-primary', won: result === 'W' },
    { side: 'O', name: g.opponent, score: g.score.them, bar: 'bg-accent', won: result === 'L' },
  ];

  return (
    <header className="-mx-4 border-y border-border bg-card px-4 py-4 sm:mx-0 sm:rounded-md sm:border sm:p-5 sm:shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">
        {dateLine}
        {context && <span className="block truncate sm:inline sm:before:content-['_·_']">{context}</span>}
      </p>
      <h1 className="mt-3 max-w-md space-y-2" aria-label={`${US} ${g.score.us}, ${g.opponent} ${g.score.them}`}>
        {rows.map((r) => {
          const goals = g.goals.filter((x) => x.t === r.side);
          return (
            <div key={r.side} className="flex items-start gap-3">
              <span className={cn('mt-1 h-8 w-1.5 shrink-0 rounded-full', r.bar)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-xl leading-tight',
                    r.won ? 'font-extrabold text-foreground' : 'font-semibold text-foreground/80',
                  )}
                >
                  {r.name}
                </span>
                {goals.length > 0 && (
                  <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                    {goals.map((x, i) => (
                      <span key={i} className="mr-2 inline-block">
                        <Md s={minuteOf(x.label)} />
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'font-numeral text-5xl font-bold leading-none tabular-nums',
                  r.won ? 'text-foreground' : 'text-foreground/70',
                )}
              >
                {r.score}
              </span>
            </div>
          );
        })}
      </h1>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs font-semibold text-muted-foreground">
        <span className="shrink-0">
          {t('ht')}{' '}
          <span className="tabular-nums text-foreground">
            {g.score.htUs}–{g.score.htThem}
          </span>
        </span>
        <span className="flex min-w-0 gap-1">
          {prev && (
            <Link
              to={to(prev)}
              title={t('ghPrev')}
              className="inline-flex min-h-9 min-w-0 items-center gap-0.5 rounded-lg border border-border px-2.5 hover:text-foreground"
            >
              <ChevronLeft size={14} className="shrink-0" />
              <span className="truncate">{prev.opponent}</span>
            </Link>
          )}
          {next && (
            <Link
              to={to(next)}
              title={t('ghNext')}
              className="inline-flex min-h-9 min-w-0 items-center gap-0.5 rounded-lg border border-border px-2.5 hover:text-foreground"
            >
              <span className="truncate">{next.opponent}</span>
              <ChevronRight size={14} className="shrink-0" />
            </Link>
          )}
        </span>
      </div>
    </header>
  );
}
