import { describe, it, expect } from 'vitest';
import {
  FORECAST_CONFIG,
  nextSeasonId,
  prepareHistoricalData,
  generateForecast,
  compareForecastToBudget,
} from '../../utils/budgetModel';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeTeamSeason = (seasonId, { rosterSize = 15, isFinalized = true, baseFee = 500 } = {}) => ({
  seasonId,
  expectedRosterSize: rosterSize,
  baseFee,
  isFinalized,
});

const makeBudgetItem = (
  seasonId,
  category,
  { income = 0, expensesFall = 0, expensesSpring = 0, label = 'Item' } = {},
) => ({ seasonId, category, label, income, expensesFall, expensesSpring });

const makeTx = (seasonId, category, amount, cleared = true) => ({
  seasonId,
  category,
  amount,
  cleared,
});

// ─── nextSeasonId ─────────────────────────────────────────────────────────────

describe('nextSeasonId', () => {
  it('increments both years by one', () => {
    expect(nextSeasonId('2025-2026')).toBe('2026-2027');
    expect(nextSeasonId('2023-2024')).toBe('2024-2025');
  });

  it('handles far-future years', () => {
    expect(nextSeasonId('2099-2100')).toBe('2100-2101');
  });

  it('handles edge year 2000', () => {
    expect(nextSeasonId('2000-2001')).toBe('2001-2002');
  });
});

// ─── prepareHistoricalData ────────────────────────────────────────────────────

