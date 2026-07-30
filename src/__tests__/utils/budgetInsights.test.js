import { describe, it, expect } from 'vitest';
import { buildCategoryAdvice, varianceTone, TONE_STYLES } from '../../utils/budgetInsights';

const formatMoney = (n) => `$${Number(n).toFixed(2)}`;

const makeProjection = (overrides = {}) => ({
  avgBudgeted: 1000,
  avgActual: 1000,
  variance: 0,
  seasonsTracked: 2,
  peakActual: 1000,
  lowActual: 1000,
  lastActual: 1000,
  lastSeasonId: '2024-25',
  history: [],
  suggested: 1000,
  safeSuggested: 1000,
  ...overrides,
});

const advise = (projection, currentBudgeted = 0, rosterSize = 13) =>
  buildCategoryAdvice({ projection, currentBudgeted, rosterSize, formatMoney });

const keys = (tips) => tips.map((t) => t.key);
const byKey = (tips, key) => tips.find((t) => t.key === key);

describe('varianceTone', () => {
  it('treats spend between 0 and 5 percent over budget as its own band, not "under"', () => {
    // Regression: the old view gated the bar colour on variance > 5, so a
    // category 4% over budget rendered in the same green as one under budget.
    expect(varianceTone(4, 1040)).toBe('watch');
    expect(TONE_STYLES.watch.bar).not.toBe(TONE_STYLES.under.bar);
  });

  it('flags clear overspend and underspend', () => {
    expect(varianceTone(46, 2547)).toBe('over');
    expect(varianceTone(-39, 652)).toBe('under');
  });

  it('treats a small underspend as on target', () => {
    expect(varianceTone(-7, 4482)).toBe('ontarget');
  });

  it('reports spend with no budget as unbudgeted rather than 0% variance', () => {
    expect(varianceTone(null, 800)).toBe('unbudgeted');
  });

  it('does not flag a dormant category as unbudgeted', () => {
    expect(varianceTone(null, 0)).toBe('ontarget');
  });
});

describe('buildCategoryAdvice', () => {
  it('returns nothing for a category with no tracked seasons', () => {
    expect(advise(makeProjection({ seasonsTracked: 0 }))).toEqual([]);
    expect(buildCategoryAdvice({ projection: null, formatMoney })).toEqual([]);
  });

  it('recommends the average-based budget for a stable category', () => {
    const tips = advise(makeProjection({ suggested: 1010 }));
    expect(byKey(tips, 'plan').text).toContain('$1010.00');
    expect(byKey(tips, 'plan').text).toContain('2 seasons');
  });

  it('recommends the peak-based budget when spend swings between seasons', () => {
    const tips = advise(makeProjection({ avgActual: 1000, lowActual: 400, peakActual: 1600, safeSuggested: 1600 }));
    expect(byKey(tips, 'plan').text).toContain('$400.00');
    expect(byKey(tips, 'plan').text).toContain('$1600.00');
    expect(byKey(tips, 'plan').text).toContain('cover a bad year');
  });

  it('breaks the category down per player', () => {
    const tips = advise(makeProjection({ avgActual: 1300 }), 0, 13);
    expect(byKey(tips, 'per-player').text).toContain('$100.00 per player');
  });

  it('omits the per-player tip when the roster is unknown', () => {
    expect(keys(advise(makeProjection(), 0, 0))).not.toContain('per-player');
  });

  it('warns when the category has history but nothing budgeted this season', () => {
    const tips = advise(makeProjection({ avgActual: 900 }), 0);
    expect(byKey(tips, 'gap').tone).toBe('warn');
    expect(byKey(tips, 'gap').text).toContain('Nothing budgeted this season');
  });

  it('sizes the shortfall when this season underfunds the category', () => {
    const tips = advise(makeProjection({ avgActual: 1000 }), 700);
    expect(byKey(tips, 'gap').tone).toBe('warn');
    expect(byKey(tips, 'gap').text).toContain('$300.00 short');
  });

  it('surfaces headroom when this season overfunds the category', () => {
    const tips = advise(makeProjection({ avgActual: 1000 }), 1400);
    expect(byKey(tips, 'gap').tone).toBe('good');
    expect(byKey(tips, 'gap').text).toContain('$400.00 above typical spend');
  });

  it('turns a chronic overspend into a concrete savings target', () => {
    const tips = advise(
      makeProjection({ avgBudgeted: 1750, avgActual: 2547.22, variance: 45.55, suggested: 2550 }),
      1750,
      13,
    );
    const tip = byKey(tips, 'overspend');
    expect(tip.tone).toBe('warn');
    expect(tip.text).toContain('$797.22 over budget per season');
    expect(tip.text).toContain('$61.32 per player');
    expect(tip.text).toContain('$2550.00');
  });

  it('points out money freed by a chronic underspend', () => {
    const tips = advise(makeProjection({ avgBudgeted: 1065, avgActual: 652.5, variance: -38.7 }), 1065);
    const tip = byKey(tips, 'underspend');
    expect(tip.tone).toBe('good');
    expect(tip.text).toContain('$412.50');
  });

  it('does not raise an overspend or underspend tip inside the on-target band', () => {
    const tips = advise(makeProjection({ avgBudgeted: 4813, avgActual: 4482.79, variance: -6.86 }), 4813);
    expect(keys(tips)).not.toContain('overspend');
    expect(keys(tips)).not.toContain('underspend');
  });

  it('calls out spending that has no budget line behind it', () => {
    const tips = advise(makeProjection({ avgBudgeted: 0, avgActual: 640, variance: null }), 0);
    expect(byKey(tips, 'unbudgeted').text).toContain('$640.00 spent with no budget line');
  });

  it('marks single-season projections as low confidence', () => {
    const tips = advise(makeProjection({ seasonsTracked: 1, lastSeasonId: '2024-25' }), 1000);
    expect(byKey(tips, 'confidence').text).toContain('2024-25');
    expect(byKey(tips, 'confidence').text).toContain('rough estimate');
  });

  it('leaves the confidence tip off once several seasons are tracked', () => {
    expect(keys(advise(makeProjection({ seasonsTracked: 3 }), 1000))).not.toContain('confidence');
  });
});
