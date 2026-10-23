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

// "Away · BRSC 13U B Black" → "BRSC 13U B Black": the date line already says home or away.
const VENUE = /^\s*(Home|Away|Local|Visitante)\s*(·\s*)?|\s*·\s*(Home|Away|Local|Visitante)\s*$/gi;
export const stripVenue = (x) => (x || '').replace(VENUE, '').trim();

/** "Sun 11 Oct · 13:30 · Home" */
export function useDateLine(g) {
  const { locale, t } = useFilmText();
  const where = g.home === null ? '' : g.home ? t('homeShort') : t('awayShort');
  return [formatDate(g.date, locale, 'short'), g.time, where].filter(Boolean).join(' · ');
}

/** A small label above a heading: what the section is part of. */
export function Eyebrow({ children, className }) {
  return <span className={cn('block text-xs font-semibold text-muted-foreground', className)}>{children}</span>;
}

/**
 * A page section: eyebrow, title, optional sub line, then the body. Linkable by id. On a phone it is open
 * text under a rule, so reading gets the whole width; from sm up it sits in a card.
 */
export function FilmSection({ id, eyebrow, title, sub, children }) {
  return (
    <section
      id={id}
      className="scroll-mt-28 border-t border-border pt-5 sm:rounded-md sm:border sm:bg-card sm:p-5 sm:shadow-sm"
    >
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
    // One row that scrolls sideways on a phone, rather than wrapping into a block of chips.
    <nav
      aria-label={t('sections')}
      className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => go(id)}
          className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

/** Two bars meeting in the middle under their label: ours from the left, theirs to the right. */
export function BarRow({ label, us, them, unit = '' }) {
  const max = Math.max(us, them, 1);
  return (
    <div className="py-1.5">
      <div className="text-center text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 grid grid-cols-[3rem_1fr_1fr_3rem] items-center gap-2 text-sm">
        <span className="text-right font-bold tabular-nums text-primary">
          {us}
          {unit}
        </span>
        <span className="flex h-2 justify-end overflow-hidden rounded-full bg-muted">
          <span className="h-full rounded-full bg-primary" style={{ width: `${(us / max) * 100}%` }} />
        </span>
        <span className="flex h-2 overflow-hidden rounded-full bg-muted">
          <span className="h-full rounded-full bg-accent" style={{ width: `${(them / max) * 100}%` }} />
        </span>
        <span className="font-bold tabular-nums text-accent">
          {them}
          {unit}
        </span>
      </div>
    </div>
  );
}
