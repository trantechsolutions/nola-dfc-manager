import React, { useState, useCallback, useMemo } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Calendar,
  Settings2,
  RotateCcw,
  Link2,
  Unlink2,
} from 'lucide-react';
import { parseStatementCSV, compareStatement, detectColumns } from '../utils/parseStatement';
import { monthKeyToLabel } from '../utils/computeBookBalance';

const FILTER_MODES = [
  { id: 'month', label: 'This month' },
  { id: 'range', label: 'Date range' },
  { id: 'season', label: 'Entire season' },
];

// App fields the user can map CSV columns to
const APP_FIELDS = [
  { id: 'dateCol', label: 'Date' },
  { id: 'amtCol', label: 'Amount' },
  { id: 'descCol', label: 'Description' },
  { id: 'debitCol', label: 'Debit' },
  { id: 'creditCol', label: 'Credit' },
];

/**
 * Single row in a statement-only or app-only list.
 * When `onSelect` is provided the row is interactive for manual matching.
 * `selected` highlights the row as the pending match candidate.
 */
function StmtRow({ row, borderClass, bgClass, formatMoney, onSelect, selected, selectable }) {
  const interactiveClass = selectable
    ? selected
      ? 'ring-2 ring-inset ring-blue-500 cursor-pointer'
      : 'cursor-pointer hover:brightness-95 dark:hover:brightness-110'
    : '';

  return (
    <div
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={selectable ? (e) => e.key === 'Enter' && onSelect?.() : undefined}
      className={`flex items-center justify-between px-4 py-2.5 gap-3 transition-all ${borderClass} ${bgClass} ${interactiveClass}`}
    >
      <div className="min-w-0 flex items-center gap-2">
        {selected && <Link2 size={11} className="text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />}
        <div className="min-w-0">
          <p className="text-sm font-bold tabular-nums text-foreground">{formatMoney(row.amount)}</p>
          <p className="text-xs text-muted-foreground font-medium leading-tight mt-0.5">
            {row.date || 'No date'}
            {row.description ? <span className="ml-1 text-muted-foreground">· {row.description}</span> : null}
          </p>
        </div>
      </div>
      <span
        className={`text-xs font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-lg ${
          row.amount >= 0
            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
        }`}
      >
        {row.amount >= 0 ? '+' : ''}
        {formatMoney(Math.abs(row.amount))}
      </span>
    </div>
  );
}

/**
 * StatementImportModal
 *
 * Accepts a CSV bank statement (file or paste), parses it client-side,
 * and compares against the app's transactions for the selected account + month.
 * No data is written — this is a read-only diagnostic tool.
 *
 * Supports manual field mapping: after upload the user can reassign which CSV
 * column corresponds to date / amount / description / debit / credit.
 */
export default function StatementImportModal({
  show,
  onClose,
  account, // { id, name, holding } — the account being reconciled
  transactions, // All transactions (will be filtered to account + month here)
  monthKey, // 'YYYY-MM-01'
  formatMoney,
}) {
  const [csvText, setCsvText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [showMatched, setShowMatched] = useState(false);
  const [filterMode, setFilterMode] = useState('month');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  // Field mapping state — null means "use auto-detect"
  const [userMapping, setUserMapping] = useState(null);
  const [showMapper, setShowMapper] = useState(false);
  // Manual match state: pairs of { stmtIdx, appIdx } into result.statementOnly / result.appOnly
  const [manualMatches, setManualMatches] = useState([]);
  // Pending selection: 'stmt' | 'app' side + index of the row awaiting its counterpart
  const [pendingMatch, setPendingMatch] = useState(null); // { side: 'stmt'|'app', idx: number }
  const [showManualMatches, setShowManualMatches] = useState(true);

  // Auto-detected columns from the CSV (recomputed when CSV changes)
  const autoDetected = useMemo(() => {
    if (!csvText.trim()) return null;
    try {
      return detectColumns(csvText);
    } catch {
      return null;
    }
  }, [csvText]);

  // Resolved mapping: user overrides take precedence, auto-detect fills the rest
  const resolvedMapping = useMemo(() => {
    if (!autoDetected) return null;
    if (!userMapping) return autoDetected;
    return { ...autoDetected, ...userMapping };
  }, [autoDetected, userMapping]);

  // All transactions for this account (unfiltered — each mode slices below)
  const allAccountTransactions = useMemo(() => {
    if (!account || !transactions) return [];
    const ids = new Set(account._allBankIds ? account._allBankIds : [account.id]);
    return transactions.filter(
      (tx) => ids.has(tx.accountId) || ids.has(tx.transferFromAccountId) || ids.has(tx.transferToAccountId),
    );
  }, [account, transactions]);

  // Derive a normalised date string from a raw transaction (mirrors compareStatement logic)
  function txDate(tx) {
    if (tx.rawDate) return tx.rawDate.split('T')[0];
    if (tx.date?.seconds) return new Date(tx.date.seconds * 1000).toISOString().split('T')[0];
    if (tx.date instanceof Date) return tx.date.toISOString().split('T')[0];
    if (typeof tx.date === 'string') return tx.date.split('T')[0];
    return null;
  }

  // Slice account transactions according to the active filter mode
  const accountTransactions = useMemo(() => {
    if (filterMode === 'season') return allAccountTransactions;

    if (filterMode === 'range') {
      if (!rangeStart && !rangeEnd) return allAccountTransactions;
      return allAccountTransactions.filter((tx) => {
        const d = txDate(tx);
        if (!d) return true;
        if (rangeStart && d < rangeStart) return false;
        if (rangeEnd && d > rangeEnd) return false;
        return true;
      });
    }

    // 'month' mode — filter to the selectedMonth window
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return allAccountTransactions.filter((tx) => {
      const d = txDate(tx);
      if (!d) return true;
      return d >= monthStart && d <= monthEnd;
    });
  }, [filterMode, allAccountTransactions, monthKey, rangeStart, rangeEnd]);

  const result = useMemo(() => {
    if (!csvText.trim()) return null;
    try {
      const stmtRows = parseStatementCSV(csvText, resolvedMapping);
      if (stmtRows.length === 0) return { error: 'No rows found — check the CSV format or field mapping.' };
      const comparison = compareStatement(stmtRows, accountTransactions, monthKey);
      const dated = stmtRows.filter((r) => r.date);
      comparison.stmtDateMin = dated.length ? dated.reduce((m, r) => (r.date < m ? r.date : m), dated[0].date) : null;
      comparison.stmtDateMax = dated.length ? dated.reduce((m, r) => (r.date > m ? r.date : m), dated[0].date) : null;
      comparison.totalStmtRows = stmtRows.length;
      return comparison;
    } catch (e) {
      return { error: `Parse error: ${e.message}` };
    }
  }, [csvText, resolvedMapping, accountTransactions, monthKey]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setUserMapping(null);
    setManualMatches([]);
    setPendingMatch(null);
    const reader = new FileReader();
    reader.onload = (e) => setCsvText(e.target.result || '');
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile],
  );

  function reset() {
    setCsvText('');
    setFileName('');
    setShowMatched(false);
    setUserMapping(null);
    setShowMapper(false);
    setManualMatches([]);
    setPendingMatch(null);
  }

  // Manual match interaction: clicking a row on one side sets it as pending;
  // clicking a row on the other side completes the pair.
  function handleRowSelect(side, idx) {
    if (!pendingMatch) {
      setPendingMatch({ side, idx });
      return;
    }
    // Clicking the same row again cancels the pending selection
    if (pendingMatch.side === side && pendingMatch.idx === idx) {
      setPendingMatch(null);
      return;
    }
    // Clicking the same side picks a different pending row
    if (pendingMatch.side === side) {
      setPendingMatch({ side, idx });
      return;
    }
    // Opposite side clicked — form the pair
    const stmtIdx = side === 'stmt' ? idx : pendingMatch.idx;
    const appIdx = side === 'app' ? idx : pendingMatch.idx;
    setManualMatches((prev) => [...prev, { stmtIdx, appIdx }]);
    setPendingMatch(null);
  }

  function removeManualMatch(pairIdx) {
    setManualMatches((prev) => prev.filter((_, i) => i !== pairIdx));
  }

  // Label shown in the header subtitle reflecting the active filter
  const filterLabel = useMemo(() => {
    if (filterMode === 'season') return 'Entire season';
    if (filterMode === 'range') {
      if (rangeStart && rangeEnd) return `${rangeStart} → ${rangeEnd}`;
      if (rangeStart) return `From ${rangeStart}`;
      if (rangeEnd) return `Until ${rangeEnd}`;
      return 'Date range (all)';
    }
    return monthKeyToLabel(monthKey);
  }, [filterMode, monthKey, rangeStart, rangeEnd]);

  // Derive an institution label from the file name (strip extension, replace underscores/hyphens)
  const institutionLabel = useMemo(() => {
    if (!fileName) return null;
    return fileName
      .replace(/\.[^.]+$/, '') // strip extension
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }, [fileName]);

  if (!show) return null;

  const hasResult = result && !result.error;

  // Filter manual-matched indices out of the unmatched lists
  const manualStmtIndices = new Set(manualMatches.map((p) => p.stmtIdx));
  const manualAppIndices = new Set(manualMatches.map((p) => p.appIdx));

  const visibleStmtOnly = hasResult ? result.statementOnly.filter((_, i) => !manualStmtIndices.has(i)) : [];
  const visibleAppOnly = hasResult ? result.appOnly.filter((_, i) => !manualAppIndices.has(i)) : [];

  // Net amount excludes both auto-matched and manually-matched rows
  const netUnmatched = hasResult
    ? visibleStmtOnly.reduce((s, r) => s + r.amount, 0) - visibleAppOnly.reduce((s, r) => s + r.amount, 0)
    : 0;

  // Total matched = auto + manual
  const totalMatched = hasResult ? result.matched.length + manualMatches.length : 0;

  // Column index options for the mapper dropdowns
  const colOptions = autoDetected
    ? [
        { value: -1, label: '— not mapped —' },
        ...autoDetected.rawHeaders.map((h, i) => ({ value: i, label: `Col ${i + 1}: ${h || '(empty)'}` })),
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Statement import for ${account?.name}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card w-full sm:max-w-3xl rounded-t-3xl sm:rounded-lg shadow-md flex flex-col max-h-[92vh] overflow-hidden">
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-bold text-muted-foreground">Statement Comparison</p>
            <h2 className="text-base font-bold text-foreground leading-tight truncate">
              {account?.name}
              {hasResult && result.stmtDateMin && result.stmtDateMax
                ? ` — ${result.stmtDateMin} → ${result.stmtDateMax}`
                : ` — ${filterLabel}`}
            </h2>
            {/* Institution badge — derived from file name */}
            {institutionLabel && (
              <p className="text-xs font-semibold text-muted-foreground mt-0.5 flex items-center gap-1">
                <FileText size={9} aria-hidden="true" />
                {institutionLabel}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* ── APP TRANSACTION FILTER MODE ── */}
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Calendar size={11} aria-hidden="true" />
              Compare app transactions from
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {FILTER_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setFilterMode(mode.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === mode.id ? 'bg-card text-white' : 'bg-muted text-foreground hover:bg-muted'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {filterMode === 'range' && (
              <div className="mt-3 flex gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">From</label>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="text-xs font-mono border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">To</label>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="text-xs font-mono border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {filterMode === 'season' && (
              <p className="mt-2 text-xs text-muted-foreground font-medium">
                All {allAccountTransactions.length} transactions for this account will be included.
              </p>
            )}

            {filterMode === 'month' && (
              <p className="mt-2 text-xs text-muted-foreground font-medium">
                Showing {accountTransactions.length} transaction{accountTransactions.length !== 1 ? 's' : ''} in{' '}
                {monthKeyToLabel(monthKey)}.
              </p>
            )}
          </div>

          {/* ── UPLOAD AREA ── */}
          {!csvText && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                dragOver
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-border hover:border-border dark:hover:border-border'
              }`}
            >
              <Upload size={28} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">
                Drop a CSV statement here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Accepts any CSV with a date and amount column — description is optional. Works with Chase, Venmo,
                PayPal, and most bank exports.
              </p>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-card text-white rounded-lg text-xs font-bold hover:bg-accent/90 transition-colors">
                <FileText size={13} />
                Choose File
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </label>
            </div>
          )}

          {/* ── PASTE FALLBACK ── */}
          {!csvText && (
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1.5">Or paste CSV text directly</p>
              <textarea
                rows={5}
                placeholder={
                  'Date,Amount\n2025-03-01,250.00\n2025-03-15,-75.00\n\nAlso works with Description column:\nDate,Description,Amount\n2025-03-01,Team Fees,250.00'
                }
                className="w-full text-xs font-mono border border-border rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring resize-y placeholder:text-muted-foreground"
                onBlur={(e) => {
                  if (e.target.value.trim()) {
                    setUserMapping(null);
                    setCsvText(e.target.value);
                  }
                }}
              />
            </div>
          )}

          {/* ── FIELD MAPPER (shown after CSV is loaded) ── */}
          {csvText && autoDetected && (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Mapper header row */}
              <div className="flex items-center justify-between px-4 py-3 bg-background">
                <div className="flex items-center gap-2">
                  <FileText size={13} className="text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">{fileName || 'Pasted CSV'}</span>
                  {hasResult && (
                    <span className="text-xs text-muted-foreground font-medium">
                      · {result.totalStmtRows ?? result.matched.length + result.statementOnly.length} rows
                    </span>
                  )}
                  {userMapping && (
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">custom mapping</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {userMapping && (
                    <button
                      onClick={() => setUserMapping(null)}
                      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      title="Reset to auto-detected mapping"
                    >
                      <RotateCcw size={10} />
                      Auto-detect
                    </button>
                  )}
                  <button
                    onClick={() => setShowMapper((p) => !p)}
                    aria-expanded={showMapper}
                    className={`flex items-center gap-1 text-xs font-semibold transition-colors ${
                      showMapper ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Settings2 size={11} />
                    Map fields
                  </button>
                  <button
                    onClick={reset}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Mapper body */}
              {showMapper && !autoDetected.isMinimalFormat && (
                <div className="px-4 py-4 border-t border-border space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">
                    Map each app field to the matching column in your CSV. Columns detected automatically are
                    pre-selected — override only what needs changing.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {APP_FIELDS.map((field) => {
                      const currentVal = resolvedMapping?.[field.id] ?? -1;
                      return (
                        <div key={field.id} className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-muted-foreground">{field.label}</label>
                          <select
                            value={currentVal}
                            onChange={(e) =>
                              setUserMapping((prev) => ({
                                ...(prev ?? {}),
                                [field.id]: Number(e.target.value),
                                // switching to explicit amtCol disables debit/credit mode
                                ...(field.id === 'amtCol' && Number(e.target.value) !== -1
                                  ? { debitCol: -1, creditCol: -1 }
                                  : {}),
                              }))
                            }
                            className="text-xs border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                          >
                            {colOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Minimal format notice */}
              {showMapper && autoDetected.isMinimalFormat && (
                <div className="px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium">
                    This file uses minimal format (no column headers). Column 1 = Date, Column 2 = Amount. Field mapping
                    is not available for headerless exports.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── PARSE ERROR ── */}
          {result?.error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <AlertTriangle size={14} className="text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">{result.error}</p>
                <button
                  onClick={reset}
                  className="text-xs text-red-700 dark:text-red-400 hover:text-red-700 dark:text-red-300 mt-1 font-medium"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {hasResult && (
            <>
              {/* Summary chips — counts reflect manual matches applied */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {totalMatched}
                  </p>
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Matched{manualMatches.length > 0 ? ` (${manualMatches.length} manual)` : ''}
                  </p>
                </div>
                <div
                  className={`border rounded-lg p-3 text-center ${
                    visibleStmtOnly.length > 0
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                      : 'bg-background border-border'
                  }`}
                >
                  <p
                    className={`text-xl font-bold tabular-nums ${visibleStmtOnly.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
                  >
                    {visibleStmtOnly.length}
                  </p>
                  <p
                    className={`text-xs font-semibold mt-0.5 ${visibleStmtOnly.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                  >
                    Statement only
                  </p>
                </div>
                <div
                  className={`border rounded-lg p-3 text-center ${
                    visibleAppOnly.length > 0
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                      : 'bg-background border-border'
                  }`}
                >
                  <p
                    className={`text-xl font-bold tabular-nums ${visibleAppOnly.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
                  >
                    {visibleAppOnly.length}
                  </p>
                  <p
                    className={`text-xs font-semibold mt-0.5 ${visibleAppOnly.length > 0 ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}
                  >
                    App only
                  </p>
                </div>
              </div>

              {/* Net unmatched amount */}
              {(visibleStmtOnly.length > 0 || visibleAppOnly.length > 0) && (
                <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
                  <span className="text-xs font-semibold text-muted-foreground">Unmatched net amount</span>
                  <span
                    className={`text-base font-bold tabular-nums ${
                      Math.abs(netUnmatched) < 0.01
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {formatMoney(netUnmatched)}
                  </span>
                </div>
              )}

              {/* ── MANUAL MATCH HINT (shown when there are unmatched rows on both sides) ── */}
              {visibleStmtOnly.length > 0 && visibleAppOnly.length > 0 && (
                <div
                  className={`flex items-start gap-2.5 rounded-lg px-4 py-3 border transition-all ${
                    pendingMatch
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700'
                      : 'bg-background border-border'
                  }`}
                >
                  <Link2
                    size={13}
                    className={`shrink-0 mt-0.5 ${pendingMatch ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    {pendingMatch ? (
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                        {pendingMatch.side === 'stmt'
                          ? 'Statement row selected — now click a row in "App only" to pair them.'
                          : 'App row selected — now click a row in "Statement only" to pair them.'}
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-foreground">Manual matching available</p>
                    )}
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      Click any unmatched row to select it, then click its counterpart on the other side to link them as
                      a manual match.
                    </p>
                    {pendingMatch && (
                      <button
                        onClick={() => setPendingMatch(null)}
                        className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-300"
                      >
                        Cancel selection
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── STATEMENT ONLY ── */}
              {visibleStmtOnly.length > 0 && (
                <section aria-label="Transactions in statement but not in app">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    In your statement — not logged in the app ({visibleStmtOnly.length})
                  </p>
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 overflow-hidden">
                    {result.statementOnly.map((row, i) => {
                      if (manualStmtIndices.has(i)) return null;
                      const visIdx = visibleStmtOnly.indexOf(row);
                      const isSelected = pendingMatch?.side === 'stmt' && pendingMatch.idx === i;
                      return (
                        <StmtRow
                          key={i}
                          row={row}
                          borderClass={visIdx > 0 ? 'border-t border-amber-100 dark:border-amber-900' : ''}
                          bgClass={
                            isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-amber-50/50 dark:bg-amber-950/20'
                          }
                          formatMoney={formatMoney}
                          selectable
                          selected={isSelected}
                          onSelect={() => handleRowSelect('stmt', i)}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── APP ONLY ── */}
              {visibleAppOnly.length > 0 && (
                <section aria-label="Transactions in app but not in statement">
                  <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    Logged in app — not on your statement ({visibleAppOnly.length})
                  </p>
                  <div className="rounded-lg border border-red-200 dark:border-red-800 overflow-hidden">
                    {result.appOnly.map((row, i) => {
                      if (manualAppIndices.has(i)) return null;
                      const visIdx = visibleAppOnly.indexOf(row);
                      const isSelected = pendingMatch?.side === 'app' && pendingMatch.idx === i;
                      return (
                        <StmtRow
                          key={i}
                          row={row}
                          borderClass={visIdx > 0 ? 'border-t border-red-100 dark:border-red-900' : ''}
                          bgClass={isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-red-50/50 dark:bg-red-950/20'}
                          formatMoney={formatMoney}
                          selectable
                          selected={isSelected}
                          onSelect={() => handleRowSelect('app', i)}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── MANUAL MATCHES ── */}
              {manualMatches.length > 0 && (
                <section aria-label="Manually matched transactions">
                  <button
                    onClick={() => setShowManualMatches((p) => !p)}
                    aria-expanded={showManualMatches}
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-300 transition-colors mb-2"
                  >
                    {showManualMatches ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <Link2 size={11} />
                    Manually matched ({manualMatches.length})
                  </button>
                  {showManualMatches && (
                    <div className="rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden">
                      {manualMatches.map((pair, pairIdx) => {
                        const stmt = result.statementOnly[pair.stmtIdx];
                        const app = result.appOnly[pair.appIdx];
                        const delta = app && stmt ? app.amount - stmt.amount : 0;
                        return (
                          <div
                            key={pairIdx}
                            className={`px-4 py-3 bg-blue-50/40 dark:bg-blue-950/20 ${pairIdx > 0 ? 'border-t border-blue-100 dark:border-blue-900' : ''}`}
                          >
                            <div className="grid grid-cols-2 gap-3 mb-1.5">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-muted-foreground mb-0.5">Statement</p>
                                <p className="text-sm font-bold tabular-nums text-foreground">
                                  {formatMoney(stmt?.amount ?? 0)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {stmt?.date || 'No date'}
                                  {stmt?.description ? ` · ${stmt.description}` : ''}
                                </p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-muted-foreground mb-0.5">App</p>
                                <p className="text-sm font-bold tabular-nums text-foreground">
                                  {formatMoney(app?.amount ?? 0)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {app?.date || 'No date'}
                                  {app?.description ? ` · ${app.description}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              {Math.abs(delta) >= 0.01 ? (
                                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                  Δ {formatMoney(delta)} amount difference
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 size={10} /> Amounts match
                                </span>
                              )}
                              <button
                                onClick={() => removeManualMatch(pairIdx)}
                                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-red-700 dark:text-red-400 dark:hover:text-red-400 transition-colors"
                                aria-label="Remove manual match"
                              >
                                <Unlink2 size={10} />
                                Unmatch
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* All clear */}
              {visibleStmtOnly.length === 0 && visibleAppOnly.length === 0 && (
                <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-4">
                  <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      All transactions accounted for
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                      Every row has been matched —{' '}
                      {manualMatches.length > 0 ? `${manualMatches.length} manually paired` : 'all automatic'}.
                    </p>
                  </div>
                </div>
              )}

              {/* ── AUTO-MATCHED (collapsible) ── */}
              {result.matched.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowMatched((p) => !p)}
                    aria-expanded={showMatched}
                    className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showMatched ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    Show auto-matched rows ({result.matched.length})
                  </button>
                  {showMatched && (
                    <div className="mt-2 rounded-lg border border-border overflow-hidden">
                      {result.matched.map(({ app, stmt }, i) => (
                        <div
                          key={i}
                          className={`grid grid-cols-2 gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-muted-foreground mb-0.5">App</p>
                            <p className="text-sm font-bold tabular-nums text-foreground">{formatMoney(app.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              {app.date || 'No date'}
                              {app.description ? ` · ${app.description}` : ''}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-muted-foreground mb-0.5">Statement</p>
                            <p className="text-sm font-bold tabular-nums text-foreground">{formatMoney(stmt.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              {stmt.date || 'No date'}
                              {stmt.description ? ` · ${stmt.description}` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="shrink-0 px-5 py-4 border-t border-border flex justify-between items-center">
          <p className="text-xs text-muted-foreground font-medium">Nothing is saved — this comparison is read-only.</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-card text-white hover:bg-accent/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