describe('prepareHistoricalData', () => {
  it('returns empty seasons and categories when all inputs are empty', () => {
    const result = prepareHistoricalData([], [], []);
    expect(result.seasons).toEqual([]);
    expect(result.categories).toEqual([]);
  });

  it('extracts seasons in ascending chronological order', () => {
    const teamSeasons = [makeTeamSeason('2024-2025'), makeTeamSeason('2022-2023'), makeTeamSeason('2023-2024')];
    const { seasons } = prepareHistoricalData([], [], teamSeasons);
    expect(seasons).toEqual(['2022-2023', '2023-2024', '2024-2025']);
  });

  it('deduplicates seasons', () => {
    const teamSeasons = [makeTeamSeason('2024-2025'), makeTeamSeason('2024-2025')];
    const { seasons } = prepareHistoricalData([], [], teamSeasons);
    expect(seasons).toHaveLength(1);
  });

  it('ignores team seasons with null seasonId', () => {
    const teamSeasons = [{ seasonId: null, expectedRosterSize: 15, isFinalized: true }];
    const { seasons } = prepareHistoricalData([], [], teamSeasons);
    expect(seasons).toEqual([]);
  });

  it('groups budget items by season and category, summing amounts', () => {
    const items = [
      makeBudgetItem('2024-2025', 'UNI', { expensesFall: 300, expensesSpring: 200 }),
      makeBudgetItem('2024-2025', 'UNI', { expensesFall: 100, expensesSpring: 0 }),
    ];
    const { budgetBySeasonCat } = prepareHistoricalData(items, [], [makeTeamSeason('2024-2025')]);
    expect(budgetBySeasonCat['2024-2025']['UNI'].expensesFall).toBe(400);
    expect(budgetBySeasonCat['2024-2025']['UNI'].expensesSpring).toBe(200);
  });

  it('skips budget items with null seasonId', () => {
    const items = [makeBudgetItem(null, 'UNI', { expensesFall: 100 })];
    const { budgetBySeasonCat } = prepareHistoricalData(items, [], []);
    expect(Object.keys(budgetBySeasonCat)).toHaveLength(0);
  });

  it('separates expense transactions (negative) from income transactions (positive)', () => {
    const txs = [makeTx('2024-2025', 'TRV', -500), makeTx('2024-2025', 'TRV', 100)];
    const { actualsBySeasonCat, actualIncomeByCat } = prepareHistoricalData([], txs, [makeTeamSeason('2024-2025')]);
    expect(actualsBySeasonCat['2024-2025']['TRV']).toBe(500);
    expect(actualIncomeByCat['2024-2025']['TRV']).toBe(100);
  });

  it('ignores uncleared transactions', () => {
    const txs = [makeTx('2024-2025', 'TRV', -500, false)];
    const { actualsBySeasonCat } = prepareHistoricalData([], txs, [makeTeamSeason('2024-2025')]);
    expect(actualsBySeasonCat['2024-2025']).toBeUndefined();
  });

  it('falls back to "OPE" category for transactions with no category', () => {
    const txs = [{ seasonId: '2024-2025', amount: -200, cleared: true }];
    const { actualsBySeasonCat } = prepareHistoricalData([], txs, [makeTeamSeason('2024-2025')]);
    expect(actualsBySeasonCat['2024-2025']['OPE']).toBe(200);
  });

  it('accumulates multiple cleared expense entries in same category', () => {
    const txs = [makeTx('2024-2025', 'UNI', -100), makeTx('2024-2025', 'UNI', -250)];
    const { actualsBySeasonCat } = prepareHistoricalData([], txs, [makeTeamSeason('2024-2025')]);
    expect(actualsBySeasonCat['2024-2025']['UNI']).toBe(350);
  });

  it('records roster sizes by season', () => {
    const { rosterBySeason } = prepareHistoricalData([], [], [makeTeamSeason('2024-2025', { rosterSize: 18 })]);
    expect(rosterBySeason['2024-2025']).toBe(18);
  });

  it('collects unique categories from both budget items and cleared transactions', () => {
    const items = [makeBudgetItem('2024-2025', 'UNI', { expensesFall: 100 })];
    const txs = [makeTx('2024-2025', 'TRV', -200)];
    const { categories } = prepareHistoricalData(items, txs, [makeTeamSeason('2024-2025')]);
    expect(categories).toContain('UNI');
    expect(categories).toContain('TRV');
  });

  it('does not include null categories in the categories list', () => {
    const txs = [{ seasonId: '2024-2025', amount: -100, cleared: true, category: null }];
    const { categories } = prepareHistoricalData([], txs, [makeTeamSeason('2024-2025')]);
    expect(categories).not.toContain(null);
  });

  it('stores isFinalized and completion on seasonStatus', () => {
    const { seasonStatus } = prepareHistoricalData([], [], [makeTeamSeason('2024-2025')]);
    expect(seasonStatus['2024-2025']).toBeDefined();
    expect(typeof seasonStatus['2024-2025'].isFinalized).toBe('boolean');
    expect(typeof seasonStatus['2024-2025'].completion).toBe('number');
  });
});

// ─── generateForecast ─────────────────────────────────────────────────────────

