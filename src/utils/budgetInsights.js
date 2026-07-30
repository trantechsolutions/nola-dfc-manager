/**
 * Presentation helpers for the budget Expense Analysis panel.
 *
 * Kept out of the view so the variance banding and the spending guidance can be
 * unit tested without rendering, and so BudgetView keeps a single component export.
 */

/**
 * Classify a category's average actual against its average budget.
 *
 * The 0–5% band is deliberately its own tone: it is over budget, and painting it
 * with the "under budget" colour tells the treasurer the opposite of the truth.
 *
 * @param {number|null} variance Percent over (+) or under (-) budget, or null when unbudgeted.
 * @param {number} avgActual Average actual spend per season.
 * @returns {'over'|'watch'|'ontarget'|'under'|'unbudgeted'}
 */
export function varianceTone(variance, avgActual) {
  if (variance === null || variance === undefined) return avgActual > 0 ? 'unbudgeted' : 'ontarget';
  if (variance > 5) return 'over';
  if (variance > 0) return 'watch';
  if (variance < -10) return 'under';
  return 'ontarget';
}

export const TONE_STYLES = {
  over: { text: 'text-red-700 dark:text-red-400', bar: 'bg-red-400' },
  watch: { text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-400' },
  ontarget: { text: 'text-muted-foreground', bar: 'bg-emerald-400' },
  under: { text: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-400' },
  unbudgeted: { text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-400' },
};

/**
 * Turn a category's history into plain-language guidance on what to budget and
 * where the money can be found. Pure — takes everything it needs as arguments.
 *
 * @param {object} args
 * @param {object} args.projection A single entry from projections.categoryProjections.
 * @param {number} args.currentBudgeted What this season budgets for the category.
 * @param {number} args.rosterSize Players sharing the cost.
 * @param {Function} args.formatMoney Currency formatter from the app shell.
 * @returns {Array<{key: string, tone: 'warn'|'good'|'info', text: string}>}
 */
export function buildCategoryAdvice({ projection, currentBudgeted = 0, rosterSize = 0, formatMoney }) {
  const p = projection;
  if (!p || !p.seasonsTracked) return [];

  const tips = [];
  const money = (n) => formatMoney(Math.abs(n));
  const seasonWord = `${p.seasonsTracked} season${p.seasonsTracked !== 1 ? 's' : ''}`;
  const swings = p.seasonsTracked > 1 && p.peakActual > p.avgActual * 1.15;

  // What to budget, and why that number.
  if (swings) {
    tips.push({
      key: 'plan',
      tone: 'info',
      text: `Swings between ${money(p.lowActual)} and ${money(p.peakActual)}. Budget ${money(
        p.safeSuggested,
      )} to cover a bad year.`,
    });
  } else if (p.avgActual > 0) {
    tips.push({
      key: 'plan',
      tone: 'info',
      text: `Budget ${money(p.suggested)} to match typical spend across ${seasonWord}.`,
    });
  }

  // Translate the category into the number parents actually feel.
  if (rosterSize > 0 && p.avgActual > 0) {
    tips.push({
      key: 'per-player',
      tone: 'info',
      text: `About ${money(p.avgActual / rosterSize)} per player at ${rosterSize} players.`,
    });
  }

  // Where this season's plan stands against history.
  const gap = currentBudgeted - p.avgActual;
  if (currentBudgeted === 0 && p.avgActual > 0) {
    tips.push({
      key: 'gap',
      tone: 'warn',
      text: `Nothing budgeted this season, but you have averaged ${money(
        p.avgActual,
      )}. Add a line item or this lands as a surprise.`,
    });
  } else if (currentBudgeted > 0 && gap < -1) {
    tips.push({
      key: 'gap',
      tone: 'warn',
      text: `This season is ${money(gap)} short of typical spend. Add it here or find ${money(gap)} of cuts elsewhere.`,
    });
  } else if (currentBudgeted > 0 && gap > p.avgActual * 0.1) {
    tips.push({
      key: 'gap',
      tone: 'good',
      text: `Budgeted ${money(gap)} above typical spend — that cushion is available if another category runs hot.`,
    });
  }

  // The overspend itself, sized as a concrete target.
  if (p.variance !== null && p.variance > 5) {
    const over = p.avgActual - p.avgBudgeted;
    const perPlayer = rosterSize > 0 ? ` (${money(over / rosterSize)} per player)` : '';
    tips.push({
      key: 'overspend',
      tone: 'warn',
      text: `Runs ${money(over)} over budget per season${perPlayer}. Either raise the budget to ${money(
        p.suggested,
      )} or cut ${money(over)} of spend.`,
    });
  } else if (p.variance !== null && p.variance < -10) {
    const under = p.avgBudgeted - p.avgActual;
    tips.push({
      key: 'underspend',
      tone: 'good',
      text: `Consistently ${money(under)} under budget. Trimming this line frees ${money(
        under,
      )} for categories that run over.`,
    });
  } else if (p.variance === null && p.avgActual > 0) {
    tips.push({
      key: 'unbudgeted',
      tone: 'warn',
      text: `${money(p.avgActual)} spent with no budget line behind it. Budget it so it stops eating the buffer.`,
    });
  }

  if (p.seasonsTracked === 1) {
    tips.push({
      key: 'confidence',
      tone: 'info',
      text: `Based on one season (${p.lastSeasonId}) — treat as a rough estimate.`,
    });
  }

  return tips;
}
