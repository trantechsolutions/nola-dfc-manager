/**
 * parseStatement.js
 *
 * Client-side CSV parser for bank/digital account statements.
 * Returns a normalised array of { date, description, amount, raw }.
 *
 * Supports three common export formats:
 *   Format A: Date, Description, Amount          (single amount column, negative = debit)
 *   Format B: Date, Description, Debit, Credit   (separate debit/credit columns)
 *   Format C: Date, Description, Withdrawals, Deposits, Balance
 *
 * All parsing is best-effort — unrecognised rows are skipped.
 */

const AMOUNT_HEADERS = ['amount', 'transaction amount', 'net amount'];
const DEBIT_HEADERS = ['debit', 'withdrawal', 'withdrawals', 'dr'];
const CREDIT_HEADERS = ['credit', 'deposit', 'deposits', 'cr'];
const DATE_HEADERS = ['date', 'transaction date', 'posted date', 'value date'];
const DESC_HEADERS = ['description', 'memo', 'transaction', 'details', 'narration', 'payee'];

function normaliseHeader(h) {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '');
}

function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h === c || h.includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(str) {
  if (!str || str.trim() === '' || str.trim() === '-') return 0;
  // Strip currency symbols, commas, spaces; keep minus and decimal
  const clean = str.replace(/[^0-9.-]/g, '');
  return parseFloat(clean) || 0;
}

function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  // Try ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // MM/DD/YYYY or MM-DD-YYYY
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // DD/MM/YYYY — ambiguous, but try if day > 12
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy && parseInt(dmy[1], 10) > 12) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * @param {string} csv  Raw CSV text from file read or textarea paste
 * @returns {Array<{date: string|null, description: string, amount: number, raw: string}>}
 */
export function parseStatementCSV(csv) {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Find header row — first row that contains a recognisable date or amount header
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const cols = splitCSVLine(lines[i]).map(normaliseHeader);
    if (
      findCol(cols, DATE_HEADERS) !== -1 ||
      findCol(cols, AMOUNT_HEADERS) !== -1 ||
      findCol(cols, DEBIT_HEADERS) !== -1
    ) {
      headerIdx = i;
      break;
    }
  }

  const headers = splitCSVLine(lines[headerIdx]).map(normaliseHeader);
  const dateCol = findCol(headers, DATE_HEADERS);
  const descCol = findCol(headers, DESC_HEADERS);
  const amtCol = findCol(headers, AMOUNT_HEADERS);
  const debitCol = findCol(headers, DEBIT_HEADERS);
  const creditCol = findCol(headers, CREDIT_HEADERS);

  // Minimal 2-column format: no recognised headers but first col looks like a date
  // and second col looks like a number — treat as Date, Amount.
  // Use raw (un-normalised) columns because normaliseHeader strips date separators.
  const rawHeaderCols = splitCSVLine(lines[headerIdx]);
  const firstDataCols = splitCSVLine(lines[headerIdx + 1] || '');
  const isMinimalFormat =
    dateCol === -1 &&
    amtCol === -1 &&
    debitCol === -1 &&
    firstDataCols.length >= 2 &&
    parseDate(rawHeaderCols[0] || firstDataCols[0]) !== null;

  const rows = [];
  // When minimal format, re-parse from headerIdx (the "header" row may actually be data)
  const dataStart = isMinimalFormat ? headerIdx : headerIdx + 1;

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    const cols = splitCSVLine(line);
    if (cols.length < 2) continue;

    let date, description, amount;

    if (isMinimalFormat) {
      // Col 0 = date, col 1 = amount (no description column)
      date = parseDate(cols[0]);
      amount = parseAmount(cols[1]);
      description = '';
    } else {
      date = dateCol !== -1 ? parseDate(cols[dateCol]) : null;
      description = descCol !== -1 ? cols[descCol].replace(/^"|"$/g, '').trim() : '';

      amount = 0;
      if (amtCol !== -1) {
        amount = parseAmount(cols[amtCol]);
      } else if (debitCol !== -1 || creditCol !== -1) {
        const debit = debitCol !== -1 ? parseAmount(cols[debitCol]) : 0;
        const credit = creditCol !== -1 ? parseAmount(cols[creditCol]) : 0;
        // Debits reduce balance (negative), credits increase (positive)
        amount = credit - debit;
      }
    }

    if (amount === 0 && !date && !description) continue;

    rows.push({ date, description, amount: Math.round(amount * 100) / 100, raw: line });
  }

  return rows;
}