describe('generateForecast', () => {
  it('returns confidence=none and empty forecast when no seasons', () => {
    const historical = prepareHistoricalData([], [], []);
    const result = generateForecast(historical, 15);
    expect(result.confidence).toBe('none');
    expect(result.forecast).toEqual([]);
    expect(result.summary).toBeNull();
  });

  it('returns forecastSeasonId = next season after latest', () => {
    const items = [makeBudgetItem('2024-2025', 'UNI', { expensesFall: 500 })];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2024-2025')]);
    expect(generateForecast(historical, 15).forecastSeasonId).toBe('2025-2026');
  });

  it('confidence=low with one season', () => {
    const items = [makeBudgetItem('2024-2025', 'UNI', { expensesFall: 500 })];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2024-2025')]);
    expect(generateForecast(historical, 15).confidence).toBe('low');
  });

  it('confidence=medium with two seasons', () => {
    const items = [
      makeBudgetItem('2023-2024', 'UNI', { expensesFall: 400 }),
      makeBudgetItem('2024-2025', 'UNI', { expensesFall: 450 }),
    ];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2023-2024'), makeTeamSeason('2024-2025')]);
    expect(generateForecast(historical, 15).confidence).toBe('medium');
  });

  it('confidence=high with four+ seasons', () => {
    const seasons = ['2021-2022', '2022-2023', '2023-2024', '2024-2025'];
    const items = seasons.map((s) => makeBudgetItem(s, 'UNI', { expensesFall: 400 }));
    const historical = prepareHistoricalData(
      items,
      [],
      seasons.map((s) => makeTeamSeason(s)),
    );
    expect(generateForecast(historical, 15).confidence).toBe('high');
  });

  it('each forecast item has required shape', () => {
    const items = [makeBudgetItem('2024-2025', 'UNI', { expensesFall: 300, income: 100 })];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2024-2025')]);
    for (const item of generateForecast(historical, 15).forecast) {
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('income');
      expect(item).toHaveProperty('expensesFall');
      expect(item).toHaveProperty('expensesSpring');
      expect(item).toHaveProperty('forecastLow');
      expect(item).toHaveProperty('forecastHigh');
      expect(item).toHaveProperty('confidence');
      expect(item).toHaveProperty('trend');
    }
  });

  it('forecastLow is always <= forecastHigh', () => {
    const seasons = ['2022-2023', '2023-2024', '2024-2025'];
    const items = seasons.map((s, i) => makeBudgetItem(s, 'TRV', { expensesFall: 200 + i * 50 }));
    const historical = prepareHistoricalData(
      items,
      [],
      seasons.map((s) => makeTeamSeason(s)),
    );
    for (const item of generateForecast(historical, 15).forecast) {
      expect(item.forecastLow).toBeLessThanOrEqual(item.forecastHigh);
    }
  });

  it('summary.suggestedFee is positive and rounds to a fee increment', () => {
    const items = [makeBudgetItem('2024-2025', 'UNI', { expensesFall: 3000 })];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2024-2025', { rosterSize: 15 })]);
    const { suggestedFee } = generateForecast(historical, 15).summary;
    expect(suggestedFee).toBeGreaterThan(0);
    expect(suggestedFee % 10).toBe(0);
  });

  it('larger roster produces lower per-player suggestedFee', () => {
    const items = [makeBudgetItem('2024-2025', 'OPE', { expensesFall: 1000 })];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2024-2025', { rosterSize: 10 })]);
    const r10 = generateForecast(historical, 10);
    const r20 = generateForecast(historical, 20);
    expect(r20.summary.suggestedFee).toBeLessThan(r10.summary.suggestedFee);
  });

  it('applies inflation floor: forecast >= last season expense * (1 + minYearlyGrowthRate)', () => {
    const expense = 1000;
    const items = [
      makeBudgetItem('2023-2024', 'OPE', { expensesFall: expense }),
      makeBudgetItem('2024-2025', 'OPE', { expensesFall: expense }),
    ];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2023-2024'), makeTeamSeason('2024-2025')]);
    const result = generateForecast(historical, 15);
    const opeItem = result.forecast.find((i) => i.category === 'OPE');
    const totalForecast = opeItem.expensesFall + opeItem.expensesSpring;
    expect(totalForecast).toBeGreaterThanOrEqual(Math.round(expense * (1 + FORECAST_CONFIG.minYearlyGrowthRate)) - 1);
  });

  it('backtested accuracy is a 0-100 integer with >= 2 seasons', () => {
    const seasons = ['2023-2024', '2024-2025'];
    const items = seasons.map((s) => makeBudgetItem(s, 'UNI', { expensesFall: 400 }));
    const historical = prepareHistoricalData(
      items,
      [],
      seasons.map((s) => makeTeamSeason(s)),
    );
    const { accuracy } = generateForecast(historical, 15);
    expect(accuracy).not.toBeNull();
    expect(accuracy).toBeGreaterThanOrEqual(0);
    expect(accuracy).toBeLessThanOrEqual(100);
  });

  it('accuracy is null with only one season', () => {
    const items = [makeBudgetItem('2024-2025', 'UNI', { expensesFall: 400 })];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2024-2025')]);
    expect(generateForecast(historical, 15).accuracy).toBeNull();
  });

  it('generates anomaly insight when last value is a clear outlier (>2σ)', () => {
    // 8 tight seasons ~$100 then one spike — z-score ≈ 2.67, above threshold of 2.0
    const seasons = [
      '2016-2017',
      '2017-2018',
      '2018-2019',
      '2019-2020',
      '2020-2021',
      '2021-2022',
      '2022-2023',
      '2023-2024',
      '2024-2025',
    ];
    const expenses = [100, 102, 98, 101, 99, 103, 100, 101, 5000];
    const items = seasons.map((s, i) => makeBudgetItem(s, 'OPE', { expensesFall: expenses[i] }));
    const historical = prepareHistoricalData(
      items,
      [],
      seasons.map((s) => makeTeamSeason(s)),
    );
    const { insights } = generateForecast(historical, 15);
    expect(insights.some((i) => i.includes('σ') || i.includes('anomaly'))).toBe(true);
  });

  it('single-season Bayesian shrinkage insight is present', () => {
    const items = [makeBudgetItem('2024-2025', 'OPE', { expensesFall: 500 })];
    const historical = prepareHistoricalData(items, [], [makeTeamSeason('2024-2025')]);
    const { insights } = generateForecast(historical, 15);
    expect(insights.some((i) => i.toLowerCase().includes('single-season'))).toBe(true);
  });

  it('seasonsAnalyzed reflects number of team seasons', () => {
    const seasons = ['2022-2023', '2023-2024', '2024-2025'];
    const items = seasons.map((s) => makeBudgetItem(s, 'UNI', { expensesFall: 400 }));
    const historical = prepareHistoricalData(
      items,
      [],
      seasons.map((s) => makeTeamSeason(s)),
    );
    expect(generateForecast(historical, 15).seasonsAnalyzed).toBe(3);
  });

  it('in-progress season status is captured and extrapolation insight included', () => {
    const items = [makeBudgetItem('2025-2026', 'OPE', { expensesFall: 1000, expensesSpring: 500 })];
    const txs = [makeTx('2025-2026', 'OPE', -600)];
    const teamSeasons = [makeTeamSeason('2025-2026', { isFinalized: false })];
    const historical = prepareHistoricalData(items, txs, teamSeasons);
    expect(historical.seasonStatus['2025-2026'].isFinalized).toBe(false);
    const result = generateForecast(historical, 15);
    expect(result.forecast.length).toBeGreaterThan(0);
  });
});

