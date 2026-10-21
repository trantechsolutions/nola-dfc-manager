import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/supabaseService', () => ({ supabaseService: {} }));

import { mergeSavedEvents } from '../../hooks/useSchedule';

const NOW = Math.floor(new Date('2026-10-21T12:00:00Z').getTime() / 1000);
const PAST = '2026-09-01T15:00:00.000Z';
const FUTURE = '2026-11-01T15:00:00.000Z';
const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);

const saved = (uid, eventDate, extra = {}) => ({
  uid,
  title: uid,
  description: null,
  location: null,
  eventDate,
  eventType: 'league',
  isCancelled: false,
  ...extra,
});
const feed = (id, iso, extra = {}) => ({ id, title: id, timestamp: ts(iso), eventType: 'league', ...extra });

describe('mergeSavedEvents', () => {
  it('back-fills past events the feed no longer carries', () => {
    const merged = mergeSavedEvents([], [saved('old-game', PAST)], { now: NOW });
    expect(merged.map((e) => e.id)).toEqual(['old-game']);
    expect(merged[0].location).toBe('TBD');
    expect(merged[0].isoDate).toBe('2026-09-01');
  });

  it('prefers the feed copy when the UID matches', () => {
    const merged = mergeSavedEvents([feed('g1', PAST, { title: 'Live' })], [saved('g1', PAST)], { now: NOW });
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Live');
  });

  it('does not resurrect upcoming DB events while the feed is healthy', () => {
    expect(mergeSavedEvents([], [saved('stale', FUTURE)], { now: NOW })).toEqual([]);
  });

  it('falls back to upcoming DB events when the feed failed', () => {
    const merged = mergeSavedEvents([], [saved('next', FUTURE)], { now: NOW, feedFailed: true });
    expect(merged.map((e) => e.id)).toEqual(['next']);
  });

  it('skips a grouped tournament row when the feed has its first game', () => {
    const merged = mergeSavedEvents(
      [feed('game-1', PAST, { eventType: 'tournament' })],
      [saved('tournament-fall-cup-2026-09-01', PAST, { eventType: 'tournament' })],
      { now: NOW },
    );
    expect(merged.map((e) => e.id)).toEqual(['game-1']);
  });

  it('skips an old-feed row when the new feed has the same game under another UID', () => {
    const merged = mergeSavedEvents([feed('google-uid', PAST)], [saved('ollie-uid', PAST)], { now: NOW });
    expect(merged.map((e) => e.id)).toEqual(['google-uid']);
  });
});
