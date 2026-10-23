import { createContext, useContext } from 'react';
import { useCompactViewport } from '../../hooks/useCompactViewport';
import { cn } from '@/lib/utils';
import { useFilm, useFilmText, useNamer } from '../../film/FilmContext';
import { Md, T } from '../../film/RichText';
import { mmss, sec, videoSec, workingClip } from '../../film/lib/time';
import { BarRow, Eyebrow, FilmSection, Toc, eventLabel } from './filmUi';

// For a coach with the game's lineup, moments name the player at each position.
const NamerContext = createContext(null);
const useNamed = () => useContext(NamerContext) ?? ((_, text) => text);

/** The match report: the story, each half phase by phase, the numbers, the takeaways and the clips. */
export default function FilmMatchReport({ game: g }) {
  const { shortName: US } = useFilm();
  const { t, tx } = useFilmText();
  const namer = useNamer(g);
  const R = g.report;
  const byId = new Map(g.events.map((e) => [e.id, e]));

  return (
    <NamerContext.Provider value={namer}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Eyebrow>
            <T t={R.eyebrow} />
          </Eyebrow>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {R.board.map((b, i) => (
              <span key={i}>
                <T t={b} />
              </span>
            ))}
          </div>
        </div>

        <Toc
          items={[
            ['story', t('story')],
            ['first-half', t('half1')],
            ['second-half', t('half2')],
            ['numbers', t('numbers')],
            ['takeaways', t('takeaways')],
            ['clips', t('clips')],
          ]}
        />

        <FilmSection id="story" eyebrow={<T t={R.story.eyebrow} />} title={tx(R.story.title)}>
          <p className="max-w-prose text-sm leading-relaxed text-foreground">
            <T t={R.story.lede} />
          </p>
          <div className="mt-4 rounded-md border border-border bg-background p-2">
            <Timeline g={g} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-primary" />
              {t('shotAbove', { team: US })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-accent" />
              {t('shotBelow', { team: g.opponent })}
            </span>
            <span>{t('largeGoal')}</span>
            {R.story.legendNote && (
              <span>
                <T t={R.story.legendNote} />
              </span>
            )}
          </div>
        </FilmSection>

        {R.halves.map((half, i) => {
          const h = i + 1;
          return (
            <FilmSection
              key={h}
              id={h === 1 ? 'first-half' : 'second-half'}
              eyebrow={<T t={half.eyebrow} />}
              title={tx(half.title)}
            >
              <div className="mb-4 flex flex-wrap gap-1.5">
                {half.pills.map((p, j) => (
                  <span
                    key={j}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      j === 0 ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <T t={p} />
                  </span>
                ))}
              </div>
              <div className="space-y-5">
                {half.phases.map((p, j) => (
                  <div key={j} className="grid gap-3 md:grid-cols-[minmax(0,16rem)_1fr]">
                    <div>
                      <span className="text-xs font-bold tabular-nums text-muted-foreground">
                        <T t={p.range} />
                      </span>
                      <h3 className="mt-0.5 text-sm font-bold text-foreground">
                        <T t={p.title} />
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <T t={p.read} />
                      </p>
                    </div>
                    <ul className="space-y-1.5">
                      {p.events.map((ref) => {
                        const r = typeof ref === 'string' ? { id: ref } : ref;
                        const e = byId.get(r.id);
                        return e ? (
                          <ReportEvent
                            key={r.id}
                            g={g}
                            e={e}
                            d={r.d ? tx(r.d) : undefined}
                            label={r.label ? tx(r.label) : undefined}
                          />
                        ) : null;
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <MiniStats events={g.events.filter((e) => e.h === h)} />
            </FilmSection>
          );
        })}

        <FilmSection
          id="numbers"
          eyebrow={<T t={R.numbers.eyebrow} />}
          title={tx(R.numbers.title)}
          sub={R.numbers.sub ? <T t={R.numbers.sub} /> : undefined}
        >
          <div className="space-y-5">
            {R.numbers.tables.map((tb, i) => (
              <div key={i}>
                {tb.title && (
                  <Eyebrow className="mb-1">
                    <T t={tb.title} />
                  </Eyebrow>
                )}
                <div className="grid grid-cols-2 text-xs font-bold">
                  <span className="text-primary">{US}</span>
                  <span className="text-right text-accent">{g.opponent}</span>
                </div>
                {tb.rows.map((r, j) => (
                  <BarRow key={j} label={<T t={r.label} />} us={r.us} them={r.them} unit={r.unit ?? tb.unit ?? ''} />
                ))}
              </div>
            ))}
          </div>
        </FilmSection>

        <FilmSection id="takeaways" eyebrow={<T t={R.takeaways.eyebrow} />} title={tx(R.takeaways.title)}>
          <div className="grid gap-5 md:grid-cols-2">
            {[
              [R.takeaways.decidedTitle, R.takeaways.decided],
              [R.takeaways.workTitle, R.takeaways.work],
            ].map(([title, points], i) => (
              <div key={i}>
                <h3 className="text-sm font-bold text-foreground">
                  <T t={title} />
                </h3>
                <ul className="mt-2 space-y-3">
                  {points.map((p, j) => (
                    <li key={j} className="text-sm">
                      <b className="font-semibold text-foreground">
                        <T t={p.title} />
                      </b>
                      {p.tag && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          <T t={p.tag} />
                        </span>
                      )}
                      <p className="mt-0.5 text-muted-foreground">
                        <T t={p.body} />
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </FilmSection>

        <FilmSection
          id="clips"
          eyebrow={<T t={R.clips.eyebrow} />}
          title={tx(R.clips.title)}
          sub={<T t={R.clips.sub} />}
        >
          <div className="divide-y divide-border">
            {R.clips.items.map((c, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', c.t === 'D' ? 'bg-primary' : 'bg-accent')} />
                <span className="flex-1 text-foreground">
                  <T t={c.what} />
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{c.at}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.file}</span>
              </div>
            ))}
          </div>
        </FilmSection>

        <footer className="space-y-1 px-1 text-xs text-muted-foreground">
          {R.footer.map((p, i) => (
            <p key={i}>
              <T t={p} />
            </p>
          ))}
        </footer>
      </div>
    </NamerContext.Provider>
  );
}

function ReportEvent({ g, e, d, label }) {
  const { shortName: US } = useFilm();
  const { t, tx, ev } = useFilmText();
  const named = useNamed();
  const v = videoSec(g, e);
  const clip = workingClip(g, v);
  const text = eventLabel(ev, US, g, e, label);
  const tone =
    e.y === 'Yellow'
      ? 'bg-warning text-warning-foreground'
      : e.y === 'Red'
        ? 'bg-destructive text-destructive-foreground'
        : e.t === 'D'
          ? 'bg-primary/10 text-primary'
          : e.t === 'O'
            ? 'bg-accent/10 text-accent'
            : 'bg-muted text-muted-foreground';
  // A phone gets the clock and what happened on one line, the description under it at full width. The video
  // and clip times are for scrubbing footage on a bigger screen.
  return (
    <li
      className={cn(
        'rounded-md py-2 text-sm sm:grid sm:grid-cols-[4.5rem_1fr] sm:gap-x-3 sm:px-2',
        e.y === 'Goal' && '-mx-2 bg-muted/60 px-2 sm:mx-0',
        e.key && 'border-l-2 border-foreground/40 pl-2 sm:border-l-0 sm:ring-1 sm:ring-border',
      )}
    >
      <span className="hidden text-xs font-bold tabular-nums text-foreground sm:block">
        {e.c}
        <span className="block font-normal text-muted-foreground">
          {t('vid')} {mmss(v)}
        </span>
        <span className="block font-normal text-muted-foreground">
          <b>{clip.label}</b> {clip.at}
        </span>
      </span>
      <span className="block min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-numeral text-base font-bold tabular-nums text-foreground sm:hidden">{e.c}</span>
          <span className={cn('rounded px-1.5 py-0.5 text-xs font-bold', tone)}>{text}</span>
        </span>
        <span className="mt-1 block leading-relaxed text-muted-foreground">
          {d !== undefined ? <Md s={named(e, d)} /> : <Md s={named(e, tx(e.d))} />}
          {e.y === 'Shot' && e.on !== undefined && (
            <>
              {' '}
              <i>({e.on ? t('onTarget') : t('offTarget')})</i>
            </>
          )}
        </span>
        {d === undefined && e.f && (
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground/80">
            <Md s={tx(e.f)} />
          </span>
        )}
      </span>
    </li>
  );
}

const STATS = [
  ['statGoals', (e) => e.y === 'Goal'],
  ['statShots', (e) => e.y === 'Goal' || e.y === 'Shot'],
  ['statOn', (e) => e.y === 'Goal' || (e.y === 'Shot' && !!e.on)],
  ['statTurnovers', (e) => e.y === 'Turnover'],
  ['statWins', (e) => e.y === 'Ball win'],
  ['statCards', (e) => e.y === 'Yellow' || e.y === 'Red'],
];

/** The half in six counts, ours first in the team colour, theirs second in the opponent's. */
function MiniStats({ events }) {
  const { t } = useFilmText();
  return (
    <div className="mt-5 grid grid-cols-3 gap-2 lg:grid-cols-6">
      {STATS.map(([k, f]) => {
        const d = events.filter((e) => e.t === 'D' && f(e)).length;
        const o = events.filter((e) => e.t === 'O' && f(e)).length;
        return (
          <div key={k} className="rounded-md bg-muted/60 px-2.5 py-2">
            <span className="block text-[11px] font-medium leading-tight text-muted-foreground">{t(k)}</span>
            <span className="mt-1 block font-numeral text-xl font-bold tabular-nums">
              <span className="text-primary">{d}</span>
              <span className="mx-1 text-muted-foreground">–</span>
              <span className="text-accent">{o}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Shots above (us) and below (opponent) a line, one x-scale across both halves. */
function Timeline({ g }) {
  const { shortName: US } = useFilm();
  const { t } = useFilmText();
  // A phone draws it narrower, so the same type reads at a legible size without scrolling sideways.
  const compact = useCompactViewport();
  const W = compact ? 560 : 1000;
  // The team names sit at the left edge on a wide screen; a phone leaves them to the legend underneath.
  const L = compact ? 16 : 52;
  const R = 24;
  const GAP = 44;
  const MID = 125;
  const len1 = sec(g.video.halfLength[1]);
  const len2 = sec(g.video.halfLength[2]);
  const k = (W - L - R - GAP) / (len1 + len2);
  const htX = L + len1 * k;
  const x = (h, c) => (h === 1 ? L + sec(c) * k : htX + GAP + sec(c) * k);
  const offset = g.video.minute ? 30 : 0;
  const colour = (team) => (team === 'D' ? 'var(--primary)' : 'var(--accent)');
  const fs = compact ? 18 : 13;
  const small = { fontSize: fs, fill: 'var(--muted-foreground)' };
  const step = compact ? 10 : 5;

  const ticks = [];
  [
    [1, len1],
    [2, len2],
  ].forEach(([h, len]) => {
    for (let m = 0; m * 60 <= len; m += step) ticks.push({ x: x(h, `${m}:00`), label: `${h === 2 ? m + offset : m}'` });
  });

  let us = 0;
  let them = 0;
  // Goals close together would print their running scores on top of each other: the later one goes unlabelled.
  const lastLabel = { D: -Infinity, O: -Infinity };
  const labelGap = compact ? 60 : 30;
  const marks = g.events
    .filter((e) => e.y === 'Shot' || e.y === 'Goal')
    .map((e) => {
      const goal = e.y === 'Goal';
      if (goal) {
        if (e.t === 'D') us++;
        else them++;
      }
      const up = e.t === 'D' ? -1 : 1;
      const xx = x(e.h, e.c);
      const yy = MID + up * (goal ? 76 : 44);
      const labelled = goal && xx - lastLabel[e.t] >= labelGap;
      if (labelled) lastLabel[e.t] = xx;
      return (
        <g key={e.id}>
          <line x1={xx} x2={xx} y1={MID} y2={yy} stroke={colour(e.t)} strokeWidth={2} />
          {goal ? (
            <>
              <circle cx={xx} cy={yy} r={compact ? 12 : 10} fill={colour(e.t)} />
              {labelled && (
                // On a phone the score sits beside the marker, clear of the minute marks under the chart.
                <text
                  x={compact ? xx + 16 : xx}
                  y={compact ? yy + 6 : yy + up * 18 + (up < 0 ? 0 : 10)}
                  textAnchor={compact ? 'start' : 'middle'}
                  style={{ fontSize: fs + 1, fontWeight: 700, fill: 'var(--foreground)' }}
                >
                  {us}–{them}
                </text>
              )}
            </>
          ) : (
            <circle
              cx={xx}
              cy={yy}
              r={compact ? 7 : 5.5}
              fill="var(--background)"
              stroke={colour(e.t)}
              strokeWidth={2.5}
            />
          )}
        </g>
      );
    });

  return (
    <svg viewBox={`0 0 ${W} 250`} role="img" aria-label={t('timelineLabel', { us: US })} className="w-full">
      <rect x={htX} y={20} width={GAP} height={210} rx={4} fill="var(--muted)" />
      <text x={htX + GAP / 2} y={MID + 4} textAnchor="middle" style={small}>
        {t('ht')}
      </text>
      <text x={L} y={14} style={small}>
        {t('half1')}
      </text>
      <text x={htX + GAP} y={14} style={small}>
        {t('half2')}
      </text>
      <line x1={L} x2={htX} y1={MID} y2={MID} stroke="var(--foreground)" strokeWidth={1.5} />
      <line x1={htX + GAP} x2={W - R} y1={MID} y2={MID} stroke="var(--foreground)" strokeWidth={1.5} />
      {ticks.map((tk, i) => (
        <g key={i}>
          <line x1={tk.x} x2={tk.x} y1={30} y2={220} stroke="var(--border)" strokeDasharray="2 4" />
          <text x={tk.x} y={243} textAnchor="middle" style={small}>
            {tk.label}
          </text>
        </g>
      ))}
      {!compact && (
        <>
          <text x={4} y={MID - 70} style={{ fontSize: fs, fontWeight: 700, fill: 'var(--primary)' }}>
            {US}
          </text>
          <text x={4} y={MID + 78} style={{ fontSize: fs, fontWeight: 700, fill: 'var(--accent)' }}>
            {g.opponent}
          </text>
        </>
      )}
      {marks}
    </svg>
  );
}
