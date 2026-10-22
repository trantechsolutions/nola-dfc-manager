import { createContext, Fragment, useContext } from 'react';
import { useFilmText } from './FilmContext';
import { minutes, whoPlayed } from './lib/lineup';
import { parseMarkup } from './lib/markup';
import { candidates, playerLabel, splitPositions } from './lib/positions';

/**
 * The squad, inside the coaches' breakdown only: position tooltips then list who played there in this game
 * (with a lineup) or who could have made the play (without one). { players, stints | null }
 */
export const RosterContext = createContext(null);

/** Text with each position acronym (GK, LCB, ST…) wrapped so its full name shows on hover or tap. */
function Pos({ text }) {
  const { lang, t } = useFilmText();
  const roster = useContext(RosterContext);
  const full = (key, title) => {
    if (!roster) return title;
    const played = roster.stints ? whoPlayed(roster.stints, key) : [];
    if (played.length) {
      const label = (name) => {
        const p = roster.players.find((x) => x.name === name);
        return p ? playerLabel(p) : name;
      };
      return `${title} · ${t('playedThere')}\n${played.map((p) => `${label(p.player)} · ${minutes(p.seconds)}'`).join('\n')}`;
    }
    const who = candidates(key, roster.players);
    return who.length
      ? `${title} · ${t('couldBe')}\n${who.map(playerLabel).join('\n')}`
      : `${title} · ${t('noOneListed')}`;
  };
  return (
    <>
      {splitPositions(text, lang).map((p, i) => {
        if (typeof p === 'string') return <Fragment key={i}>{p}</Fragment>;
        const f = full(p.key, p.title);
        return (
          <abbr key={i} title={f} className="no-underline border-b border-dotted border-muted-foreground cursor-help">
            {p.abbr}
            <span className="sr-only"> ({f.replace(/\n/g, ', ')})</span>
          </abbr>
        );
      })}
    </>
  );
}

/** Renders a data string with **bold**, *italic* and `mono`. Never renders HTML. */
export function Md({ s }) {
  return (
    <>
      {parseMarkup(s).map((r, i) =>
        r.kind === 'b' ? (
          <b key={i} className="font-semibold text-foreground">
            <Pos text={r.text} />
          </b>
        ) : r.kind === 'i' ? (
          <i key={i}>
            <Pos text={r.text} />
          </i>
        ) : r.kind === 'mono' ? (
          <span key={i} className="font-mono text-[0.9em]">
            {r.text}
          </span>
        ) : (
          <Pos key={i} text={r.text} />
        ),
      )}
    </>
  );
}

/** A game's { en, es } text in the current language. */
export function T({ t: text }) {
  const { tx } = useFilmText();
  return text ? <Md s={tx(text)} /> : null;
}
