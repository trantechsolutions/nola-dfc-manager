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
 *
 * Field mapping:
 *   Pass a `mapping` object to parseStatementCSV to override auto-detected columns.
 *   Use detectColumns(csv) to get the auto-detected mapping for pre-populating a UI.
 */

const AMOUNT_HEADERS = ['amount', 'transaction amount', 'net amount'];
const DEBIT_HEADERS = ['debit', 'withdrawal', 'withdrawals', 'dr'];
const CREDIT_HEADERS = ['credit', 'deposit', 'deposits', 'cr'];
const DATE_HEADERS = ['date', 'transaction date', 'posted date', 'value date'];
const DESC_HEADERS = ['description', 'memo', 'transaction', 'details', 'narration', 'payee'];

// Short month names used for date parsing (Jan=1 .. Dec=12)
const MONTH_NAMES = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

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

/**
 * Attempt to parse a date string in any of the following formats:
 *   ISO:            2025-03-01, 2025-03-01T12:00:00, 2025/03/01
 *   US numeric:     3/1/2025, 03/01/2025, 3-1-2025 (MM/DD/YYYY)
 *   Short year:     3/1/25 (MM/DD/YY)
 *   Day-first:      31/01/2025, 31-01-2025 (DD/MM/YYYY, only when day > 12)
 *   Month name:     15-Mar-2025, Mar 15 2025, 15 Mar 2025, March 15 2025
 *   US long:        March 15, 2025
 *
 * Always returns 'YYYY-MM-DD' or null.
 */
export function parseDate(str) {
  if (!str) return null;
  const s = str.trim();

  // ISO variants: 2025-03-01 or 2025/03/01 (with optional time component)
  const iso = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m}-${d}`;
  }

  // Numeric MM/DD/YYYY or MM-DD-YYYY (4-digit year)
  const mdy4 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mdy4) {
    const [, m, d, y] = mdy4;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Numeric MM/DD/YY (2-digit year)
  const mdy2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (mdy2) {
    const [, m, d, yy] = mdy2;
    const y = parseInt(yy, 10) >= 70 ? `19${yy}` : `20${yy}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY — only unambiguous when day > 12
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy && parseInt(dmy[1], 10) > 12) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-Mon-YYYY  e.g. 15-Mar-2025 or 15-March-2025
  const dMonY = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (dMonY) {
    const mon = MONTH_NAMES[dMonY[2].toLowerCase().slice(0, 3)];
    if (mon) return `${dMonY[3]}-${String(mon).padStart(2, '0')}-${dMonY[1].padStart(2, '0')}`;
  }

  // Mon DD YYYY or Mon DD, YYYY  e.g. Mar 15 2025 / March 15, 2025
  const monDY = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monDY) {
    const mon = MONTH_NAMES[monDY[1].toLowerCase().slice(0, 3)];
    if (mon) return `${monDY[3]}-${String(mon).padStart(2, '0')}-${monDY[2].padStart(2, '0')}`;
  }

  // DD Mon YYYY  e.g. 15 Mar 2025 / 15 March 2025
  const dMon = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dMon) {
    const mon = MONTH_NAMES[dMon[2].toLowerCase().slice(0, 3)];
    if (mon) return `${dMon[3]}-${String(mon).padStart(2, '0')}-${dMon[1].padStart(2, '0')}`;
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
 * Parse a CSV string and return the raw headers + first data row, without
 * committing to any mapping. Used to skip to the actual header line.
 *
 * @param {string} csv
 * @returns {{ headerIdx: number, rawHeaders: string[], normHeaders: string[], firstDataCols: string[] }}
 */
function extractHeaders(csv) {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 1) return { headerIdx: 0, rawHeaders: [], normHeaders: [], firstDataCols: [] };

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

  const rawHeaders = splitCSVLine(lines[headerIdx]);
  const normHeaders = rawHeaders.map(normaliseHeader);
  const firstDataCols = splitCSVLine(lines[headerIdx + 1] || '');

  return { headerIdx, lines, rawHeaders, normHeaders, firstDataCols };
}

/**
 * Auto-detect which CSV columns map to date/amount/description/debit/credit.
 * Returns a mapping object that can be passed directly to parseStatementCSV,
 * or mutated by the user in the field-mapper UI.
 *
 * @param {string} csv  Raw CSV text
 * @returns {{
 *   dateCol: number,
 *   amtCol: number,
 *   descCol: number,
 *   debitCol: number,
 *   creditCol: number,
 *   isMinimalFormat: boolean,
 *   rawHeaders: string[],
 *   headerIdx: number,
 * }}
 */
export function detectColumns(csv) {
  const { headerIdx, rawHeaders, normHeaders, firstDataCols } = extractHeaders(csv);

  const dateCol = findCol(normHeaders, DATE_HEADERS);
  const descCol = findCol(normHeaders, DESC_HEADERS);
  const amtCol = findCol(normHeaders, AMOUNT_HEADERS);
  const debitCol = findCol(normHeaders, DEBIT_HEADERS);
  const creditCol = findCol(normHeaders, CREDIT_HEADERS);

  // Minimal 2-column: no named headers, but the first raw column parses as a date
  const isMinimalFormat =
    dateCol === -1 &&
    amtCol === -1 &&
    debitCol === -1 &&
    firstDataCols.length >= 2 &&
    parseDate(rawHeaders[0] || firstDataCols[0]) !== null;

  return { dateCol, amtCol, descCol, debitCol, creditCol, isMinimalFormat, rawHeaders, headerIdx };
}

/**
 * Parse a CSV statement into normalised rows.
 *
 * @param {string} csv     Raw CSV text
 * @param {object} [mapping]  Optional column override (from detectColumns or user mapper).
 *   All numeric fields are 0-based column indices; use -1 to indicate "not present".
 *   { dateCol, amtCol, descCol, debitCol, creditCol, isMinimalFormat }
 *   Omit or pass null to auto-detect.
 * @returns {Array<{date: string|null, description: string, amount: number, raw: string}>}
 */
export function parseStatementCSV(csv, mapping) {
  const { headerIdx, lines, rawHeaders, normHeaders, firstDataCols } = extractHeaders(csv);

  if (!lines || lines.length < 2) return [];

  // Resolve mapping: use provided override, or auto-detect
  let { dateCol, amtCol, descCol, debitCol, creditCol, isMinimalFormat } = mapping ?? detectColumns(csv);

  // If the caller passed a partial mapping, fill missing keys from auto-detect
  if (mapping) {
    const auto = detectColumns(csv);
    if (dateCol === undefined) dateCol = auto.dateCol;
    if (amtCol === undefined) amtCol = auto.amtCol;
    if (descCol === undefined) descCol = auto.descCol;
    if (debitCol === undefined) debitCol = auto.debitCol;
    if (creditCol === undefined) creditCol = auto.creditCol;
    if (isMinimalFormat === undefined) isMinimalFormat = auto.isMinimalFormat;
  }

  const rows = [];
  const dataStart = isMinimalFormat ? headerIdx : headerIdx + 1;

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    const cols = splitCSVLine(line);
    if (cols.length < 2) continue;

    let date, description, amount;

    if (isMinimalFormat) {
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
 *   2. If multiple same-amount candidates, prefer closest date (within 5 days)
 *   3. Unmatched on either side are the discrepancies
 *
 * @param {Array} statementRows   Output of parseStatementCSV
 * @param {Array} appTransactions All transactions (already account-filtered)
 * @param {string} _monthKey      Unused — kept for API compat; filtering is date-span based
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

  // Pass 1: exact amount + closest date within 5 days
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
