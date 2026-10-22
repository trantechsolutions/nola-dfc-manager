import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import { filmService } from '../services/filmService';
import { squadFrom } from './squad';
import { halfLengths, lineupFor, playLineup, playSec } from './lib/lineup';
import { nameMoment } from './lib/naming';

/**
 * One team's game film: its published games for everyone on the team, plus the coaches' breakdowns and the
 * squad with lineups for its coaches. Row-level security decides what comes back; this only asks.
 */
const Ctx = createContext(null);

export function FilmProvider({ teamId, children }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [coachData, setCoachData] = useState({ breakdowns: null, squad: null });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    setCoachData({ breakdowns: null, squad: null });
    Promise.all([filmService.getLibrary(teamId), filmService.isCoach(teamId)]).then(
      ([lib, coach]) => live && setState({ status: 'ready', ...lib, coach }),
      (error) => live && setState({ status: 'error', error }),
    );
    return () => {
      live = false;
    };
  }, [teamId, attempt]);

  // Coaches only: the breakdowns and the squad load once the library has.
  const coach = state.status === 'ready' && state.coach;
  useEffect(() => {
    if (!coach) return;
    let live = true;
    Promise.all([filmService.getBreakdowns(teamId), filmService.getSquadRows(teamId)]).then(
      ([breakdowns, rows]) =>
        live && setCoachData({ breakdowns, squad: squadFrom(rows.players, rows.positions, rows.lineups) }),
      () => live && setCoachData({ breakdowns: {}, squad: null }),
    );
    return () => {
      live = false;
    };
  }, [teamId, coach]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const value = useMemo(() => ({ teamId, ...state, ...coachData, retry }), [teamId, state, coachData, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilm() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFilm outside FilmProvider');
  return v;
}

/**
 * The film's text helpers: t() for interface text (film namespace), tx() for a game's own { en, es }
 * prose, ev() for an event type, and the locale for dates and numbers.
 */
export function useFilmText() {
  const { t: base, locale: lang } = useT();
  return useMemo(() => {
    const es = lang === 'es';
    return {
      lang: es ? 'es' : 'en',
      locale: es ? 'es-US' : 'en-GB',
      t: (key, vars) => base(`film.${key}`, vars),
      tx: (text) => (text ? text[es ? 'es' : 'en'] || text.en : ''),
      ev: (y) => base(`filmEvents.${y}`, y),
      halfRef: (s) => (es ? s.replace(/\b([12])H\b/g, '$1.ª') : s),
    };
  }, [base, lang]);
}

/** "Sunday 11 October 2026", or the short form "Sun 11 Oct". */
export function formatDate(iso, locale, style = 'long') {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(
    locale,
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
  ).format(dt);
}

/**
 * For a coach and a game with a confirmed lineup: swaps positions in a moment's description for the player
 * who held them. Null otherwise, and moments read by position only.
 */
export function useNamer(g) {
  const { squad } = useFilm();
  return useMemo(() => {
    const r = squad && lineupFor(squad.lineups, g.slug);
    if (!r || r.estimated) return null;
    const len = halfLengths(g);
    const { stints } = playLineup(r.lineup, len);
    return (e, text) => (e.t === 'N' ? text : nameMoment(text, stints, playSec(len, e.h, e.c), g.opponent, (p) => p));
  }, [squad, g]);
}
