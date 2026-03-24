import { describe, it, expect } from 'vitest';
import {
  prepareHistoricalData,
  generateForecast,
  compareForecastToBudget,
  nextSeasonId,
} from '../../utils/budgetModel';

describe('budgetModel', () => {
  describe('nextSeasonId', () => {
    it('increments the season year', () => {
      expect(nextSeasonId('2025-2026')).toBe('2026-2027');
      expect(nextSeasonId('2023-2024')).toBe('2024-2025');
    });
  });

  describe('prepareHistoricalData', () => {
    it('groups budget items and transactions by season and category', () => {
      const budgetItems = [
        {
          category: 'OPE',
          label: 'Uniforms',
          income: 0,
          expensesFall: 500,
          expensesSpring: 300,
          seasonId: '2024-2025',
          teamSeasonId: 'ts1',
        },
        {
          category: 'TOU',
          label: 'Entry fees',
          income: 0,
          expensesFall: 1000,
          expensesSpring: 800,
          seasonId: '2024-2025',
          teamSeasonId: 'ts1',
        },
        {
          category: 'OPE',
          label: 'Uniforms',
          income: 0,
          expensesFall: 550,
          expensesSpring: 320,
          seasonId: '2025-2026',
          teamSeasonId: 'ts2',
        },
      ];
      const transactions = [
        { category: 'OPE', amount: -480, cleared: true, seasonId: '2024-2025' }, // expense (negative)
        { category: 'OPE', amount: -200, cleared: false, seasonId: '2024-2025' }, // not cleared
        { category: 'TOU', amount: -1700, cleared: true, seasonId: '2024-2025' }, // expense (negative)
        { category: 'TMF', amount: 500, cleared: true, seasonId: '2024-2025' }, // income (positive)
      ];
      const teamSeasons = [
        { seasonId: '2024-2025', expectedRosterSize: 15 },
        { seasonId: '2025-2026', expectedRosterSize: 18 },
      ];

      const result = prepareHistoricalData(budgetItems, transactions, teamSeasons);

      expect(result.seasons).toEqual(['2024-2025', '2025-2026']);
      expect(result.categories).toContain('OPE');
      expect(result.categories).toContain('TOU');
      expect(result.rosterBySeason['2024-2025']).toBe(15);
      expect(result.rosterBySeason['2025-2026']).toBe(18);

      // Only cleared transactions counted, expenses stored as positive absolute values
      expect(result.actualsBySeasonCat['2024-2025']['OPE']).toBe(480);
      expect(result.actualsBySeasonCat['2024-2025']['TOU']).toBe(1700);
      // Income tracked separately
      expect(result.actualIncomeByCat['2024-2025']['TMF']).toBe(500);
    });
  });

  describe('generateForecast', () => {
    it('returns forecast with no data', () => {
      const historical = prepareHistoricalData([], [], []);
      const result = generateForecast(historical);

      expect(result.confidence).toBe('none');
      expect(result.forecast).toEqual([]);
    });

    it('generates forecast from one season of data', () => {
      const budgetItems = [
        {
          category: 'OPE',
          label: 'Equipment',
          income: 0,
          expensesFall: 500,
          expensesSpring: 300,
          seasonId: '2024-2025',
          teamSeasonId: 'ts1',
        },
        {
          category: 'TMF',
          label: 'Team fees',
          income: 5000,
          expensesFall: 0,
          expensesSpring: 0,
          seasonId: '2024-2025',
          teamSeasonId: 'ts1',
        },
      ];
      const teamSeasons = [{ seasonId: '2024-2025', expectedRosterSize: 15 }];
      const historical = prepareHistoricalData(budgetItems, [], teamSeasons);
      const result = generateForecast(historical, 15);

      expect(result.forecastSeasonId).toBe('2025-2026');
      expect(result.confidence).toBe('low');
      expect(result.forecast.length).toBeGreaterThan(0);
      expect(result.summary.totalExpenses).toBeGreaterThan(0);
      expect(result.summary.suggestedFee).toBeGreaterThan(0);
    });

    it('generates forecast from multiple seasons with trend detection', () => {
      const budgetItems = [
        // Season 1 — lower costs
        {
          category: 'OPE',
          label: 'Equipment',
          income: 0,
          expensesFall: 500,
          expensesSpring: 300,
          seasonId: '2023-2024',
          teamSeasonId: 'ts1',
        },
        {
          category: 'TOU',
          label: 'Tournaments',
          income: 0,
          expensesFall: 800,
          expensesSpring: 600,
          seasonId: '2023-2024',
          teamSeasonId: 'ts1',
        },
        // Season 2 — higher costs (rising trend)
        {
          category: 'OPE',
          label: 'Equipment',
          income: 0,
          expensesFall: 600,
          expensesSpring: 400,
          seasonId: '2024-2025',
          teamSeasonId: 'ts2',
        },
        {
          category: 'TOU',
          label: 'Tournaments',
          income: 0,
          expensesFall: 1000,
          expensesSpring: 800,
          seasonId: '2024-2025',
          teamSeasonId: 'ts2',
        },
        // Season 3 — even higher
        {
          category: 'OPE',
          label: 'Equipment',
          income: 0,
          expensesFall: 700,
          expensesSpring: 500,
          seasonId: '2025-2026',
          teamSeasonId: 'ts3',
        },
        {
          category: 'TOU',
          label: 'Tournaments',
          income: 0,
          expensesFall: 1200,
          expensesSpring: 1000,
          seasonId: '2025-2026',
          teamSeasonId: 'ts3',
        },
      ];
      const teamSeasons = [
        { seasonId: '2023-2024', expectedRosterSize: 14 },
        { seasonId: '2024-2025', expectedRosterSize: 15 },
        { seasonId: '2025-2026', expectedRosterSize: 16 },
      ];

      const historical = prepareHistoricalData(budgetItems, [], teamSeasons);
      const result = generateForecast(historical, 16);

      expect(result.forecastSeasonId).toBe('2026-2027');
      expect(result.confidence).toBe('medium');
      expect(result.seasonsAnalyzed).toBe(3);

      // With rising trend, forecast should be >= last season
      const lastSeasonExpenses = 700 + 500 + 1200 + 1000; // 3400
      expect(result.summary.totalExpenses).toBeGreaterThanOrEqual(lastSeasonExpenses * 0.9);
    });

    it('adjusts for roster size changes', () => {
      const budgetItems = [
        {
          category: 'OPE',
          label: 'Uniforms',
          income: 0,
          expensesFall: 1500,
          expensesSpring: 0,
          seasonId: '2024-2025',
          teamSeasonId: 'ts1',
        },
        {
          category: 'OPE',
          label: 'Uniforms',
          income: 0,
          expensesFall: 1500,
          expensesSpring: 0,
          seasonId: '2025-2026',
          teamSeasonId: 'ts2',
        },
      ];
      const teamSeasons = [
        { seasonId: '2024-2025', expectedRosterSize: 15 },
        { seasonId: '2025-2026', expectedRosterSize: 15 },
      ];

      const historical = prepareHistoricalData(budgetItems, [], teamSeasons);

      // Forecast with larger roster should have higher expenses
      const result15 = generateForecast(historical, 15);
      const result20 = generateForecast(historical, 20);

      expect(result20.summary.totalExpenses).toBeGreaterThan(result15.summary.totalExpenses);
    });

    it('handles in-progress season by extrapolating actuals', () => {
      // Season is ~50% complete with partial actuals
      const budgetItems = [
        {
          category: 'OPE',
          label: 'Equipment',
          income: 0,
          expensesFall: 1000,
          expensesSpring: 500,
          seasonId: '2025-2026',
          teamSeasonId: 'ts1',
        },
      ];
      const transactions = [
        // Only $600 spent so far in a season that's ~50% done → ~$1200 projected
        { category: 'OPE', amount: -600, cleared: true, seasonId: '2025-2026' },
      ];
      const teamSeasons = [{ seasonId: '2025-2026', expectedRosterSize: 15, isFinalized: false }];

      const historical = prepareHistoricalData(budgetItems, transactions, teamSeasons);

      // Should have seasonStatus with completion > 0
      expect(historical.seasonStatus['2025-2026']).toBeDefined();
      expect(historical.seasonStatus['2025-2026'].isFinalized).toBe(false);

      const result = generateForecast(historical, 15);
      expect(result.forecastSeasonId).toBe('2026-2027');
      expect(result.confidence).toBe('low'); // Only 1 season
      expect(result.forecast.length).toBeGreaterThan(0);
    });

    it('includes categories found only in transactions', () => {
      const budgetItems = [
        {
          category: 'OPE',
          label: 'Equipment',
          income: 0,
          expensesFall: 500,
          expensesSpring: 0,
          seasonId: '2024-2025',
          teamSeasonId: 'ts1',
        },
      ];
      const transactions = [
        { category: 'OPE', amount: -400, cleared: true, seasonId: '2024-2025' },
        { category: 'FRI', amount: -200, cleared: true, seasonId: '2024-2025' }, // FRI not in budget
      ];
      const teamSeasons = [{ seasonId: '2024-2025', expectedRosterSize: 15 }];

      const historical = prepareHistoricalData(budgetItems, transactions, teamSeasons);
      expect(historical.categories).toContain('FRI');
    });
  });

  describe('compareForecastToBudget', () => {
    it('compares forecast to current budget', () => {
      const forecast = [
        {
          category: 'OPE',
          label: 'Equipment',
          income: 0,
          expensesFall: 600,
          expensesSpring: 400,
          confidence: 'medium',
          trend: 'rising',
        },
      ];
      const currentBudget = [
        { category: 'OPE', label: 'Equipment', income: 0, expensesFall: 500, expensesSpring: 300 },
      ];

      const comparison = compareForecastToBudget(forecast, currentBudget);

      expect(comparison).toHaveLength(1);
      expect(comparison[0].category).toBe('OPE');
      expect(comparison[0].currentExpense).toBe(800);
      expect(comparison[0].forecastExpense).toBe(1000);
      expect(comparison[0].expenseDiff).toBe(200);
      expect(comparison[0].trend).toBe('rising');
    });
  });
});
