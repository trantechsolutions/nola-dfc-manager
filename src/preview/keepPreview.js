// Dev-only: a stand-in database for the scorekeeper preview (preview.html?page=keep). The scorekeeper reads the
// squad and schedule and writes its log straight through `supabase`, so for the preview those calls answer from
// the sample team below and writes are kept in memory.
import { supabase } from '../supabase';

const at = (days, hour) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const TABLES = {
  teams: [{ id: 't1', name: 'U12 Girls Premier' }],
  film_teams: [{ team_id: 't1', short_name: 'Arsenal' }],
  players: [
    ['00000000-0000-4000-8000-000000000001', 'Maya', 'Thompson', 7],
    ['00000000-0000-4000-8000-000000000002', 'Ava', 'Bennett', 10],
    ['00000000-0000-4000-8000-000000000003', 'Zoe', 'Lawson', 4],
    ['00000000-0000-4000-8000-000000000004', 'Lila', 'Nguyen', 14],
    ['00000000-0000-4000-8000-000000000005', 'Chloe', 'Hughes', 22],
    ['00000000-0000-4000-8000-000000000006', 'Nora', 'Foster', 1],
    ['00000000-0000-4000-8000-000000000007', 'Emma', 'Grant', 9],
    ['00000000-0000-4000-8000-000000000008', 'Sofia', 'Brooks', 3],
  ].map(([id, first_name, last_name, jersey_number]) => ({
    id,
    first_name,
    last_name,
    jersey_number,
    status: 'active',
  })),
  film_positions: [
    { player_id: '00000000-0000-4000-8000-000000000006', positions: ['GK'] },
    { player_id: '00000000-0000-4000-8000-000000000007', positions: ['ST'] },
    { player_id: '00000000-0000-4000-8000-000000000003', positions: ['CB'] },
  ],
  team_events: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'vs Chelsea',
      location: 'Emirates Stadium',
      // Kicked off 20 minutes ago, so its stat window is open whenever the preview runs.
      event_date: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      event_type: 'league',
      is_cancelled: false,
      opponent: 'Chelsea',
      is_home: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'at Liverpool',
      location: 'Anfield',
      event_date: at(5, 10),
      event_type: 'league',
      is_cancelled: false,
      opponent: 'Liverpool',
      is_home: false,
    },
  ],
  keeper_entries: [],
};

// Enough of the query builder for what the scorekeeper calls: select / eq / order / maybeSingle / upsert.
function query(name) {
  let rows = TABLES[name] || [];
  const q = {
    select: () => q,
    eq: (col, val) => {
      rows = rows.filter((r) => (col === 'team_id' && !('team_id' in r) ? true : r[col] === val));
      return q;
    },
    order: () => q,
    maybeSingle: async () => ({ data: rows[0] || null, error: null }),
    upsert: async (list) => {
      TABLES[name].push(...list);
      return { error: null };
    },
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return q;
}

export function useKeepPreviewDatabase() {
  supabase.from = (name) => query(name);
  supabase.rpc = async (fn) => ({ data: fn === 'keeper_can_keep' ? true : 0, error: null });
}

// ── A game in progress, for preview.html?page=live ──
const T0 = Date.now() - 23 * 60 * 1000;
let seq = 0;
const entryId = () => `preview-${String(++seq).padStart(6, '0')}`;
const tap = (min, f) => ({ id: entryId(), at: T0 + min * 60000, k: 'ev', h: 1, c: `${min}:00`, ...f });
export const LIVE_GAME = '2026-10-22-chelsea';
export const LIVE_ENTRIES = [
  {
    id: entryId(),
    at: T0,
    k: 'setup',
    setup: {
      slug: LIVE_GAME,
      date: new Date().toISOString().slice(0, 10),
      time: '18:00',
      opponent: 'Chelsea',
      home: true,
      format: 7,
      halfMin: 30,
      start: [],
    },
  },
  { id: entryId(), at: T0, k: 'clock', h: 1, c: '0:00', run: true },
  tap(4, { type: 'Shot', t: 'D', player: 'Emma Grant', on: true, result: 'saved' }),
  tap(9, { type: 'Goal', t: 'D', player: 'Emma Grant', assist: 'Ava Bennett' }),
  tap(14, { type: 'Save', t: 'D', player: 'Nora Foster' }),
  tap(17, { type: 'Goal', t: 'O', opp: 'pl' }),
  tap(21, { type: 'Yellow', t: 'O', opp: 'pl' }),
];
// The next goal, sent a moment after the page opens, to show the celebration.
export const LIVE_NEXT = tap(23, { type: 'Goal', t: 'D', player: 'Maya Thompson' });
