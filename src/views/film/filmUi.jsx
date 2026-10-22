import { cn } from '@/lib/utils';
import { formatDate, useFilmText } from '../../film/FilmContext';

const LETTER_ES = { W: 'G', D: 'E', L: 'P' };
const RES_TONE = {
  W: 'bg-success text-success-foreground',
  D: 'bg-muted text-muted-foreground',
  L: 'bg-destructive text-destructive-foreground',
};

export const outcome = (us, them) => (us > them ? 'W' : us < them ? 'L' : 'D');

/** A W / D / L chip (G / E / P in Spanish). */
export function Res({ r }) {
  const { lang } = useFilmText();
  return (
    <i
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold not-italic',
        RES_TONE[r],
      )}
    >
      {lang === 'es' ? LETTER_ES[r] : r}
    </i>
  );
}

/** Loading, empty and error states, centred in the page. */
export function FilmStatus({ children }) {
  return (
    <div
      role="status"
      className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

/** "<us> Goal", "<opponent> Shot", "Kickoff": the chip text for an event. */
export function eventLabel(ev, us, g, e, override) {
  const team = e.t === 'D' ? `${us} ` : e.t === 'O' ? `${g.opponent} ` : '';
  return `${team}${override ?? ev(e.y)}`;
}

/** "Sunday 11 October 2026 · 13:30 · Home" */
export function useDateLine(g) {
  const { locale, t } = useFilmText();
  const where = g.home === null ? '' : g.home ? t('homeShort') : t('awayShort');
  return [formatDate(g.date, locale), g.time, where].filter(Boolean).join(' · ');
}

/** A small uppercase label above a heading. */
export function Eyebrow({ children, className }) {
  return (
    <span className={cn('block text-[11px] font-bold uppercase tracking-wider text-muted-foreground', className)}>
      {children}
    </span>
  );
}

/** A page section: eyebrow, title, optional sub line, then the body. Linkable by id. */
export function FilmSection({ id, eyebrow, title, sub, children }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-md border border-border bg-card p-4 shadow-sm sm:p-5">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-0.5 text-lg font-bold text-foreground">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** In-page section links. They scroll rather than navigate, so the router keeps the address. */
export function Toc({ items }) {
  const { t } = useFilmText();
  const go = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };
  return (
    <nav aria-label={t('sections')} className="flex flex-wrap gap-1.5">
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => go(id)}
          className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

/** Two bars meeting in the middle: ours from the left, theirs to the right. */
export function BarRow({ label, us, them, unit = '' }) {
  const max = Math.max(us, them, 1);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-right font-bold tabular-nums text-primary">
          {us}
          {unit}
        </span>
        <span className="flex h-2 flex-1 justify-end overflow-hidden rounded-full bg-muted">
          <span className="h-full rounded-full bg-primary" style={{ width: `${(us / max) * 100}%` }} />
        </span>
      </div>
      <div className="max-w-[9rem] text-center text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <span className="h-full rounded-full bg-accent" style={{ width: `${(them / max) * 100}%` }} />
        </span>
        <span className="w-12 shrink-0 font-bold tabular-nums text-accent">
          {them}
          {unit}
        </span>
      </div>
    </div>
  );
}
