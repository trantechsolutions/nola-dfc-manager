import { jsPDF } from 'jspdf';

/**
 * Export an array of objects as a CSV file download.
 * @param {Object[]} data - Array of row objects
 * @param {string} filename - Download filename (without extension)
 * @param {{key: string, label: string}[]} columns - Column definitions
 */
export function exportToCSV(data, filename, columns) {
  const escapeCell = (value) => {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const rows = data.map((row) => columns.map((c) => escapeCell(row[c.key])).join(','));
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename}.csv`);
}

/**
 * Generate and download a ledger PDF.
 * @param {Object[]} transactions
 * @param {{name: string}} seasonInfo
 * @param {Function} formatMoney
 */
export function exportLedgerPDF(transactions, seasonInfo, formatMoney) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Transaction Ledger -- ${seasonInfo.name}`, 14, 18);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, 24);

  // Table header
  const colX = [14, 44, 100, 140, 185, 230, 260];
  const headers = ['Date', 'Title', 'Category', 'Player', 'Amount', 'Status'];
  let y = 34;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(241, 245, 249);
  doc.rect(12, y - 5, pageW - 24, 8, 'F');
  headers.forEach((h, i) => doc.text(h, colX[i], y));
  y += 10;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  let totalIncome = 0;
  let totalExpenses = 0;

  const sorted = [...transactions].sort((a, b) => {
    const da = a.date ? new Date(a.date) : new Date(0);
    const db = b.date ? new Date(b.date) : new Date(0);
    return da - db;
  });

  for (const tx of sorted) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(241, 245, 249);
      doc.rect(12, y - 5, pageW - 24, 8, 'F');
      headers.forEach((h, i) => doc.text(h, colX[i], y));
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    const date = tx.date ? new Date(tx.date).toLocaleDateString() : '';
    const title = truncate(tx.title || tx.description || '', 30);
    const category = truncate(tx.category || '', 20);
    const player = truncate(tx.playerName || '', 22);
    const amount = formatMoney(tx.amount || 0);
    const status = tx.cleared ? 'Cleared' : 'Pending';

    if (tx.amount > 0) totalIncome += tx.amount;
    else totalExpenses += Math.abs(tx.amount);

    doc.text(date, colX[0], y);
    doc.text(title, colX[1], y);
    doc.text(category, colX[2], y);
    doc.text(player, colX[3], y);
    doc.text(amount, colX[4], y);
    doc.text(status, colX[5], y);
    y += 7;
  }

  // Footer
  y += 5;
  if (y > doc.internal.pageSize.getHeight() - 25) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(200);
  doc.line(14, y, pageW - 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Income: ${formatMoney(totalIncome)}`, 14, y);
  y += 7;
  doc.text(`Total Expenses: ${formatMoney(totalExpenses)}`, 14, y);
  y += 7;
  const net = totalIncome - totalExpenses;
  doc.text(`Net: ${formatMoney(net)}`, 14, y);

  const blob = doc.output('blob');
  triggerDownload(blob, `ledger-${seasonInfo.name}.pdf`);
}

/**
 * Generate and download a player balances PDF.
 * @param {Object[]} players
 * @param {Function} calculatePlayerFinancials - (player) => financial data
 * @param {{name: string}} seasonInfo
 * @param {Function} formatMoney
 */
export function exportPlayerBalancesPDF(players, calculatePlayerFinancials, seasonInfo, formatMoney) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Player Balances -- ${seasonInfo.name}`, 14, 18);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, 24);

  // Table header
  const colX = [14, 90, 115, 155, 190, 220, 255];
  const headers = ['Player Name', 'Jersey #', 'Base Fee', 'Paid', 'Credits', 'Remaining'];
  let y = 34;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(241, 245, 249);
  doc.rect(12, y - 5, pageW - 24, 8, 'F');
  headers.forEach((h, i) => doc.text(h, colX[i], y));
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  let totalOwed = 0;
  let totalCollected = 0;

  const sorted = [...players].sort((a, b) => {
    const nameA = `${a.lastName || ''} ${a.firstName || ''}`.trim().toLowerCase();
    const nameB = `${b.lastName || ''} ${b.firstName || ''}`.trim().toLowerCase();
    return nameA.localeCompare(nameB);
  });

  for (const player of sorted) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(241, 245, 249);
      doc.rect(12, y - 5, pageW - 24, 8, 'F');
      headers.forEach((h, i) => doc.text(h, colX[i], y));
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    const fin = calculatePlayerFinancials(player);
    const name = `${player.lastName || ''}, ${player.firstName || ''}`.trim();
    const jersey = player.jerseyNumber != null ? String(player.jerseyNumber) : '';
    const baseFee = formatMoney(fin.baseFee || 0);
    const paid = formatMoney(fin.totalPaid || 0);
    const credits = formatMoney(fin.credits || 0);
    const remaining = formatMoney(fin.remainingBalance || 0);

    totalOwed += fin.baseFee || 0;
    totalCollected += fin.totalPaid || 0;

    doc.text(truncate(name, 40), colX[0], y);
    doc.text(jersey, colX[1], y);
    doc.text(baseFee, colX[2], y);
    doc.text(paid, colX[3], y);
    doc.text(credits, colX[4], y);
    doc.text(remaining, colX[5], y);
    y += 7;
  }

  // Summary
  y += 5;
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(200);
  doc.line(14, y, pageW - 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Owed: ${formatMoney(totalOwed)}`, 14, y);
  y += 7;
  doc.text(`Total Collected: ${formatMoney(totalCollected)}`, 14, y);
  y += 7;
  const rate = totalOwed > 0 ? ((totalCollected / totalOwed) * 100).toFixed(1) : '0.0';
  doc.text(`Collection Rate: ${rate}%`, 14, y);

  const blob = doc.output('blob');
  triggerDownload(blob, `player-balances-${seasonInfo.name}.pdf`);
}

/**
 * Generate and download a budget vs actuals PDF report.
 * @param {Object[]} budgetCategories - [{code, name, type}]
 * @param {Object} subtotals - {[code]: {income, expensesFall, expensesSpring}}
 * @param {Object} actuals - {[code]: number} (signed amounts from ledger)
 * @param {{name: string}} seasonInfo
 * @param {Function} formatMoney
 * @param {number} roundedBaseFee
 */
export function exportBudgetActualsPDF(budgetCategories, subtotals, actuals, seasonInfo, formatMoney, roundedBaseFee) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Budget vs Actuals -- ${seasonInfo.name}`, 14, 18);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${new Date().toLocaleDateString()} · Season Fee: ${formatMoney(roundedBaseFee)}`, 14, 24);

  const colX = [14, 90, 130, 170, 210, 250];
  const headers = ['Category', 'Budgeted', 'Actuals', 'Variance', 'Variance %', 'Status'];
  let y = 34;

  const drawTableHeader = () => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(241, 245, 249);
    doc.rect(12, y - 5, pageW - 24, 8, 'F');
    headers.forEach((h, i) => doc.text(h, colX[i], y));
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
  };

  drawTableHeader();

  let totalBudgeted = 0;
  let totalActual = 0;

  for (const cat of budgetCategories) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
      drawTableHeader();
    }

    const sub = subtotals[cat.code] || { income: 0, expensesFall: 0, expensesSpring: 0 };
    const budgeted = cat.type === 'income' ? sub.income : sub.expensesFall + sub.expensesSpring;
    const actual = Math.abs(actuals[cat.code] || 0);
    const variance = actual - budgeted;
    const variancePct = budgeted !== 0 ? ((variance / budgeted) * 100).toFixed(1) : '—';
    const isOver = cat.type === 'expense' && variance > 0;
    const isUnder = cat.type === 'income' && actual < budgeted;

    totalBudgeted += budgeted;
    totalActual += cat.type === 'income' ? actual : -actual;

    doc.text(truncate(cat.name, 35), colX[0], y);
    doc.text(formatMoney(budgeted), colX[1], y);
    doc.text(formatMoney(actual), colX[2], y);
    doc.text(formatMoney(Math.abs(variance)), colX[3], y);
    doc.text(budgeted !== 0 ? `${variancePct}%` : '—', colX[4], y);
    doc.text(isOver || isUnder ? 'OVER' : actual > 0 ? 'OK' : '—', colX[5], y);
    y += 7;
  }

  y += 5;
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(200);
  doc.line(14, y, pageW - 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Budgeted: ${formatMoney(totalBudgeted)}`, 14, y);
  y += 7;
  doc.text(`Total Actuals (Net): ${formatMoney(totalActual)}`, 14, y);
  y += 7;
  doc.text(`Season Fee / Player: ${formatMoney(roundedBaseFee)}`, 14, y);

  const blob = doc.output('blob');
  triggerDownload(blob, `budget-actuals-${seasonInfo.name}.pdf`);
}