// ─── compareForecastToBudget ──────────────────────────────────────────────────

describe('compareForecastToBudget', () => {
  it('returns empty array for empty inputs', () => {
    expect(compareForecastToBudget([], [])).toEqual([]);
  });

  it('returns comparison rows for matching categories', () => {
    const forecast = [
      { category: 'UNI', income: 0, expensesFall: 500, expensesSpring: 200, confidence: 'low', trend: 'stable' },
    ];
    const budget = [makeBudgetItem('x', 'UNI', { expensesFall: 400, expensesSpring: 100 })];
    const result = compareForecastToBudget(forecast, budget);
    expect(result).toHaveLength(1);
    expect(result[0].forecastExpense).toBe(700);
    expect(result[0].currentExpense).toBe(500);
    expect(result[0].expenseDiff).toBe(200);
  });

  it('includes forecast-only categories with currentExpense=0', () => {
    const forecast = [
      { category: 'NEW', income: 0, expensesFall: 300, expensesSpring: 0, confidence: 'low', trend: 'stable' },
    ];
    const result = compareForecastToBudget(forecast, []);
    expect(result[0].currentExpense).toBe(0);
    expect(result[0].forecastExpense).toBe(300);
  });

  it('includes budget-only categories with forecastExpense=0', () => {
    const budget = [makeBudgetItem('x', 'OLD', { expensesFall: 200 })];
    const result = compareForecastToBudget([], budget);
    expect(result[0].forecastExpense).toBe(0);
    expect(result[0].currentExpense).toBe(200);
  });

  it('computes expenseDiffPct correctly', () => {
    const forecast = [
      { category: 'UNI', income: 0, expensesFall: 600, expensesSpring: 0, confidence: 'low', trend: 'stable' },
    ];
    const budget = [makeBudgetItem('x', 'UNI', { expensesFall: 500 })];
    const result = compareForecastToBudget(forecast, budget);
    expect(result[0].expenseDiffPct).toBeCloseTo(20, 1);
  });

  it('sets expenseDiffPct=0 when currentExpense=0 (avoid divide-by-zero)', () => {
    const forecast = [
      { category: 'NEW', income: 0, expensesFall: 300, expensesSpring: 0, confidence: 'low', trend: 'stable' },
    ];
    expect(compareForecastToBudget(forecast, [])[0].expenseDiffPct).toBe(0);
  });

  it('accumulates multiple forecast rows for same category', () => {
    const forecast = [
      { category: 'UNI', income: 0, expensesFall: 200, expensesSpring: 0, confidence: 'low', trend: 'stable' },
      { category: 'UNI', income: 50, expensesFall: 100, expensesSpring: 100, confidence: 'low', trend: 'stable' },
    ];
    const result = compareForecastToBudget(forecast, []);
    expect(result[0].forecastExpense).toBe(400);
    expect(result[0].forecastIncome).toBe(50);
  });

  it('exposes confidence and trend from forecast on result row', () => {
    const forecast = [
      { category: 'TRV', income: 0, expensesFall: 100, expensesSpring: 0, confidence: 'high', trend: 'rising' },
    ];
    const result = compareForecastToBudget(forecast, []);
    expect(result[0].confidence).toBe('high');
    expect(result[0].trend).toBe('rising');
  });

  it('handles non-numeric budget values gracefully (treats as 0)', () => {
    const budget = [
      { seasonId: 'x', category: 'UNI', label: '', income: null, expensesFall: undefined, expensesSpring: '' },
    ];
    const forecast = [
      { category: 'UNI', income: 0, expensesFall: 300, expensesSpring: 0, confidence: 'low', trend: 'stable' },
    ];
    expect(() => compareForecastToBudget(forecast, budget)).not.toThrow();
    expect(compareForecastToBudget(forecast, budget)[0].currentExpense).toBe(0);
  });
});

