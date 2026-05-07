/**
 * Internal Budget Forecasting Engine
 *
 * Pure JavaScript statistical model — no external AI/ML dependencies.
 * Learns from historical budget data across seasons to predict future budgets.
 *
 * Techniques used:
 * - Weighted Moving Average (recent seasons weighted higher)
 * - Per-category linear regression (trend detection)
 * - Roster-normalized projections (cost-per-player scaling)
 * - Anomaly detection (z-score based)
 * - Bayesian shrinkage for single-season priors
 * - Confidence interval bounds (±1.5σ)
 * - Self-calibrating accuracy scoring against actuals
 */

// ─── MODEL HYPERPARAMETERS ─────────────────────────────────────────────────────
// Single tuning surface for all forecasting weights and thresholds.
export const FORECAST_CONFIG = {
  // Exponential decay applied to weighted moving averages (higher = more recent bias)
  decayFactor: 0.6,
  // Blend weights for single-season Bayesian shrinkage (must sum to 1.0)
  singleSeasonActualWeight: 0.55,
  singleSeasonBudgetWeight: 0.25,
  singleSeasonPriorWeight: 0.2,
  // Sport-wide category cost prior — fallback when no history exists ($/player)
  categoryPriorPerPlayer: 80,
  // Minimum R² before regression slope is trusted for trend/blend decisions
  trendR2Threshold: 0.5,
  // R² threshold for high-confidence regression-dominant blend (4+ seasons)
  strongTrendR2Threshold: 0.7,
  // Z-score threshold for anomaly detection
  anomalyZThreshold: 2.0,
  // Budget vs actual variance threshold before generating an insight (fraction)
  budgetVarianceThreshold: 0.2,
  // Confidence interval half-width multiplier (applied to stdDev of history)
  ciMultiplier: 1.5,
  // Single-season CI fallback as a fraction of point estimate (±30%)
  singleSeasonCIFraction: 0.3,
  // Minimum season completion before extrapolation is trusted
  minCompletionForExtrapolation: 0.35,
  // Below this completion, dampen extrapolation toward budget
  earlySeasonDampenThreshold: 0.25,
  // Minimum year-over-year growth applied to every category forecast.
  // Encodes the domain rule that budgets increase annually regardless of trend.
  minYearlyGrowthRate: 0.03,
};

// ─── MATH PRIMITIVES ───────────────────────────────────────────────────────────