/**
 * Export budget vs actuals as CSV.
 * @param {Object[]} budgetCategories
 * @param {Object} subtotals
 * @param {Object} actuals
 * @param {{name: string}} seasonInfo
 * @param {Function} formatMoney
 */
export function exportBudgetActualsCSV(budgetCategories, subtotals, actuals, seasonInfo, formatMoney) {
  const columns = [
    { key: 'category', label: 'Category' },
    { key: 'type', label: 'Type' },
    { key: 'budgeted', label: 'Budgeted' },
    { key: 'actual', label: 'Actuals' },
    { key: 'variance', label: 'Variance' },
    { key: 'variancePct', label: 'Variance %' },
  ];

  const rows = budgetCategories.map((cat) => {
    const sub = subtotals[cat.code] || { income: 0, expensesFall: 0, expensesSpring: 0 };
    const budgeted = cat.type === 'income' ? sub.income : sub.expensesFall + sub.expensesSpring;
    const actual = Math.abs(actuals[cat.code] || 0);
    const variance = actual - budgeted;
    const variancePct = budgeted !== 0 ? `${((variance / budgeted) * 100).toFixed(1)}%` : '—';
    return {
      category: cat.name,
      type: cat.type,
      budgeted: formatMoney(budgeted),
      actual: formatMoney(actual),
      variance: formatMoney(Math.abs(variance)),
      variancePct,
    };
  });

  exportToCSV(rows, `budget-actuals-${seasonInfo.name}`, columns);
}

