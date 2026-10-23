import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '../../i18n/I18nContext';

// Confetti in the team colour, the opponent accent and gold; a fixed set so it renders the same every time.
const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 9) * 0.12,
  duration: 2.2 + ((i * 7) % 10) / 10,
  colour: ['var(--primary)', '#f2c94c', 'var(--accent)', '#ffffff'][i % 4],
  size: 6 + (i % 4) * 2,
  tilt: (i * 53) % 360,
}));

/**
 * The moment a goal goes in, or the final whistle on a win: a full-screen card over the live game. Our goals
 * and a win celebrate; their goal and a draw or loss get a quiet banner instead. Dismissed by a tap, Escape, or
 * after a few seconds; without motion when the reader asks for less.
 *
 * kind: 'goal' | 'theirGoal' | 'win' | 'draw' | 'loss'
 */
export default function GoalCelebration({ kind, title, detail, score, onDone }) {
  const { t } = useT();
  const loud = kind === 'goal' || kind === 'win';

  useEffect(() => {
    const ms = loud ? 5000 : 4000;
    const timer = setTimeout(onDone, ms);
    const onKey = (e) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', onKey);
    if (loud) {
      try {
        navigator.vibrate?.([80, 60, 160]);
      } catch {
        // Not supported: the screen says it.
      }
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [loud, onDone]);

  const confetti = useMemo(
    () =>
      PIECES.map((p, i) => (
        <span
          key={i}
          className="goal-confetti absolute top-0 block rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.colour,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.tilt}deg)`,
          }}
        />
      )),
    [],
  );

  if (!loud) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 top-16 z-[3000] flex justify-center px-4"
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={onDone}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-lg"
        >
          <span>{title}</span>
          {score && (
            <span className="font-numeral text-xl font-bold tabular-nums">
              {score.us}–{score.them}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center overflow-hidden bg-black/70 p-6"
      role="alertdialog"
      aria-live="assertive"
      aria-label={title}
      onClick={onDone}
    >
      <div className="absolute inset-0" aria-hidden="true">
        {confetti}
      </div>
      <div className="goal-pop relative w-full max-w-sm rounded-2xl border border-white/10 bg-card px-6 py-8 text-center shadow-2xl">
        <p
          className={cn(
            'font-numeral font-black uppercase leading-none text-primary',
            kind === 'goal' ? 'text-7xl' : 'text-5xl',
          )}
        >
          {title}
        </p>
        {detail && <p className="mt-3 text-base font-semibold text-foreground">{detail}</p>}
        {score && (
          <p className="mt-4 font-numeral text-5xl font-bold tabular-nums text-foreground">
            {score.us}–{score.them}
          </p>
        )}
        <p className="mt-5 text-xs text-muted-foreground">{t('film.live_tapToClose')}</p>
      </div>
    </div>
  );
}
