import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, CircleDot, Flag, Hand, Loader2, Repeat, Square, Target, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '../../supabase';
import { useT } from '../../i18n/I18nContext';
import PageTabs from '../../components/layout/PageTabs';
import { liveGameService } from '../../services/liveGameService';
import { clockAt, clockStr, replay, stats } from '../../film/lib/keeplog';
import { newGoals, playByPlay, resultOf } from '../../film/liveFeed';
import { Md } from '../../film/RichText';
import { BarRow } from './filmUi';
import GoalCelebration from './GoalCelebration';

const KIND_ICON = {
  goal: CircleDot,
  shot: Target,
  save: Hand,
  card: Square,
  sub: Repeat,
  whistle: Timer,
  setpiece: Flag,
};

/**
 * A kept game as the team follows it (/live/:teamId/:game): the running score and clock, the play-by-play and the
 * stats, all updating as the scorekeeper taps. A goal for us, and a win at full time, celebrate on screen; their
 * goal and other results get a quiet banner. Everyone on the team can open it (sql/live_game_migration.sql).
 */
export default function LiveGameView() {
  const { teamId, game } = useParams();
  const { t, locale } = useT();
  const lang = locale === 'es' ? 'es' : 'en';
  const [entries, setEntries] = useState(null);
  const [failed, setFailed] = useState(false);
  const [us, setUs] = useState('');
  const [tab, setTab] = useState('feed');
  const [now, setNow] = useState(Date.now());
  const [celebration, setCelebration] = useState(null);
  const seenMoments = useRef(null); // the moments already on screen, so only new goals celebrate
  const sawFullTime = useRef(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from('film_teams').select('short_name').eq('team_id', teamId).maybeSingle(),
      supabase.from('teams').select('name').eq('id', teamId).maybeSingle(),
    ]).then(([film, team]) => live && setUs(film.data?.short_name || team.data?.name || ''));
    liveGameService.getEntries(teamId, game).then(
      (list) => live && setEntries(list),
      () => live && setFailed(true),
    );
    const stop = liveGameService.subscribe(teamId, game, (e) =>
      setEntries((list) => (list && !list.some((x) => x.id === e.id) ? [...list, e] : list)),
    );
    return () => {
      live = false;
      stop();
    };
  }, [teamId, game]);

  const s = useMemo(() => (entries ? replay(entries) : null), [entries]);
  const moments = useMemo(() => (entries && s ? playByPlay(entries, s, us) : []), [entries, s, us]);
  const opp = s?.setup?.opponent || '';

  // New goals and the final whistle celebrate; whatever was there when the page opened doesn't.
  useEffect(() => {
    if (!s) return;
    if (seenMoments.current === null) {
      seenMoments.current = moments;
      sawFullTime.current = s.phase === 'done';
      return;
    }
    const goals = newGoals(seenMoments.current, moments);
    seenMoments.current = moments;
    if (s.phase === 'done' && !sawFullTime.current) {
      sawFullTime.current = true;
      const r = resultOf(s.score);
      setCelebration({
        kind: r,
        title: t(`film.live_${r}`),
        detail: `${us} ${s.score.us}–${s.score.them} ${opp}`,
        // A win celebrates with the line above; a draw or a loss is a quiet banner that carries the score.
        score: r === 'win' ? null : s.score,
      });
      return;
    }
    const goal = goals[goals.length - 1];
    if (!goal) return;
    setCelebration(
      goal.side === 'D'
        ? { kind: 'goal', title: t('film.live_goal'), detail: goal.scorer || '', score: goal.score }
        : { kind: 'theirGoal', title: t('film.live_theyScore', { team: opp }), score: goal.score },
    );
  }, [moments, s, t, us, opp]);

  // The clock ticks while it's running.
  const running = s?.clock.since != null && s?.phase === 'live';
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const dismiss = useCallback(() => setCelebration(null), []);

  if (failed) {
    return <Status>{t('film.live_notFound')}</Status>;
  }
  if (!entries || !s) {
    return (
      <Status>
        <Loader2 className="animate-spin" />
      </Status>
    );
  }
  if (!s.setup) return <Status>{t('film.live_notFound')}</Status>;

  const clock = clockStr(clockAt(s.clock, now));
  const status =
    s.phase === 'pre'
      ? t('film.live_notStarted')
      : s.phase === 'break'
        ? t('film.live_halfTime')
        : s.phase === 'done'
          ? t('film.live_fullTime')
          : `${s.clock.h === 1 ? t('film.live_half1') : t('film.live_half2')} · ${clock}`;
  const rows = [
    { name: us, score: s.score.us, bar: 'bg-primary' },
    { name: opp, score: s.score.them, bar: 'bg-accent' },
  ];
  const feed = [...moments].reverse();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/schedule"
        className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={16} /> {t('film.live_backToSchedule')}
      </Link>

      {/* The score bug: the same one the game film uses, live. */}
      <header className="-mx-4 border-y border-border bg-card px-4 py-4 sm:mx-0 sm:rounded-md sm:border sm:p-5 sm:shadow-sm">
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {s.phase === 'live' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold uppercase text-destructive-foreground">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {t('film.live_now')}
            </span>
          )}
          <span className="tabular-nums" aria-live="off">
            {status}
          </span>
        </p>
        <h1 className="mt-3 max-w-md space-y-2" aria-label={`${us} ${s.score.us}, ${opp} ${s.score.them}`}>
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-3">
              <span className={cn('h-8 w-1.5 shrink-0 rounded-full', r.bar)} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xl font-bold text-foreground">{r.name}</span>
              <span className="font-numeral text-5xl font-bold leading-none tabular-nums text-foreground">
                {r.score}
              </span>
            </div>
          ))}
        </h1>
      </header>

      <PageTabs
        tabs={[
          { id: 'feed', label: t('film.live_playByPlay') },
          { id: 'stats', label: t('film.live_stats') },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'feed' &&
        (feed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t('film.live_noMoments')}
          </p>
        ) : (
          <ol
            className="m-bleed divide-y divide-border overflow-hidden rounded-lg border border-border bg-card"
            aria-live="polite"
          >
            {feed.map((m) => {
              const Icon = KIND_ICON[m.kind] || Timer;
              const goal = m.kind === 'goal';
              return (
                <li
                  key={m.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3',
                    goal && m.side === 'D' && 'bg-primary/10',
                    goal && m.side === 'O' && 'bg-accent/10',
                  )}
                >
                  <span className="w-12 shrink-0 pt-0.5 font-numeral text-base font-bold tabular-nums text-muted-foreground">
                    {m.c && m.kind !== 'whistle' ? m.c : ''}
                  </span>
                  <Icon
                    size={16}
                    className={cn(
                      'mt-1 shrink-0',
                      m.side === 'D' ? 'text-primary' : m.side === 'O' ? 'text-accent' : 'text-muted-foreground',
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn('min-w-0 flex-1 text-sm', goal ? 'font-bold text-foreground' : 'text-foreground')}
                  >
                    <Md s={m.text[lang]} />
                  </span>
                </li>
              );
            })}
          </ol>
        ))}

      {tab === 'stats' && (
        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="grid grid-cols-2 text-xs font-bold">
            <span className="text-primary">{us}</span>
            <span className="text-right text-accent">{opp}</span>
          </div>
          {/* Rows nobody has a number in yet stay out of the way; goals and shots always show. */}
          {stats(s)
            .filter((r) => r.us || r.them || ['Goals', 'Shots'].includes(r.label.en))
            .map((r) => (
              <BarRow key={r.label.en} label={r.label[lang]} us={r.us} them={r.them} unit={r.unit || ''} />
            ))}
        </section>
      )}

      {celebration && <GoalCelebration {...celebration} onDone={dismiss} />}
    </div>
  );
}

function Status({ children }) {
  return (
    <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