/**
 * Generate and download an Insights summary PDF.
 * @param {Object} analytics - computed analytics from InsightsView
 * @param {Object} scheduleAnalytics
 * @param {Object} matchReport
 * @param {string} selectedSeason
 * @param {Function} formatMoney
 * @param {Object} CATEGORY_LABELS
 */
export function exportInsightsPDF(
  analytics,
  scheduleAnalytics,
  matchReport,
  selectedSeason,
  formatMoney,
  CATEGORY_LABELS,
) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const a = analytics;
  const s = scheduleAnalytics;
  const m = matchReport;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Budget Insights Report -- ${selectedSeason}`, 14, 18);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generated ${new Date().toLocaleDateString()} · Season ${a.seasonStatus} (${a.seasonProgress}% complete)`,
    14,
    24,
  );

  let y = 34;

  const section = (title) => {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(241, 245, 249);
    doc.rect(12, y - 4, pageW - 24, 7, 'F');
    doc.text(title, 14, y + 1);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
  };

  const row = (label, value) => {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 20;
    }
    doc.text(label, 14, y);
    doc.text(String(value), 120, y);
    y += 6;
  };

  section('Financial Summary');
  row('Net Cash', formatMoney(a.netCash));
  row('Total Income', formatMoney(a.totalIncome));
  row('Total Expenses', formatMoney(a.totalExpenses));
  row('Outstanding Balances', formatMoney(a.totalOutstanding));
  row('Collection Rate', `${a.collectionRate}% (${a.paidInFull} of ${a.playerBalances.length} players)`);
  row('Budget Spent', `${formatMoney(a.totalExpenses)} of ${formatMoney(a.projectedExpenses)} (${a.burnRate}%)`);
  row('Budget Remaining', formatMoney(a.budgetRemaining));

  section('Projections');
  row('Projected Remaining Costs', formatMoney(a.projRemainingTotal));
  row('Projected Final Spend', formatMoney(a.projectedFinalExpense));
  row(`Projected ${a.projectedOverUnder >= 0 ? 'Surplus' : 'Shortfall'}`, formatMoney(Math.abs(a.projectedOverUnder)));
  row('Upcoming Unpaid Events', String(m.summary.upcomingWithNoCost));
  row('Est. Unpaid Event Costs', formatMoney(a.projUnpaidCost));
  row('Remaining Referee Fees', formatMoney(a.projRemainingRefs));

  section('Schedule');
  row('Past League Games', String(s.pastLeague.length));
  row('Past Tournaments', String(s.pastTournaments.length));
  row('Past Friendlies', String(s.pastFriendlies.length));
  row('Upcoming League Games', String(s.upcomingLeague.length));
  row('Upcoming Tournaments', String(s.upcomingTournaments.length));
  row('Upcoming Friendlies', String(s.upcomingFriendlies.length));

  section('Category Actuals');
  for (const [cat, amt] of Object.entries(a.categoryActuals).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))) {
    row(CATEGORY_LABELS[cat] || cat, formatMoney(amt));
  }

  if (a.topOwed.length > 0) {
    section('Outstanding Player Balances');
    for (const p of a.topOwed.slice(0, 20)) {
      row(`#${p.jerseyNumber || '?'} ${p.name}`, formatMoney(p.remainingBalance));
    }
  }

  const blob = doc.output('blob');
  triggerDownload(blob, `insights-${selectedSeason}.pdf`);
}

// ── Helpers ──

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '...' : str;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
