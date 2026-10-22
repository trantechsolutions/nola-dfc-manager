import { Link } from 'react-router-dom';
import { FileText, PlayCircle } from 'lucide-react';
import { useFilm, useFilmText } from '../../film/FilmContext';
import { T } from '../../film/RichText';
import { Eyebrow, Res, outcome } from './filmUi';

/** Every game in the library, newest first, with its record so far. */
export default function FilmLibrary() {
  const { games: all, teamId } = useFilm();
  const { t, locale } = useFilmText();
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

  const day = (iso) => {
    const [y, m, dd] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd));
    return {
      day: new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(dt),
      year: y,
    };
  };

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
      <Eyebrow>{t('listIntro')}</Eyebrow>

      <ol className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card shadow-sm">
        {games.map((g) => {
          const f = day(g.date);
          const base = `/film/${teamId}/game/${g.slug}`;
          return (
            <li key={g.slug} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <p className="w-28 shrink-0 text-xs text-muted-foreground">
                <b className="block text-sm text-foreground">{f.day}</b>
                {f.year}
                {g.time ? ` · ${g.time}` : ''}
              </p>
              <div className="min-w-0 flex-1">
                <Link to={`${base}/report`} className="text-base font-bold text-foreground hover:underline">
                  <span className="mr-1 text-xs font-semibold uppercase text-muted-foreground">{t('vs')}</span>
                  {g.opponent}
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Res r={outcome(g.score.us, g.score.them)} />
                  <b className="tabular-nums text-foreground">
                    {g.score.us}–{g.score.them}
                  </b>
                  <span>·</span>
                  <T t={g.listContext} />
                </p>
              </div>
              <div className="flex gap-2">
                {g.highlights.clips.length > 0 && (
                  <Link
                    to={`${base}/highlights`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-background"
                  >
                    <PlayCircle size={13} />
                    {t('highlights')}
                  </Link>
                )}
                <Link
                  to={`${base}/report`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-background"
                >
                  <FileText size={13} />
                  {t('matchReport')}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
