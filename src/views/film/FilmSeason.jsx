import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, useFilm, useFilmText } from '../../film/FilmContext';
import { RECENT, WINDOWS, season, themes } from '../../film/lib/season';
import { Eyebrow, FilmSection, Res, Toc } from './filmUi';

/** Season overview: every game summed up. Positions only, no names; the recurring themes are coaches only. */
export default function FilmSeason() {
  const { games, teamId, shortName: US, coach } = useFilm();
  const { t, locale } = useFilmText();
  const s = useMemo(() => season(games), [games]);

  useEffect(() => {
    document.title = `${US} · ${t('season')}`;
  }, [US, t]);

  const n = s.lines.length;
  const num = (x) => x.toLocaleString(locale, { maximumFractionDigits: 1 });
  const pair = (p, unit = '') => (p ? `${num(p[0])}${unit}–${num(p[1])}${unit}` : '—');
  const day = (iso) => formatDate(iso, locale, 'short');
  const report = (slug) => `/film/${teamId}/game/${slug}/report`;
  const gd = s.record.gf - s.record.ga;
  const maxGoals = Math.max(1, ...s.lines.flatMap((l) => [l.us, l.them]));
  // Bars top out at 70% so the count above (or below) the tallest one stays inside its half's box.
  const maxWindow = Math.max(1, ...s.timing.flat().flat()) / 0.7;
  const halfTotals = s.timing.map((h) => h.reduce((a, w) => [a[0] + w[0], a[1] + w[1]], [0, 0]));

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            <b className="text-foreground">{n}</b> {t('gamesReviewed')}
          </span>
          <span>
            {t('record')}{' '}
            <b className="text-foreground">
              {s.record.W}-{s.record.D}-{s.record.L}
            </b>
          </span>
          <span>
            {t('goalsFor')}{' '}
            <b className="text-foreground">
              {s.record.gf}–{s.record.ga}
            </b>{' '}
            ({gd > 0 ? '+' : ''}
            {gd})
          </span>
          <span>
            {t('cleanSheets')} <b className="text-foreground">{s.record.cleanSheets}</b>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1" aria-label={t('formLabel')}>
          <Eyebrow className="mr-2">{t('form')}</Eyebrow>
          {s.lines.map((l) => (
            <Res key={l.slug} r={l.result} />
          ))}
        </div>
      </div>

      <Toc
        items={[
          ['results', t('results')],
          ['timing', t('goalTiming')],
          ['numbers', t('numbers')],
          ...(coach ? [['themes', t('themes')]] : []),
          ...(s.repeats.length ? [['repeats', t('headToHead')]] : []),
        ]}
      />

      <FilmSection id="results" eyebrow={t('resultsEyebrow')} title={t('results')}>
        <ol className="divide-y divide-border">
          {s.lines.map((l) => {
            const where = l.home === null ? '' : l.home ? t('homeShort') : t('awayShort');
            return (
              <li
                key={l.slug}
                className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 py-2 text-sm sm:grid-cols-[8rem_1fr_10rem_auto]"
              >
                <span className="text-xs text-muted-foreground">
                  {day(l.date)}
                  {where ? ` · ${where}` : ''}
                </span>
                <Link to={report(l.slug)} className="truncate font-semibold text-foreground hover:underline">
                  <span className="mr-1 text-xs font-semibold uppercase text-muted-foreground">{t('vs')}</span>
                  {l.opponent}
                </Link>
                <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
                  <span className="flex h-2 flex-1 justify-end overflow-hidden rounded-full bg-muted">
                    <span className="h-full rounded-full bg-primary" style={{ width: `${(l.us / maxGoals) * 100}%` }} />
                  </span>
                  <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(l.them / maxGoals) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="flex items-center gap-1.5 whitespace-nowrap font-bold tabular-nums">
                  <Res r={l.result} /> {l.us}–{l.them}
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('ht')} {l.htUs}–{l.htThem}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {['ahead', 'level', 'behind'].map((k) => {
            const r = s.fromHalfTime[k];
            const total = r.W + r.D + r.L;
            return (
              <div key={k} className="rounded-md bg-muted/60 px-3 py-2">
                <Eyebrow>{t(`ht_${k}`)}</Eyebrow>
                <span className="mt-1 block text-lg font-bold">
                  {total} <span className="text-xs font-medium text-muted-foreground">{t('gamesShort')}</span>
                </span>
                <span className="mt-1 flex items-center gap-1 text-sm">
                  {total ? (
                    <>
                      {r.W}
                      <Res r="W" /> {r.D}
                      <Res r="D" /> {r.L}
                      <Res r="L" />
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </FilmSection>

      <FilmSection
        id="timing"
        eyebrow={t('goalTimingEyebrow')}
        title={t('goalTiming')}
        sub={t('goalTimingSub', { us: US })}
      >
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="img"
          aria-label={t('goalTimingLabel', {
            us: US,
            h1for: halfTotals[0][0],
            h1against: halfTotals[0][1],
            h2for: halfTotals[1][0],
            h2against: halfTotals[1][1],
          })}
        >
          {s.timing.map((half, h) => (
            <div key={h} className="rounded-md border border-border p-3">
              <span className="text-xs font-semibold text-muted-foreground">
                {h === 0 ? t('half1') : t('half2')} <b className="text-primary">{halfTotals[h][0]}</b>–
                <b className="text-accent">{halfTotals[h][1]}</b>
              </span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {half.map(([f, a], w) => (
                  <div key={w} className="flex flex-col items-center">
                    <div className="flex h-20 w-full items-end justify-center">
                      <span
                        className="relative w-8 rounded-t bg-primary"
                        style={{ height: `${(f / maxWindow) * 100}%` }}
                      >
                        <b className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-primary">{f || ''}</b>
                      </span>
                    </div>
                    <span className="w-full border-y border-border py-0.5 text-center text-[11px] text-muted-foreground">
                      {WINDOWS[w][1] === null ? `${WINDOWS[w][0]}'+` : `${WINDOWS[w][0]}–${WINDOWS[w][1]}'`}
                    </span>
                    <div className="flex h-20 w-full items-start justify-center">
                      <span
                        className="relative w-8 rounded-b bg-accent"
                        style={{ height: `${(a / maxWindow) * 100}%` }}
                      >
                        <b className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-xs text-accent">{a || ''}</b>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-primary" />
            {t('scoredBy', { team: US })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-accent" />
            {t('conceded')}
          </span>
        </div>
      </FilmSection>

      <FilmSection id="numbers" eyebrow={t('numbersEyebrow')} title={t('numbers')} sub={t('numbersSub', { us: US })}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-semibold">{t('colGameShort')}</th>
                <th className="py-2 pr-3 font-semibold">{t('colScore')}</th>
                <th className="py-2 pr-3 font-semibold">{t('colShots')}</th>
                <th className="py-2 pr-3 font-semibold">{t('colOnTarget')}</th>
                <th className="py-2 font-semibold">{t('colPossession')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {s.lines.map((l) => (
                <tr key={l.slug} className="border-b border-border last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    <Link to={report(l.slug)} className="hover:underline">
                      {day(l.date)} · {l.opponent}
                    </Link>
                  </th>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Res r={l.result} /> {l.us}–{l.them}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{pair(l.shots)}</td>
                  <td className="py-2 pr-3">{pair(l.onTarget)}</td>
                  <td className="py-2">{pair(l.possession, '%')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border font-semibold tabular-nums">
              <tr>
                <th scope="row" className="py-2 pr-3 text-left">
                  {t('perGame')}
                </th>
                <td className="py-2 pr-3">
                  {num(s.record.gf / Math.max(n, 1))}–{num(s.record.ga / Math.max(n, 1))}
                </td>
                <td className="py-2 pr-3">{pair(s.avg.shots)}</td>
                <td className="py-2 pr-3">{pair(s.avg.onTarget)}</td>
                <td className="py-2">{pair(s.avg.possession, '%')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </FilmSection>

      {coach && <Themes />}

      {s.repeats.length > 0 && (
        <FilmSection id="repeats" eyebrow={t('headToHeadEyebrow')} title={t('headToHead')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.repeats.map((r) => {
              const f = r.lines.reduce((a, l) => a + l.us, 0);
              const ag = r.lines.reduce((a, l) => a + l.them, 0);
              return (
                <div key={r.opponent} className="rounded-md border border-border p-3">
                  <h3 className="font-bold">
                    <span className="mr-1 text-xs font-semibold uppercase text-muted-foreground">{t('vs')}</span>
                    {r.opponent}
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {r.lines.map((l) => (
                      <li key={l.slug} className="flex flex-wrap items-center gap-x-3">
                        <Link to={report(l.slug)} className="hover:underline">
                          {day(l.date)}
                        </Link>
                        <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                          <Res r={l.result} /> {l.us}–{l.them}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {pair(l.shots)} {t('colShots').toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    {t('goalsFor')} {f}–{ag}
                  </p>
                </div>
              );
            })}
          </div>
        </FilmSection>
      )}

      <footer className="px-1 text-xs text-muted-foreground">
        <p>{t('seasonFooter')}</p>
      </footer>
    </div>
  );
}

/** Recurring themes from the coaches' breakdowns: what the high-priority fixes keep coming back to. */
function Themes() {
  const { games, breakdowns } = useFilm();
  const { t } = useFilmText();
  const list = useMemo(
    () =>
      breakdowns &&
      themes(games.filter((g) => breakdowns[g.slug]).map((g) => ({ date: g.date, coaches: breakdowns[g.slug] }))),
    [games, breakdowns],
  );
  const n = games.length;
  const recent = Math.min(RECENT, n);

  return (
    <FilmSection id="themes" eyebrow={t('themesEyebrow')} title={t('themes')} sub={t('themesSub', { n: recent })}>
      {!list ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const fixes = a.fixes.high + a.fixes.med + a.fixes.low;
            return (
              <li key={a.area} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-3">
                <span className="text-sm font-semibold">{t(`area_${a.area}`)}</span>
                <div>
                  <span className="relative block h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span
                      className="absolute inset-y-0 left-0 bg-primary/30"
                      style={{ width: `${(a.games / n) * 100}%` }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 bg-primary"
                      style={{ width: `${(a.highGames / n) * 100}%` }}
                    />
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>
                      {t('highInGames', { x: a.highGames, n })} · {t('lastN', { n: recent, x: a.recentHigh })}
                    </span>
                    <span>{fixes === 1 ? t('fixesOne') : t('fixesCount', { x: fixes })}</span>
                    {['defensive', 'middle', 'attacking'].map((k, i) =>
                      a.thirds[i] ? (
                        <span key={k}>
                          {t(`third_${k}`)} {a.thirds[i]}
                        </span>
                      ) : null,
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </FilmSection>
  );
}
