import { describe, it, expect } from 'vitest';
import { classifyEvent, EVENT_TYPES } from '../../utils/eventClassifier';

describe('classifyEvent', () => {
  // ── Practice ──────────────────────────────────────────────────────────────
  describe('practice detection', () => {
    it('classifies "Practice" in title', () => {
      expect(classifyEvent('Team Practice')).toBe('practice');
    });

    it('is case-insensitive for practice', () => {
      expect(classifyEvent('PRACTICE SESSION')).toBe('practice');
      expect(classifyEvent('practice')).toBe('practice');
    });

    it('strips (Cancelled) prefix before checking practice', () => {
      expect(classifyEvent('(Cancelled) Practice')).toBe('practice');
    });
  });

  // ── Tournament ─────────────────────────────────────────────────────────────
  describe('tournament detection', () => {
    it('classifies "tournament" in title', () => {
      expect(classifyEvent('Bayou Soccer Tournament')).toBe('tournament');
    });

    it('classifies tournament keywords: cup, classic, showcase, shootout', () => {
      expect(classifyEvent('Spring Cup')).toBe('tournament');
      expect(classifyEvent('Holiday Classic')).toBe('tournament');
      expect(classifyEvent('Summer Showcase')).toBe('tournament');
      expect(classifyEvent('Goal Shootout')).toBe('tournament');
    });

    it('classifies tournament keywords: madness, blast, challenge, final', () => {
      expect(classifyEvent('March Madness')).toBe('tournament');
      expect(classifyEvent('Fall Blast')).toBe('tournament');
      expect(classifyEvent('State Challenge')).toBe('tournament');
      expect(classifyEvent('Championship Final')).toBe('tournament');
    });

    it('detects tournament from description when title is generic', () => {
      expect(classifyEvent('Game vs Opponent', 'This is a tournament event')).toBe('tournament');
    });

    it('description takes precedence over title for tournament', () => {
      // Description contains "cup" → tournament wins over generic game title
      expect(classifyEvent('Game vs Opponent', 'Part of the regional cup')).toBe('tournament');
    });
  });

  // ── League ─────────────────────────────────────────────────────────────────
  describe('league detection', () => {
    it('classifies "game vs" with a league keyword in description', () => {
      expect(classifyEvent('Game vs Rival FC', 'PSL match day 3')).toBe('league');
    });

    it('classifies "game vs" with lsap/lcsl/st charles league in description', () => {
      expect(classifyEvent('Game vs Tigers', 'LSAP league game')).toBe('league');
      expect(classifyEvent('Game vs Blue', 'LCSL division 2')).toBe('league');
      expect(classifyEvent('Game vs Red', 'St Charles League matchday')).toBe('league');
    });

    it('classifies "game vs" without league keywords as league (fallback)', () => {
      expect(classifyEvent('Game vs Rival')).toBe('league');
    });

    it('classifies "game @" format', () => {
      expect(classifyEvent('Game @ City Park')).toBe('league');
    });
  });

  // ── Friendly / Scrimmage ───────────────────────────────────────────────────
  describe('friendly/scrimmage detection', () => {
    it('classifies "scrimmage" in title', () => {
      expect(classifyEvent('Scrimmage vs Metairie FC')).toBe('friendly');
    });

    it('is case-insensitive for scrimmage', () => {
      expect(classifyEvent('SCRIMMAGE')).toBe('friendly');
    });
  });

  // ── Generic Event ──────────────────────────────────────────────────────────
  describe('generic event fallback', () => {
    it('returns "event" for team meetings', () => {
      expect(classifyEvent('Team Meeting')).toBe('event');
    });

    it('returns "event" for fundraisers', () => {
      expect(classifyEvent('Fundraiser Night')).toBe('event');
    });

    it('returns "event" for empty string', () => {
      expect(classifyEvent('')).toBe('event');
    });

    it('returns "event" for undefined inputs', () => {
      expect(classifyEvent(undefined, undefined)).toBe('event');
    });
  });

  // ── Cancelled prefix handling ──────────────────────────────────────────────
  describe('cancelled event classification', () => {
    it('still classifies tournament despite cancelled prefix', () => {
      expect(classifyEvent('(Cancelled) Bayou Soccer Tournament')).toBe('tournament');
    });

    it('still classifies scrimmage despite cancelled prefix', () => {
      expect(classifyEvent('(Cancelled) Scrimmage vs Rivals')).toBe('friendly');
    });
  });
});

// ── EVENT_TYPES shape ─────────────────────────────────────────────────────────
describe('EVENT_TYPES', () => {
  const expectedTypes = ['tournament', 'league', 'friendly', 'practice', 'event'];

  it('contains all expected event type keys', () => {
    expectedTypes.forEach((type) => {
      expect(EVENT_TYPES).toHaveProperty(type);
    });
  });

  it('each type has required display properties', () => {
    expectedTypes.forEach((type) => {
      const t = EVENT_TYPES[type];
      expect(t).toHaveProperty('label');
      expect(t).toHaveProperty('color');
      expect(t).toHaveProperty('colorLight');
      expect(t).toHaveProperty('border');
      expect(t).toHaveProperty('dot');
    });
  });
});
