// src/utils/eventClassifier.js
// Centralized event classification based on iCal SUMMARY and DESCRIPTION fields.

const TOURNAMENT_KEYWORDS = [
  'tournament', 'cup', 'classic', 'showcase', 'shootout', 
  'madness', 'blast', 'challenge', 'final', 'semi-final'
];

const LEAGUE_KEYWORDS = [
  'psl', 'lsap', 'lcsl', 'st charles league'
];

/**
 * Classify an event based on its title (SUMMARY) and description (DESCRIPTION).
 * Returns: 'tournament' | 'league' | 'friendly' | 'practice' | 'event'
 */
export function classifyEvent(title = '', description = '') {
  const t = title.toLowerCase();
  const d = description.toLowerCase();
  const combined = `${t} ${d}`;

  // Cancelled events still get classified (for historical analytics)
  const cleanTitle = t.replace(/^\(cancelled\)\s*/i, '');

  // 1. Practice
  if (cleanTitle.includes('practice')) return 'practice';

  // 2. Tournament — check description first (most reliable), then title
  if (TOURNAMENT_KEYWORDS.some(kw => d.includes(kw))) return 'tournament';
  if (TOURNAMENT_KEYWORDS.some(kw => t.includes(kw))) return 'tournament';

  // 3. League game — description contains league identifiers
  if (cleanTitle.includes('game vs') && LEAGUE_KEYWORDS.some(kw => d.includes(kw))) return 'league';

  // 4. Friendly / Scrimmage
  if (cleanTitle.includes('scrimmage')) return 'friendly';

  // 5. General game (has "game vs" but no league/tournament markers)
  if (cleanTitle.includes('game vs') || cleanTitle.includes('game @')) return 'league'; // default games to league

  // 6. Everything else: team events (meetings, evaluations, fundraisers, etc.)
  return 'event';
}

/**
 * Returns display info for each event type.
 */
export const EVENT_TYPES = {
  tournament: { label: 'Tournament', color: 'bg-violet-500', colorLight: 'bg-violet-50 text-violet-700', border: 'border-violet-200', dot: 'bg-violet-400' },
  league:     { label: 'League',     color: 'bg-amber-500',  colorLight: 'bg-amber-50 text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-400' },
  friendly:   { label: 'Friendly',   color: 'bg-cyan-500',   colorLight: 'bg-cyan-50 text-cyan-700',     border: 'border-cyan-200',   dot: 'bg-cyan-400' },
  practice:   { label: 'Practice',   color: 'bg-slate-400',  colorLight: 'bg-slate-100 text-slate-600',  border: 'border-slate-200',  dot: 'bg-slate-400' },
  event:      { label: 'Event',      color: 'bg-blue-500',   colorLight: 'bg-blue-50 text-blue-700',     border: 'border-blue-200',   dot: 'bg-blue-400' },
};

/**
 * Hex colors for FullCalendar rendering.
 */
export const EVENT_CALENDAR_COLORS = {
  tournament: { bg: '#8b5cf6', border: '#7c3aed' }, // violet
  league:     { bg: '#f59e0b', border: '#d97706' }, // amber
  friendly:   { bg: '#06b6d4', border: '#0891b2' }, // cyan
  practice:   { bg: '#94a3b8', border: '#64748b' }, // slate
  event:      { bg: '#3b82f6', border: '#2563eb' }, // blue
};