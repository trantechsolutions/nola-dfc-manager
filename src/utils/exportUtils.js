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