/**
 * Simple linear regression: y = slope * x + intercept
 * @param {number[][]} points - Array of [x, y] pairs
 * @returns {{ slope: number, intercept: number, r2: number }}
 */
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.[1] || 0, r2: 0 };

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared (coefficient of determination)
  const meanY = sumY / n;
  let ssTot = 0,
    ssRes = 0;
  for (const [x, y] of points) {
    ssTot += (y - meanY) ** 2;
    ssRes += (y - (slope * x + intercept)) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

/**
 * Weighted moving average with exponential decay
 * @param {number[]} values - Ordered values (oldest first)
 * @param {number} decay - Decay factor (0-1), higher = more weight on recent
 * @returns {number}
 */
function weightedAverage(values, decay = 0.6) {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  let weightSum = 0;
  let valueSum = 0;
  for (let i = 0; i < values.length; i++) {
    const weight = Math.pow(decay, values.length - 1 - i);
    weightSum += weight;
    valueSum += values[i] * weight;
  }
  return valueSum / weightSum;
}

/**
 * Standard deviation
 * @param {number[]} values
 * @returns {number}
 */
function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Z-score for anomaly detection
 * @param {number} value
 * @param {number} mean
 * @param {number} sd
 * @returns {number}
 */
function zScore(value, mean, sd) {
  if (sd === 0) return 0;
  return (value - mean) / sd;
}

/**
 * Mean Absolute Percentage Error
 * @param {number[]} actuals
 * @param {number[]} predictions
 * @returns {number} MAPE as decimal (0-1)
 */
function mape(actuals, predictions) {
  if (actuals.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actuals.length; i++) {
    if (actuals[i] !== 0) {
      sum += Math.abs((actuals[i] - predictions[i]) / actuals[i]);
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

// ─── SEASON HELPERS ─────────────────────────────────────────────────────────────

/**
 * Parse season ID to a sortable index
 * @param {string} seasonId - e.g. "2025-2026"
 * @returns {number} Start year
 */
function seasonToIndex(seasonId) {
  return parseInt(seasonId.split('-')[0], 10);
}

/**
 * Generate next season ID
 * @param {string} currentSeasonId - e.g. "2025-2026"
 * @returns {string} e.g. "2026-2027"
 */
export function nextSeasonId(currentSeasonId) {
  const startYear = seasonToIndex(currentSeasonId) + 1;
  return `${startYear}-${startYear + 1}`;
}

// ─── DATA PREPARATION ───────────────────────────────────────────────────────────

/**
 * Calculate how far through a season we are (0-1).
 * Season runs Aug 1 → May 31 (10 months).
 * @param {string} seasonId - e.g. "2025-2026"
 * @param {Date} [now] - Current date (defaults to now)
 * @returns {number} Completion ratio (0 = not started, 1 = finished)
 */
function seasonCompletion(seasonId, now = new Date()) {
  const startYear = seasonToIndex(seasonId);
  const start = new Date(startYear, 7, 1); // Aug 1
  const end = new Date(startYear + 1, 4, 31); // May 31
  const totalMs = end - start;
  const elapsedMs = now - start;
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= totalMs) return 1;
  return elapsedMs / totalMs;
}

/**
 * Structure historical data by category across seasons
 *
 * @param {Object[]} allBudgetItems - Budget items from all seasons
 *   Each: { category, label, income, expensesFall, expensesSpring, seasonId }
 * @param {Object[]} allTransactions - Transactions from all seasons
 *   Each: { category, amount, cleared, seasonId }
 * @param {Object[]} teamSeasons - Team season records
 *   Each: { seasonId, expectedRosterSize, baseFee, isFinalized }
 * @returns {Object} Structured historical data
 */
export function prepareHistoricalData(allBudgetItems, allTransactions, teamSeasons) {
  const seasons = [...new Set(teamSeasons.map((ts) => ts.seasonId).filter(Boolean))].sort(
    (a, b) => seasonToIndex(a) - seasonToIndex(b),
  );

  // Track which seasons are finalized vs in-progress
  const seasonStatus = {};
  for (const ts of teamSeasons) {
    if (ts.seasonId) {
      seasonStatus[ts.seasonId] = {
        isFinalized: ts.isFinalized || false,
        completion: seasonCompletion(ts.seasonId),
      };
    }
  }

  // Group budget items by season → category
  const budgetBySeasonCat = {};
  for (const item of allBudgetItems) {
    const sid = item.seasonId;
    if (!sid) continue;
    if (!budgetBySeasonCat[sid]) budgetBySeasonCat[sid] = {};
    const cat = item.category;
    if (!budgetBySeasonCat[sid][cat]) {
      budgetBySeasonCat[sid][cat] = {
        income: 0,
        expensesFall: 0,
        expensesSpring: 0,
        items: [],
      };
    }
    budgetBySeasonCat[sid][cat].income += Number(item.income) || 0;
    budgetBySeasonCat[sid][cat].expensesFall += Number(item.expensesFall) || 0;
    budgetBySeasonCat[sid][cat].expensesSpring += Number(item.expensesSpring) || 0;
    budgetBySeasonCat[sid][cat].items.push(item);
  }

  // Group actual spending by season → category (cleared only)
  // Separate income (positive amounts) and expenses (negative amounts)
  const actualsBySeasonCat = {};
  const actualIncomeByCat = {};
  for (const tx of allTransactions) {
    if (!tx.cleared) continue;
    const sid = tx.seasonId;
    if (!sid) continue;
    const cat = tx.category || 'OPE';
    const amount = Number(tx.amount);

    if (amount < 0) {
      // Expense — store as positive value for forecasting
      if (!actualsBySeasonCat[sid]) actualsBySeasonCat[sid] = {};
      actualsBySeasonCat[sid][cat] = (actualsBySeasonCat[sid][cat] || 0) + Math.abs(amount);
    } else {
      // Income
      if (!actualIncomeByCat[sid]) actualIncomeByCat[sid] = {};
      actualIncomeByCat[sid][cat] = (actualIncomeByCat[sid][cat] || 0) + amount;
    }
  }

  // Roster sizes by season
  const rosterBySeason = {};
  for (const ts of teamSeasons) {
    if (ts.seasonId && ts.expectedRosterSize) {
      rosterBySeason[ts.seasonId] = ts.expectedRosterSize;
    }
  }

  // All unique categories (from budget items AND transactions)
  const categories = [
    ...new Set(
      [
        ...allBudgetItems.map((i) => i.category),
        ...allTransactions.filter((t) => t.cleared).map((t) => t.category),
      ].filter(Boolean),
    ),
  ];

  return {
    seasons,
    categories,
    budgetBySeasonCat,
    actualsBySeasonCat,
    actualIncomeByCat,
    rosterBySeason,
    seasonStatus,
  };
}

// ─── FORECASTING ENGINE ─────────────────────────────────────────────────────────

/**
 * Generate a forecast for the next season
 *
 * @param {Object} historicalData - Output from prepareHistoricalData()
 * @param {number} [targetRosterSize] - Expected roster size for forecast season
 * @returns {Object} Forecast result
 */
export function generateForecast(historicalData, targetRosterSize) {
  const {
    seasons,
    categories,
    budgetBySeasonCat,
    actualsBySeasonCat,
    actualIncomeByCat,
    rosterBySeason,
    seasonStatus,
  } = historicalData;

  if (seasons.length === 0) {
    return {
      forecast: [],
      summary: null,
      confidence: 'none',
      accuracy: null,
      insights: ['No historical data available for forecasting.'],
    };
  }

  // Extrapolate in-progress seasons' actuals to full-season estimates
  // TICKET-005: Dampen extrapolations when season completion is below the minimum threshold.
  const cfg = FORECAST_CONFIG;
  const extrapolatedActuals = { ...actualsBySeasonCat };
  const extrapolatedIncome = { ...(actualIncomeByCat || {}) };
  for (const sid of seasons) {
    const status = seasonStatus?.[sid];
    if (status && !status.isFinalized && status.completion > 0 && status.completion < 1) {
      const c = status.completion;

      // Skip extrapolation entirely when too early in the season
      if (c < cfg.minCompletionForExtrapolation) continue;

      const seasonActuals = actualsBySeasonCat[sid];
      if (seasonActuals) {
        const projected = {};
        for (const [cat, amount] of Object.entries(seasonActuals)) {
          const rawProjected = amount / c;
          if (c < cfg.earlySeasonDampenThreshold) {
            // Dampen toward budget to suppress pre-season invoice spikes
            const budgeted =
              (budgetBySeasonCat[sid]?.[cat]?.expensesFall || 0) + (budgetBySeasonCat[sid]?.[cat]?.expensesSpring || 0);
            const dampFactor = c / cfg.earlySeasonDampenThreshold;
            projected[cat] = rawProjected * dampFactor + budgeted * (1 - dampFactor);
          } else {
            projected[cat] = rawProjected;
          }
        }
        extrapolatedActuals[sid] = projected;
      }

      const seasonIncome = actualIncomeByCat?.[sid];
      if (seasonIncome) {
        const projectedIncome = {};
        for (const [cat, amount] of Object.entries(seasonIncome)) {
          projectedIncome[cat] = amount / c;
        }
        extrapolatedIncome[sid] = projectedIncome;
      }
    }
  }

  const latestSeason = seasons[seasons.length - 1];
  const forecastSeasonId = nextSeasonId(latestSeason);
  const rosterSize = targetRosterSize || rosterBySeason[latestSeason] || Object.values(rosterBySeason).pop() || 15;

  const forecastItems = [];
  const insights = [];
  const categoryForecasts = {};

  // Add insight about in-progress seasons
  for (const sid of seasons) {
    const status = seasonStatus?.[sid];
    if (status && !status.isFinalized && status.completion > 0 && status.completion < 1) {
      insights.push(
        `${sid} is ${Math.round(status.completion * 100)}% complete — actuals extrapolated to full-season estimates.`,
      );
    }
  }

  for (const cat of categories) {
    const result = forecastCategory(
      cat,
      seasons,
      budgetBySeasonCat,
      extrapolatedActuals,
      extrapolatedIncome,
      rosterBySeason,
      rosterSize,
    );
    categoryForecasts[cat] = result;

    // Build forecast line items from the latest season's items as template
    const templateSeason = findTemplateSeason(cat, seasons, budgetBySeasonCat);
    if (templateSeason && budgetBySeasonCat[templateSeason]?.[cat]?.items) {
      const items = budgetBySeasonCat[templateSeason][cat].items;
      const totalBudgetedExpense = items.reduce(
        (s, i) => s + (Number(i.expensesFall) || 0) + (Number(i.expensesSpring) || 0),
        0,
      );
      const totalBudgetedIncome = items.reduce((s, i) => s + (Number(i.income) || 0), 0);

      for (const item of items) {
        const itemExpense = (Number(item.expensesFall) || 0) + (Number(item.expensesSpring) || 0);
        const itemIncome = Number(item.income) || 0;

        const expenseRatio = totalBudgetedExpense > 0 ? itemExpense / totalBudgetedExpense : 0;
        const incomeRatio = totalBudgetedIncome > 0 ? itemIncome / totalBudgetedIncome : 0;

        const forecastExpense = result.totalExpense * expenseRatio;
        const forecastIncome = result.totalIncome * incomeRatio;
        const fallRatio = itemExpense > 0 ? (Number(item.expensesFall) || 0) / itemExpense : 0.5;

        forecastItems.push({
          category: cat,
          label: item.label,
          income: Math.round(forecastIncome),
          expensesFall: Math.round(forecastExpense * fallRatio),
          expensesSpring: Math.round(forecastExpense * (1 - fallRatio)),
          forecastLow: Math.round(result.forecastLow * expenseRatio),
          forecastHigh: Math.round(result.forecastHigh * expenseRatio),
          confidence: result.confidence,
          trend: result.trend,
        });
      }
    } else {
      forecastItems.push({
        category: cat,
        label: '',
        income: Math.round(result.totalIncome),
        expensesFall: Math.round(result.totalExpense * 0.5),
        expensesSpring: Math.round(result.totalExpense * 0.5),
        forecastLow: result.forecastLow,
        forecastHigh: result.forecastHigh,
        confidence: result.confidence,
        trend: result.trend,
      });
    }

    // Collect insights
    if (result.insights.length > 0) {
      insights.push(...result.insights);
    }
  }

  // Overall summary
  const totalIncome = forecastItems.reduce((s, i) => s + i.income, 0);
  const totalExpenses = forecastItems.reduce((s, i) => s + i.expensesFall + i.expensesSpring, 0);

  // TICKET-006: Dynamic fee rounding based on per-player cost bracket
  const rawPerPlayer = rosterSize > 0 ? totalExpenses / rosterSize : 0;
  const feeIncrement = rawPerPlayer < 500 ? 10 : rawPerPlayer < 1000 ? 25 : 50;
  const suggestedFee = Math.ceil(rawPerPlayer / feeIncrement) * feeIncrement;

  // TICKET-003: Backtest against actuals; returns { score, source } | null
  const backtestResult = backtestAccuracy(
    seasons,
    categories,
    budgetBySeasonCat,
    extrapolatedActuals,
    extrapolatedIncome,
    rosterBySeason,
  );

  const overallConfidence = seasons.length >= 4 ? 'high' : seasons.length >= 2 ? 'medium' : 'low';

  return {
    forecastSeasonId,
    rosterSize,
    forecast: forecastItems,
    categoryForecasts,
    summary: {
      totalIncome,
      totalExpenses,
      netBudget: totalIncome - totalExpenses,
      suggestedFee,
      rawSuggestedFee: Math.round(rawPerPlayer),
    },
    confidence: overallConfidence,
    accuracy: backtestResult?.score ?? null,
    accuracySource: backtestResult?.source ?? null,
    insights,
    seasonsAnalyzed: seasons.length,
  };
}

/**
 * Forecast a single category
 */
function forecastCategory(
  cat,
  seasons,
  budgetBySeasonCat,
  actualsBySeasonCat,
  actualIncomeByCat,
  rosterBySeason,
  targetRosterSize,
) {
  const cfg = FORECAST_CONFIG;
  const incomeHistory = [];
  const expenseHistory = [];
  const actualExpenseHistory = [];
  const actualIncomeHistory = [];
  const perPlayerExpense = [];

  for (const sid of seasons) {
    const catData = budgetBySeasonCat[sid]?.[cat];
    const budgetedIncome = catData?.income || 0;
    const budgetedExpense = (catData?.expensesFall || 0) + (catData?.expensesSpring || 0);
    const actualExpense = actualsBySeasonCat[sid]?.[cat] || 0;
    const actualIncome = actualIncomeByCat?.[sid]?.[cat] || 0;
    const roster = rosterBySeason[sid] || targetRosterSize;

    const bestExpense = actualExpense > 0 ? actualExpense : budgetedExpense;
    const bestIncome = actualIncome > 0 ? actualIncome : budgetedIncome;

    incomeHistory.push(bestIncome);
    expenseHistory.push(budgetedExpense);
    actualExpenseHistory.push(actualExpense);
    actualIncomeHistory.push(actualIncome);
    if (roster > 0 && bestExpense > 0) {
      perPlayerExpense.push(bestExpense / roster);
    }
  }

  const n = seasons.length;
  const insights = [];

  const useActuals = actualExpenseHistory.some((a) => a !== 0);
  const primaryExpenseData = useActuals ? actualExpenseHistory : expenseHistory;

  // --- Method 1: Weighted Moving Average ---
  const wmaExpense = weightedAverage(primaryExpenseData, cfg.decayFactor);
  const wmaIncome = weightedAverage(incomeHistory, cfg.decayFactor);

  // --- Method 2: Linear Regression (trend) ---
  const expensePoints = primaryExpenseData.map((v, i) => [i, v]);
  const incomePoints = incomeHistory.map((v, i) => [i, v]);
  const expenseReg = linearRegression(expensePoints);
  const incomeReg = linearRegression(incomePoints);

  const regExpense = expenseReg.slope * n + expenseReg.intercept;
  const regIncome = incomeReg.slope * n + incomeReg.intercept;

  // --- Method 3: Per-player scaling ---
  const sportPrior = cfg.categoryPriorPerPlayer * targetRosterSize;
  let scaledExpense = wmaExpense || sportPrior;
  if (perPlayerExpense.length >= 1) {
    const avgPerPlayer = weightedAverage(perPlayerExpense, cfg.decayFactor);
    scaledExpense = avgPerPlayer * targetRosterSize;
  }

  // --- Blend methods based on data quality ---
  let totalExpense, totalIncome;

  if (n >= 4 && expenseReg.r2 > cfg.strongTrendR2Threshold) {
    // Strong trend — regression-dominant
    totalExpense = Math.max(0, regExpense * 0.6 + wmaExpense * 0.3 + scaledExpense * 0.1);
    totalIncome = Math.max(0, regIncome * 0.6 + wmaIncome * 0.4);
  } else if (n >= 2) {
    // Moderate data — balanced blend
    totalExpense = Math.max(0, wmaExpense * 0.5 + scaledExpense * 0.3 + regExpense * 0.2);
    totalIncome = Math.max(0, wmaIncome * 0.7 + regIncome * 0.3);
  } else {
    // --- TICKET-001: Bayesian shrinkage for single-season ---
    // Blend observed value toward a sport-wide prior to avoid overfitting one data point.
    const budgetExpense = expenseHistory[0] || 0;
    const actualExpense = actualExpenseHistory[0] || 0;
    const observedExpense = useActuals ? actualExpense : budgetExpense;

    totalExpense = Math.max(
      0,
      observedExpense * cfg.singleSeasonActualWeight +
        budgetExpense * cfg.singleSeasonBudgetWeight +
        sportPrior * cfg.singleSeasonPriorWeight,
    );
    totalIncome = Math.max(0, wmaIncome);
    insights.push(`${cat}: Single-season baseline — estimate shrunk toward sport-wide prior for stability.`);
  }

  // --- TICKET-004: Regression-slope trend detection ---
  // Use regression slope when statistically meaningful (R² ≥ threshold), else fall back to two-point diff.
  let trend = 'stable';
  if (n >= 3 && expenseReg.r2 >= cfg.trendR2Threshold) {
    const meanExpense = primaryExpenseData.reduce((a, b) => a + b, 0) / n;
    const slopePct = meanExpense > 0 ? expenseReg.slope / meanExpense : 0;
    if (slopePct > 0.05) trend = 'rising';
    else if (slopePct < -0.05) trend = 'declining';
  } else if (n >= 2) {
    const pctChange =
      primaryExpenseData[n - 2] > 0
        ? (primaryExpenseData[n - 1] - primaryExpenseData[n - 2]) / primaryExpenseData[n - 2]
        : 0;
    if (pctChange > 0.1) trend = 'rising';
    else if (pctChange < -0.1) trend = 'declining';
  }

  // --- Anomaly detection ---
  if (n >= 3) {
    const mean = primaryExpenseData.reduce((a, b) => a + b, 0) / n;
    const sd = stdDev(primaryExpenseData);
    const lastValue = primaryExpenseData[n - 1];
    const z = zScore(lastValue, mean, sd);

    if (Math.abs(z) > cfg.anomalyZThreshold) {
      const dir = z > 0 ? 'higher' : 'lower';
      insights.push(`${cat}: Last season was ${Math.abs(z).toFixed(1)}σ ${dir} than average — possible anomaly.`);
    }
  }

  // --- Budget vs Actual variance ---
  if (useActuals && n >= 1) {
    const lastBudgeted =
      (budgetBySeasonCat[seasons[n - 1]]?.[cat]?.expensesFall || 0) +
      (budgetBySeasonCat[seasons[n - 1]]?.[cat]?.expensesSpring || 0);
    const lastActual = actualExpenseHistory[n - 1];
    if (lastBudgeted > 0) {
      const variance = (lastActual - lastBudgeted) / lastBudgeted;
      if (Math.abs(variance) > cfg.budgetVarianceThreshold) {
        const dir = variance > 0 ? 'over' : 'under';
        insights.push(
          `${cat}: Last season was ${dir}-budget by ${Math.abs(variance * 100).toFixed(0)}%. Forecast adjusted to reflect actuals.`,
        );
      }
    }
  }

  // --- Trend insight ---
  if (trend !== 'stable' && n >= 2) {
    const pctStr = (
      Math.abs(expenseReg.slope / (weightedAverage(primaryExpenseData, cfg.decayFactor) || 1)) * 100
    ).toFixed(0);
    insights.push(`${cat}: ${trend === 'rising' ? 'Increasing' : 'Decreasing'} trend (~${pctStr}% per season).`);
  }

  // --- Inflation floor: budgets increase every year ---
  // If the blended estimate is below last season's value grown by minYearlyGrowthRate, bump it up.
  const lastSeasonExpense = primaryExpenseData[n - 1] || 0;
  const inflationFloor = lastSeasonExpense * (1 + cfg.minYearlyGrowthRate);
  if (lastSeasonExpense > 0 && totalExpense < inflationFloor) {
    totalExpense = inflationFloor;
  }

  // --- TICKET-002: Confidence interval bounds ---
  let forecastLow, forecastHigh;
  if (n >= 2) {
    const sd = stdDev(primaryExpenseData);
    const halfWidth = sd * cfg.ciMultiplier;
    forecastLow = Math.max(0, Math.round(totalExpense - halfWidth));
    forecastHigh = Math.round(totalExpense + halfWidth);
  } else {
    const halfWidth = totalExpense * cfg.singleSeasonCIFraction;
    forecastLow = Math.max(0, Math.round(totalExpense - halfWidth));
    forecastHigh = Math.round(totalExpense + halfWidth);
  }

  // --- Confidence ---
  const confidence = n >= 4 ? 'high' : n >= 2 ? 'medium' : 'low';

  return {
    totalExpense: Math.round(totalExpense),
    totalIncome: Math.round(totalIncome),
    forecastLow,
    forecastHigh,
    trend,
    confidence,
    regression: { expense: expenseReg, income: incomeReg },
    insights,
  };
}

/**
 * Find the most recent season that has budget items for a category
 */
function findTemplateSeason(cat, seasons, budgetBySeasonCat) {
  for (let i = seasons.length - 1; i >= 0; i--) {
    if (budgetBySeasonCat[seasons[i]]?.[cat]?.items?.length > 0) {
      return seasons[i];
    }
  }
  return null;
}

// ─── BACKTESTING ────────────────────────────────────────────────────────────────

/**
 * Backtest: for each season with a predecessor, predict it and compare to actuals.
 * Prefers real transaction actuals over budgeted amounts as the truth signal.
 * Returns { score, source } where source is "actuals" | "budget".
 */
function backtestAccuracy(
  seasons,
  categories,
  budgetBySeasonCat,
  actualsBySeasonCat,
  actualIncomeByCat,
  rosterBySeason,
) {
  if (seasons.length < 2) return null;

  const actuals = [];
  const predictions = [];
  let usedActuals = false;

  for (let i = 1; i < seasons.length; i++) {
    const priorSeasons = seasons.slice(0, i);
    const targetSeason = seasons[i];
    const roster = rosterBySeason[targetSeason] || 15;

    for (const cat of categories) {
      const result = forecastCategory(
        cat,
        priorSeasons,
        budgetBySeasonCat,
        actualsBySeasonCat,
        actualIncomeByCat,
        rosterBySeason,
        roster,
      );

      // Prefer transaction actuals; fall back to budgeted amounts
      const txActual = actualsBySeasonCat[targetSeason]?.[cat];
      const budgetedExpense =
        (budgetBySeasonCat[targetSeason]?.[cat]?.expensesFall || 0) +
        (budgetBySeasonCat[targetSeason]?.[cat]?.expensesSpring || 0);
      const truthValue = txActual != null && txActual > 0 ? txActual : budgetedExpense;

      if (txActual != null && txActual > 0) usedActuals = true;

      if (truthValue > 0) {
        actuals.push(truthValue);
        predictions.push(result.totalExpense);
      }
    }
  }

  if (actuals.length === 0) return null;

  const error = mape(actuals, predictions);
  return {
    score: Math.round(Math.max(0, (1 - error) * 100)),
    source: usedActuals ? 'actuals' : 'budget',
  };
}

// ─── COMPARISON HELPERS ─────────────────────────────────────────────────────────

/**
 * Compare forecast to an existing budget
 * @param {Object[]} forecast - Forecast items
 * @param {Object[]} currentBudget - Current budget items
 * @returns {Object[]} Comparison rows
 */
export function compareForecastToBudget(forecast, currentBudget) {
  const currentByCat = {};
  for (const item of currentBudget) {
    if (!currentByCat[item.category]) {
      currentByCat[item.category] = { income: 0, expense: 0 };
    }
    currentByCat[item.category].income += Number(item.income) || 0;
    currentByCat[item.category].expense += (Number(item.expensesFall) || 0) + (Number(item.expensesSpring) || 0);
  }

  const forecastByCat = {};
  for (const item of forecast) {
    if (!forecastByCat[item.category]) {
      forecastByCat[item.category] = { income: 0, expense: 0, confidence: item.confidence, trend: item.trend };
    }
    forecastByCat[item.category].income += item.income;
    forecastByCat[item.category].expense += item.expensesFall + item.expensesSpring;
  }

  const allCats = [...new Set([...Object.keys(currentByCat), ...Object.keys(forecastByCat)])];

  return allCats.map((cat) => {
    const curr = currentByCat[cat] || { income: 0, expense: 0 };
    const fore = forecastByCat[cat] || { income: 0, expense: 0, confidence: 'low', trend: 'stable' };
    const expenseDiff = fore.expense - curr.expense;
    const incomeDiff = fore.income - curr.income;

    return {
      category: cat,
      currentExpense: curr.expense,
      forecastExpense: fore.expense,
      expenseDiff,
      expenseDiffPct: curr.expense > 0 ? (expenseDiff / curr.expense) * 100 : 0,
      currentIncome: curr.income,
      forecastIncome: fore.income,
      incomeDiff,
      confidence: fore.confidence,
      trend: fore.trend,
    };
  });
}
