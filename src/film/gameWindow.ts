// When stats can be kept for a scheduled game: from 2 hours before kickoff until 2 hours after it ends (90 minutes
// when the event has no end time). The database holds every entry to the same rule
// (sql/keeper_game_window_migration.sql); the scorekeeper and the schedule read it from here.
export const WINDOW_MS = 2 * 60 * 60 * 1000;
const DEFAULT_GAME_MS = 90 * 60 * 1000;

export type GameWindow = { opens: number; closes: number };

export const windowFor = (start: string, end?: string | null): GameWindow => {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s + DEFAULT_GAME_MS;
  return { opens: s - WINDOW_MS, closes: e + WINDOW_MS };
};

export const isOpen = (w: GameWindow | null | undefined, now: number) => !!w && now >= w.opens && now <= w.closes;