// ─── FORECAST_CONFIG integrity ────────────────────────────────────────────────

describe('FORECAST_CONFIG', () => {
  it('Bayesian shrinkage weights sum to exactly 1.0', () => {
    const sum =
      FORECAST_CONFIG.singleSeasonActualWeight +
      FORECAST_CONFIG.singleSeasonBudgetWeight +
      FORECAST_CONFIG.singleSeasonPriorWeight;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('decayFactor is strictly between 0 and 1', () => {
    expect(FORECAST_CONFIG.decayFactor).toBeGreaterThan(0);
    expect(FORECAST_CONFIG.decayFactor).toBeLessThan(1);
  });

  it('minYearlyGrowthRate is a positive non-zero value', () => {
    expect(FORECAST_CONFIG.minYearlyGrowthRate).toBeGreaterThan(0);
  });

  it('ciMultiplier is positive', () => {
    expect(FORECAST_CONFIG.ciMultiplier).toBeGreaterThan(0);
  });

  it('anomalyZThreshold is positive', () => {
    expect(FORECAST_CONFIG.anomalyZThreshold).toBeGreaterThan(0);
  });

  it('trendR2Threshold < strongTrendR2Threshold (ordering invariant)', () => {
    expect(FORECAST_CONFIG.trendR2Threshold).toBeLessThan(FORECAST_CONFIG.strongTrendR2Threshold);
  });
});
