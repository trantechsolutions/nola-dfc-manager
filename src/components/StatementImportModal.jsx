import React, { useState, useCallback, useMemo } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  Calendar,
} from 'lucide-react';
import { parseStatementCSV, compareStatement } from '../utils/parseStatement';
import { monthKeyToLabel } from '../utils/computeBookBalance';

const FILTER_MODES = [
  { id: 'month', label: 'This month' },
  { id: 'range', label: 'Date range' },
  { id: 'season', label: 'Entire season' },
];

/** Single row in a statement-only or app-only list. Amount is primary. */
function StmtRow({ row, borderClass, bgClass, formatMoney }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 gap-3 ${borderClass} ${bgClass}`}>
      <div className="min-w-0">
        <p className="text-sm font-black tabular-nums text-slate-800 dark:text-white">{formatMoney(row.amount)}</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight mt-0.5">
          {row.date || 'No date'}
          {row.description ? (
            <span className="ml-1 text-slate-400 dark:text-slate-500">· {row.description}</span>
          ) : null}
        </p>
      </div>
      <span
        className={`text-[10px] font-black tabular-nums shrink-0 px-2 py-0.5 rounded-lg ${
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
      const stmtRows = parseStatementCSV(csvText);
      if (stmtRows.length === 0) return { error: 'No rows found — check the CSV format.' };
      const comparison = compareStatement(stmtRows, accountTransactions, monthKey);
      const dated = stmtRows.filter((r) => r.date);
      comparison.stmtDateMin = dated.length ? dated.reduce((m, r) => (r.date < m ? r.date : m), dated[0].date) : null;
      comparison.stmtDateMax = dated.length ? dated.reduce((m, r) => (r.date > m ? r.date : m), dated[0].date) : null;
      comparison.totalStmtRows = stmtRows.length;
      return comparison;
    } catch (e) {
      return { error: `Parse error: ${e.message}` };
    }
  }, [csvText, accountTransactions, monthKey]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setCsvText(e.target.result || '');
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile],
  );

  function reset() {
    setCsvText('');
    setFileName('');
    setShowMatched(false);
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

  if (!show) return null;

  const hasResult = result && !result.error;
  const netUnmatched = hasResult
    ? result.statementOnly.reduce((s, r) => s + r.amount, 0) - result.appOnly.reduce((s, r) => s + r.amount, 0)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Statement import for ${account?.name}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Statement Comparison
            </p>
            <h2 className="text-base font-black text-slate-900 dark:text-white leading-tight">
              {account?.name}
              {hasResult && result.stmtDateMin && result.stmtDateMax
                ? ` — ${result.stmtDateMin} → ${result.stmtDateMax}`
                : ` — ${filterLabel}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* ── APP TRANSACTION FILTER MODE ── */}
          <div>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Calendar size={11} aria-hidden="true" />
              Compare app transactions from
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {FILTER_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setFilterMode(mode.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    filterMode === mode.id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Date range inputs */}
            {filterMode === 'range' && (
              <div className="mt-3 flex gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    From
                  </label>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    To
                  </label>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* Season info chip */}
            {filterMode === 'season' && (
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                All {allAccountTransactions.length} transactions for this account will be included.
              </p>
            )}

            {/* Month info chip */}
            {filterMode === 'month' && (
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
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
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                dragOver
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Upload size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">
                Drop a CSV statement here, or click to browse
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                Accepts any CSV with a date and amount column — description is optional. Works with Chase, Venmo,
                PayPal, and most bank exports.
              </p>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors">
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
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                Or paste CSV text directly
              </p>
              <textarea
                rows={5}
                placeholder={
                  'Date,Amount\n2025-03-01,250.00\n2025-03-15,-75.00\n\nAlso works with Description column:\nDate,Description,Amount\n2025-03-01,Team Fees,250.00'
                }
                className="w-full text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white resize-y placeholder:text-slate-300 dark:placeholder:text-slate-600"
                onBlur={(e) => {
                  if (e.target.value.trim()) setCsvText(e.target.value);
                }}
              />
            </div>
          )}

          {/* ── LOADED FILE HEADER ── */}
          {csvText && !hasResult && !result?.error && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-blue-500" />
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{fileName || 'Pasted CSV'}</span>
              </div>
              <button
                onClick={reset}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800"
              >
                Change
              </button>
            </div>
          )}

          {/* ── PARSE ERROR ── */}
          {result?.error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
              <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-700 dark:text-red-300">{result.error}</p>
                <button onClick={reset} className="text-xs text-red-500 hover:text-red-700 mt-1 font-semibold">
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {hasResult && (
            <>
              {/* File loaded banner */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText size={13} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    {fileName || 'Pasted CSV'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    · {result.totalStmtRows ?? result.matched.length + result.statementOnly.length} statement rows
                  </span>
                </div>
                <button
                  onClick={reset}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Change
                </button>
              </div>

              {/* Summary chips */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {result.matched.length}
                  </p>
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Matched</p>
                </div>
                <div
                  className={`border rounded-xl p-3 text-center ${
                    result.statementOnly.length > 0
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <p
                    className={`text-xl font-black tabular-nums ${
                      result.statementOnly.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'
                    }`}
                  >
                    {result.statementOnly.length}
                  </p>
                  <p
                    className={`text-[10px] font-bold mt-0.5 ${
                      result.statementOnly.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    Statement only
                  </p>
                </div>
                <div
                  className={`border rounded-xl p-3 text-center ${
                    result.appOnly.length > 0
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <p
                    className={`text-xl font-black tabular-nums ${
                      result.appOnly.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'
                    }`}
                  >
                    {result.appOnly.length}
                  </p>
                  <p
                    className={`text-[10px] font-bold mt-0.5 ${
                      result.appOnly.length > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400'
                    }`}
                  >
                    App only
                  </p>
                </div>
              </div>

              {/* Net unmatched amount */}
              {(result.statementOnly.length > 0 || result.appOnly.length > 0) && (
                <div className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Unmatched net amount
                  </span>
                  <span
                    className={`text-base font-black tabular-nums ${
                      Math.abs(netUnmatched) < 0.01
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {formatMoney(netUnmatched)}
                  </span>
                </div>
              )}

              {/* ── STATEMENT ONLY (in bank but not in app) ── */}
              {result.statementOnly.length > 0 && (
                <section aria-label="Transactions in statement but not in app">
                  <p className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    In your statement — not logged in the app ({result.statementOnly.length})
                  </p>
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden">
                    {result.statementOnly.map((row, i) => (
                      <StmtRow
                        key={i}
                        row={row}
                        borderClass={i > 0 ? 'border-t border-amber-100 dark:border-amber-900' : ''}
                        bgClass="bg-amber-50/50 dark:bg-amber-950/20"
                        formatMoney={formatMoney}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── APP ONLY (logged in app but not on statement) ── */}
              {result.appOnly.length > 0 && (
                <section aria-label="Transactions in app but not in statement">
                  <p className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    Logged in app — not on your statement ({result.appOnly.length})
                  </p>
                  <div className="rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
                    {result.appOnly.map((row, i) => (
                      <StmtRow
                        key={i}
                        row={row}
                        borderClass={i > 0 ? 'border-t border-red-100 dark:border-red-900' : ''}
                        bgClass="bg-red-50/50 dark:bg-red-950/20"
                        formatMoney={formatMoney}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* All clear */}
              {result.statementOnly.length === 0 && result.appOnly.length === 0 && (
                <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-4">
                  <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">All transactions match</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                      Every statement row has a corresponding entry in the app.
                    </p>
                  </div>
                </div>
              )}

              {/* ── MATCHED (collapsible) ── */}
              {result.matched.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowMatched((p) => !p)}
                    aria-expanded={showMatched}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {showMatched ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    Show matched rows ({result.matched.length})
                  </button>
                  {showMatched && (
                    <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      {result.matched.map(({ app, stmt }, i) => (
                        <div
                          key={i}
                          className={`grid grid-cols-2 gap-3 px-4 py-2.5 ${
                            i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                              App
                            </p>
                            <p className="text-sm font-black tabular-nums text-slate-800 dark:text-white">
                              {formatMoney(app.amount)}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {app.date || 'No date'}
                              {app.description ? ` · ${app.description}` : ''}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                              Statement
                            </p>
                            <p className="text-sm font-black tabular-nums text-slate-800 dark:text-white">
                              {formatMoney(stmt.amount)}
                            </p>
                            <p className="text-[10px] text-slate-400">
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
        <div className="shrink-0 px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            Nothing is saved — this comparison is read-only.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-black bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
