// src/utils/opponentCards.js
// Turns the two halves of the planner — the club contact directory and the
// season's matchups — into one list of team cards.
//
// The link between them is the club name itself: a matchup carries a free-text
// opponent_name, a contact carries club_name, and a card is every game against
// the same club with that club's contact attached. Matching is case- and
// whitespace-insensitive so "NOLA FC " and "nola fc" are one team, not two.
//
// Kept out of the component so the grouping can be tested on its own and the
// card only has to render what it is handed.

export const UNASSIGNED_KEY = '__unassigned__';

/** The identity a club name is matched on. */
export const clubKey = (name) => (name || '').trim().toLowerCase();

// A card's identity colour. Eight muted pairs, picked by hashing the club key,
// so the same club is the same colour on every render and any two cards next to
// each other are almost never the same one. Full class strings on purpose —
// Tailwind only ships classes it can see written out.
const ACCENTS = [
  { tile: 'bg-blue-500 text-white', edge: 'bg-blue-500' },
  { tile: 'bg-emerald-500 text-white', edge: 'bg-emerald-500' },
  { tile: 'bg-violet-500 text-white', edge: 'bg-violet-500' },
  { tile: 'bg-amber-500 text-white', edge: 'bg-amber-500' },
  { tile: 'bg-rose-500 text-white', edge: 'bg-rose-500' },
  { tile: 'bg-cyan-600 text-white', edge: 'bg-cyan-600' },
  { tile: 'bg-indigo-500 text-white', edge: 'bg-indigo-500' },
  { tile: 'bg-teal-600 text-white', edge: 'bg-teal-600' },
];

const NEUTRAL_ACCENT = { tile: 'bg-muted text-muted-foreground', edge: 'bg-border' };

/** Stable colour for a club, so a card keeps its identity across reloads. */
export function clubAccent(key) {
  if (!key) return NEUTRAL_ACCENT;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  return ACCENTS[hash % ACCENTS.length];
}

/** Up to two letters for the card's tile — "Bayou FC" → "BF", "Kickers" → "K". */
export function clubInitials(name) {
  const words = String(name || '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * Games first by date, undated last (they are still being negotiated, so they
 * belong at the bottom of the card, not the top), then by creation order.
 */
const byMatchDate = (a, b) => {
  if (a.matchDate && b.matchDate) {
    if (a.matchDate !== b.matchDate) return a.matchDate < b.matchDate ? -1 : 1;
    return (a.matchTime || '').localeCompare(b.matchTime || '');
  }
  if (a.matchDate) return -1;
  if (b.matchDate) return 1;
  return (a.createdAt || '').localeCompare(b.createdAt || '');
};

/**
 * One card per club you play.
 *
 * Every saved contact gets a card even with no games on it yet — that is how a
 * club enters the planner, before there is anything to schedule. An opponent
 * name that appears on a matchup but is not in the directory gets a card too,
 * flagged `unsaved` so the UI can offer to file it. Games with no opponent yet
 * collect in a single trailing card.
 *
 * Two contacts saved under the same club name collapse onto one card; the first
 * one wins, since they are the same team by every measure the planner has.
 */
export function buildOpponentCards(contacts = [], matchups = []) {
  const cards = new Map();

  contacts.forEach((contact) => {
    const key = clubKey(contact?.clubName);
    if (!key || cards.has(key)) return;
    cards.set(key, {
      key,
      clubName: (contact.clubName || '').trim(),
      contact,
      unsaved: false,
      matchups: [],
    });
  });

  const unassigned = [];

  matchups.forEach((matchup) => {
    const key = clubKey(matchup?.opponentName);
    if (!key) {
      unassigned.push(matchup);
      return;
    }
    if (!cards.has(key)) {
      cards.set(key, {
        key,
        clubName: (matchup.opponentName || '').trim(),
        contact: null,
        unsaved: true,
        matchups: [],
      });
    }
    cards.get(key).matchups.push(matchup);
  });

  const list = Array.from(cards.values())
    .map((card) => ({ ...card, matchups: [...card.matchups].sort(byMatchDate) }))
    .sort((a, b) => a.clubName.localeCompare(b.clubName));

  if (unassigned.length > 0) {
    list.push({
      key: UNASSIGNED_KEY,
      clubName: '',
      contact: null,
      unsaved: false,
      isUnassigned: true,
      matchups: [...unassigned].sort(byMatchDate),
    });
  }

  return list;
}
