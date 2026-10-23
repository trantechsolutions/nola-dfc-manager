import { Link } from 'react-router-dom';
import { PlayCircle } from 'lucide-react';
import { formatDate, useFilm, useFilmText } from '../../film/FilmContext';
import { Res, outcome, stripVenue } from './filmUi';

/** Every game in the library, newest first, with its record so far. */
export default function FilmLibrary() {
  const { games: all, teamId } = useFilm();
  const { t, tx, locale } = useFilmText();
  // Newest first; same-day games keep their published order.
  const games = all
    .map((g, i) => ({ g, i }))
    .sort((a, b) => b.g.date.localeCompare(a.g.date) || b.i - a.i)
    .map((x) => x.g);
  const results = games.map((g) => outcome(g.score.us, g.score.them));
  const w = results.filter((r) => r === 'W').length;
  const d = results.filter((r) => r === 'D').length;
  const gf = games.reduce((s, g) => s + g.score.us, 0);
  const ga = games.reduce((s, g) => s + g.score.them, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          <b className="text-foreground">{games.length}</b> {t('gamesReviewed')}
        </span>
        <span>
          {t('record')}{' '}
          <b className="text-foreground">
            {w}-{d}-{games.length - w - d}
          </b>
        </span>
        <span>
          {t('goalsFor')}{' '}
          <b className="text-foreground">
            {gf}–{ga}
          </b>
        </span>
      </div>
      {/* Each row opens the game's report; the play button beside it goes straight to the clips. */}
      <ol className="-mx-4 divide-y divide-border border-y border-border bg-card sm:mx-0 sm:rounded-md sm:border sm:shadow-sm">
        {games.map((g) => {
          const base = `/film/${teamId}/game/${g.slug}`;
          const context = stripVenue(tx(g.listContext));
          const where = g.home === null ? '' : g.home ? t('homeShort') : t('awayShort');
          return (
            <li key={g.slug} className="flex items-center">
              <Link
                to={`${base}/report`}
                aria-label={`${t('matchReport')}: ${t('vs')} ${g.opponent}, ${g.score.us}–${g.score.them}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-background"
              >
                <Res r={outcome(g.score.us, g.score.them)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-foreground">{g.opponent}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[formatDate(g.date, locale, 'short'), g.time, where].filter(Boolean).join(' · ')}
                  </span>
                  {context && <span className="block truncate text-xs text-muted-foreground/80">{context}</span>}
                </span>
                <span className="shrink-0 font-numeral text-2xl font-bold tabular-nums text-foreground">
                  {g.score.us}–{g.score.them}
                </span>
              </Link>
              {g.highlights.clips.length > 0 ? (
                <Link
                  to={`${base}/highlights`}
                  aria-label={`${t('highlights')}: ${t('vs')} ${g.opponent}`}
                  title={t('highlights')}
                  className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <PlayCircle size={22} />
                </Link>
              ) : (
                <span className="mr-2 w-11 shrink-0" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