/**
 * Compare statement rows against app transactions for the same account + month.
 *
 * Matching strategy:
 *   1. Exact amount match within the month window
 *   2. If multiple same-amount candidates, prefer closest date (within 3 days)
 *   3. Unmatched on either side are the discrepancies
 *
 * @param {Array} statementRows   Output of parseStatementCSV
 * @param {Array} appTransactions All transactions (already month-filtered for the account)
 * @param {string} monthKey       'YYYY-MM-01'
 * @returns {{ matched: Array, statementOnly: Array, appOnly: Array }}
 */
export function compareStatement(statementRows, appTransactions, _monthKey) {
  // Use all statement rows — this tool spans the full uploaded file, not just one month.
  // App transactions are filtered to the statement's date span to avoid noise from
  // unrelated periods; no month window is applied to the statement side.
  const datedRows = statementRows.filter((r) => r.date);
  const stmtMin = datedRows.length ? datedRows.reduce((m, r) => (r.date < m ? r.date : m), datedRows[0].date) : null;
  const stmtMax = datedRows.length ? datedRows.reduce((m, r) => (r.date > m ? r.date : m), datedRows[0].date) : null;

  const stmtInMonth = statementRows; // compare against all uploaded rows

  // Normalise app transactions to same shape; filter to the statement's date range
  // so we don't show entries from completely different periods as "app only".
  const appRows = appTransactions
    .map((tx) => {
      let date = null;
      if (tx.rawDate) date = tx.rawDate.split('T')[0];
      else if (tx.date?.seconds) date = new Date(tx.date.seconds * 1000).toISOString().split('T')[0];
      else if (tx.date instanceof Date) date = tx.date.toISOString().split('T')[0];
      else if (typeof tx.date === 'string') date = tx.date.split('T')[0];
      return { id: tx.id, date, description: tx.title || '', amount: Number(tx.amount), tx };
    })
    .filter((row) => {
      // Exclude app transactions entirely outside the statement's date span (+/- 5 days
      // to account for the fuzzy match window) to avoid flooding "app only" with entries
      // from completely unrelated periods.
      if (!stmtMin || !stmtMax || !row.date) return true;
      const padMs = 5 * 86400000;
      const rowMs = new Date(row.date).getTime();
      return rowMs >= new Date(stmtMin).getTime() - padMs && rowMs <= new Date(stmtMax).getTime() + padMs;
    });

  const usedStmtIndices = new Set();
  const usedAppIndices = new Set();
  const matched = [];

  // Pass 1: exact amount + date within 3 days
  for (let ai = 0; ai < appRows.length; ai++) {
    const app = appRows[ai];
    let bestSi = -1;
    let bestDayDiff = Infinity;

    for (let si = 0; si < stmtInMonth.length; si++) {
      if (usedStmtIndices.has(si)) continue;
      const stmt = stmtInMonth[si];
      if (Math.abs(stmt.amount - app.amount) >= 0.01) continue;

      const dayDiff = app.date && stmt.date ? Math.abs((new Date(app.date) - new Date(stmt.date)) / 86400000) : 999;

      if (dayDiff < bestDayDiff) {
        bestDayDiff = dayDiff;
        bestSi = si;
      }
    }

    if (bestSi !== -1 && bestDayDiff <= 5) {
      matched.push({ app, stmt: stmtInMonth[bestSi] });
      usedStmtIndices.add(bestSi);
      usedAppIndices.add(ai);
    }
  }

  // Pass 2: exact amount match regardless of date (for float/pending timing differences)
  for (let ai = 0; ai < appRows.length; ai++) {
    if (usedAppIndices.has(ai)) continue;
    const app = appRows[ai];

    for (let si = 0; si < stmtInMonth.length; si++) {
      if (usedStmtIndices.has(si)) continue;
      const stmt = stmtInMonth[si];
      if (Math.abs(stmt.amount - app.amount) >= 0.01) continue;

      matched.push({ app, stmt });
      usedStmtIndices.add(si);
      usedAppIndices.add(ai);
      break;
    }
  }

  const statementOnly = stmtInMonth.filter((_, i) => !usedStmtIndices.has(i));
  const appOnly = appRows.filter((_, i) => !usedAppIndices.has(i));

  return { matched, statementOnly, appOnly };
}
