import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  ReceiptText,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

// ── CSV Parser (same as roster BulkUploadModal — handles quoted fields) ──
function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);

  return lines.map((line) => {
    const fields = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field.trim());
    return fields;
  });
}

// ── CSV Template ──
const CSV_TEMPLATE = `Date,Title,Amount,Category,Player,Payment Method,Cleared,Notes
2026-03-01,Spring Team Fees,150.00,TMF,John Smith,Venmo,yes,March payment
2026-03-05,Referee Payment,-125.00,LEA,,Check,yes,Spring league refs
2026-03-10,Car Wash Fundraiser,340.00,FUN,,Cash,yes,Team car wash event`;

// ── Column definitions for ledger transactions ──
const COLUMN_KEYS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'title', label: 'Title / Memo', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'category', label: 'Category', required: true },
  { key: 'player', label: 'Player Name', required: false },
  { key: 'paymentMethod', label: 'Payment Method', required: false },
  { key: 'cleared', label: 'Cleared / Status', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

// ── Auto-detect column mapping from header row ──
function autoMapColumns(headers) {
  const mapping = {};
  const lower = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const patterns = {
    date: ['date', 'transactiondate', 'txndate', 'txdate', 'posted', 'posteddate'],
    title: ['title', 'description', 'desc', 'memo', 'detail', 'details', 'name', 'transactionname'],
    amount: ['amount', 'amt', 'total', 'sum', 'value', 'price', 'cost'],
    category: ['category', 'cat', 'type', 'categorycode', 'catcode', 'class', 'fund'],
    player: ['player', 'playername', 'member', 'membername', 'student', 'studentname', 'child'],
    paymentMethod: ['paymentmethod', 'payment', 'method', 'paymethod', 'paytype', 'paidvia', 'source'],
    cleared: ['cleared', 'status', 'confirmed', 'received', 'paid', 'processed'],
    notes: ['notes', 'note', 'comment', 'comments', 'remarks', 'memo2'],
  };

  for (const [key, keywords] of Object.entries(patterns)) {
    const idx = lower.findIndex((h) => keywords.some((kw) => h.includes(kw)));
    if (idx !== -1) mapping[key] = idx;
  }

  return mapping;
}

// ── Payment method options ──
const PAYMENT_METHODS = ['Venmo', 'Zelle', 'Cash', 'Check', 'ACH', 'Zeffy'];

export default function BulkUploadLedgerModal({
  show,
  onClose,
  onComplete,
  players,
  categoryLabels,
  categoryColors,
  selectedSeason,
  teamSeasonId,
  onBulkSave,
  showToast,
}) {
  const [step, setStep] = useState('upload'); // upload | mapping | preview | importing | done
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [parsedTxns, setParsedTxns] = useState([]);
  const [importResults, setImportResults] = useState({ success: 0, skipped: 0, errors: [] });
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  if (!show) return null;

  const allCategoryCodes = Object.keys(categoryLabels || {});

  const reset = () => {
    setStep('upload');
    setRawRows([]);
    setHeaders([]);
    setColumnMap({});
    setParsedTxns([]);
    setImportResults({ success: 0, skipped: 0, errors: [] });
    setProgress(0);
  };

  // ── File Handler ──
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = parseCSV(text);

      if (rows.length < 2) {
        showToast('CSV file appears empty or has only headers.', true);
        return;
      }

      setHeaders(rows[0]);
      setRawRows(rows);

      const autoMap = autoMapColumns(rows[0]);
      setColumnMap(autoMap);
      setStep('mapping');
    };
    reader.readAsText(file);
  };

  // ── Download Template ──
  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ledger_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Match player name to roster ──
  const findPlayer = (nameStr) => {
    if (!nameStr) return null;
    const q = nameStr.toLowerCase().trim();
    if (!q) return null;
    return (
      (players || []).find((p) => {
        const full = `${p.firstName} ${p.lastName}`.toLowerCase();
        const fullReversed = `${p.lastName} ${p.firstName}`.toLowerCase();
        const last = p.lastName.toLowerCase();
        return full === q || fullReversed === q || last === q;
      }) || null
    );
  };

  // ── Apply Column Mapping → Preview ──
  const handleApplyMapping = () => {
    if (
      columnMap.date === undefined ||
      columnMap.title === undefined ||
      columnMap.amount === undefined ||
      columnMap.category === undefined
    ) {
      showToast('Date, Title, Amount, and Category columns are required.', true);
      return;
    }

    const dataRows = hasHeaderRow ? rawRows.slice(1) : rawRows;

    const txns = dataRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row, idx) => {
        const get = (key) => (columnMap[key] !== undefined ? (row[columnMap[key]] || '').trim() : '');
        const errors = [];

        // Date
        const dateRaw = get('date');
        let dateStr = '';
        if (!dateRaw) {
          errors.push('Missing date');
        } else {
          const d = new Date(dateRaw + 'T12:00:00');
          if (isNaN(d.getTime())) {
            errors.push(`Invalid date "${dateRaw}"`);
          } else {
            dateStr = d.toISOString().split('T')[0];
          }
        }

        // Amount
        const amountRaw = get('amount');
        const amount = parseFloat((amountRaw || '').replace(/[$,]/g, ''));
        if (isNaN(amount) || amount === 0) {
          errors.push(`Invalid amount "${amountRaw}"`);
        }

        // Category
        const catCode = (get('category') || '').toUpperCase();
        if (!catCode) {
          errors.push('Missing category');
        } else if (!allCategoryCodes.includes(catCode)) {
          errors.push(`Unknown category "${catCode}"`);
        }

        // Title
        const title = get('title');
        if (!title) errors.push('Missing title');

        // Player (optional, soft warning)
        const playerRaw = get('player');
        const matchedPlayer = findPlayer(playerRaw);
        const playerWarning = playerRaw && !matchedPlayer ? `Player "${playerRaw}" not found on roster` : '';

        // Payment method
        let payMethod = get('paymentMethod') || 'Venmo';
        if (!PAYMENT_METHODS.map((m) => m.toLowerCase()).includes(payMethod.toLowerCase())) {
          payMethod = 'Venmo'; // fallback to default
        } else {
          payMethod = PAYMENT_METHODS.find((m) => m.toLowerCase() === payMethod.toLowerCase()) || 'Venmo';
        }

        // Cleared
        const clearedRaw = (get('cleared') || '').toLowerCase();
        const cleared = ['yes', 'true', '1', 'y', 'cleared'].includes(clearedRaw);

        return {
          _rowIndex: idx,
          _errors: errors,
          _playerWarning: playerWarning,
          _include: errors.length === 0,
          _hasError: errors.length > 0,
          date: dateStr,
          title,
          amount,
          category: catCode,
          player: playerRaw,
          matchedPlayer,
          type: payMethod,
          cleared,
          notes: get('notes'),
        };
      });

    setParsedTxns(txns);
    setStep('preview');
  };

  // ── Toggle include/exclude ──
  const toggleTxn = (rowIndex) => {
    setParsedTxns((prev) => prev.map((t) => (t._rowIndex === rowIndex ? { ...t, _include: !t._include } : t)));
  };

  // ── Run Import ──
  const handleImport = async () => {
    const toImport = parsedTxns.filter((t) => t._include && !t._hasError);
    if (toImport.length === 0) {
      showToast('No valid transactions selected for import.', true);
      return;
    }

    setStep('importing');
    const results = { success: 0, skipped: 0, errors: [] };

    // Build the transaction array for bulk insert
    const txArray = toImport.map((t) => ({
      title: t.title,
      amount: t.amount,
      date: t.date,
      category: t.category,
      type: t.type,
      playerId: t.matchedPlayer?.id || '',
      playerName: t.matchedPlayer ? `${t.matchedPlayer.firstName} ${t.matchedPlayer.lastName}` : '',
      cleared: t.cleared,
      notes: t.notes || '',
      transferFrom: '',
      transferTo: '',
    }));

    try {
      setProgress(30);
      await onBulkSave(txArray);
      setProgress(100);
      results.success = txArray.length;
    } catch (err) {
      results.errors.push({ transaction: 'Bulk insert', error: err.message });
    }

    results.skipped = parsedTxns.filter((t) => !t._include || t._hasError).length;
    setImportResults(results);
    setStep('done');
  };

  const includedCount = parsedTxns.filter((t) => t._include && !t._hasError).length;
  const errorCount = parsedTxns.filter((t) => t._hasError).length;
  const warningCount = parsedTxns.filter((t) => t._playerWarning && !t._hasError).length;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl dark:shadow-none w-full max-w-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* ── Header ── */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Upload size={20} className="text-emerald-600" /> Import Transactions
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {step === 'upload' && 'Upload a CSV file with transaction data.'}
              {step === 'mapping' && 'Map your CSV columns to the correct fields.'}
              {step === 'preview' && `Review ${parsedTxns.length} transactions before importing.`}
              {step === 'importing' && 'Importing transactions...'}
              {step === 'done' && 'Import complete!'}
            </p>
          </div>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {/* ═══ STEP 1: UPLOAD ═══ */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/20 transition-all"
              >
                <FileText size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Click to select a CSV file</p>
                <p className="text-[11px] text-slate-400 mt-1">or drag and drop</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Expected Format
                </p>
                <p className="text-xs text-slate-500">
                  Your CSV should include columns for <span className="font-bold">Date, Title, Amount,</span> and{' '}
                  <span className="font-bold">Category</span>. Optionally include Player Name, Payment Method, Cleared
                  status, and Notes. The importer will attempt to auto-detect your columns.
                </p>
                {allCategoryCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[10px] font-bold text-slate-400 mr-1">Valid categories:</span>
                    {allCategoryCodes.map((code) => (
                      <span
                        key={code}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${(categoryColors || {})[code] || 'bg-slate-100 text-slate-600'}`}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <Download size={12} /> Download Template
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: COLUMN MAPPING ═══ */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasHeaderRow}
                    onChange={(e) => setHasHeaderRow(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  First row is a header
                </label>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 mb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Sample Data (row 1)</p>
                <div className="flex flex-wrap gap-1">
                  {headers.map((h, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-slate-600 dark:text-slate-300"
                    >
                      {i}: {h}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {COLUMN_KEYS.map((col) => (
                  <div key={col.key} className="flex items-center gap-3">
                    <span
                      className={`text-xs font-bold w-36 ${col.required ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      {col.label} {col.required && <span className="text-red-500">*</span>}
                    </span>
                    <select
                      value={columnMap[col.key] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setColumnMap((prev) => {
                          const next = { ...prev };
                          if (val === '') delete next[col.key];
                          else next[col.key] = parseInt(val);
                          return next;
                        });
                      }}
                      className="flex-grow text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-lg p-2 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">— skip —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          Column {i}: {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ STEP 3: PREVIEW ═══ */}
          {step === 'preview' && (
            <div className="space-y-3">
              {errorCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-800">
                      {errorCount} row{errorCount > 1 ? 's' : ''} with errors
                    </p>
                    <p className="text-[11px] text-red-600">
                      These rows have validation issues and will be skipped unless corrected in your CSV.
                    </p>
                  </div>
                </div>
              )}

              {warningCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800">
                      {warningCount} player name{warningCount > 1 ? 's' : ''} not matched
                    </p>
                    <p className="text-[11px] text-amber-600">
                      These transactions will import without a player link. You can assign players later.
                    </p>
                  </div>
                </div>
              )}

              <div className="text-xs font-bold text-slate-500 flex items-center justify-between">
                <span>
                  {includedCount} of {parsedTxns.length} transactions will be imported
                </span>
                <span className="text-[10px] text-slate-400">→ {selectedSeason}</span>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="max-h-[35vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                      <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <th className="p-2 text-left w-8"></th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Title</th>
                        <th className="p-2 text-right">Amount</th>
                        <th className="p-2 text-left">Category</th>
                        <th className="p-2 text-left">Player</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {parsedTxns.map((t) => (
                        <tr
                          key={t._rowIndex}
                          className={`${!t._include || t._hasError ? 'opacity-40' : ''} hover:bg-slate-50/50 dark:hover:bg-slate-800/50`}
                        >
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={t._include && !t._hasError}
                              disabled={t._hasError}
                              onChange={() => toggleTxn(t._rowIndex)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="p-2 text-slate-600 whitespace-nowrap">{t.date || '—'}</td>
                          <td className="p-2 font-bold text-slate-800 dark:text-white max-w-[180px] truncate">
                            {t.title || '—'}
                          </td>
                          <td
                            className={`p-2 text-right font-black whitespace-nowrap ${t.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}
                          >
                            {t.amount < 0 ? '-' : ''}${Math.abs(t.amount || 0).toFixed(2)}
                          </td>
                          <td className="p-2">
                            {t.category ? (
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${(categoryColors || {})[t.category] || 'bg-slate-100 text-slate-600'}`}
                              >
                                {t.category}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-2 text-slate-500">
                            {t.matchedPlayer ? (
                              <span className="text-emerald-600 font-bold text-[10px]">
                                {t.matchedPlayer.firstName} {t.matchedPlayer.lastName}
                              </span>
                            ) : t.player ? (
                              <span className="text-amber-500 font-bold text-[10px]" title={t._playerWarning}>
                                {t.player} ⚠
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="p-2">
                            {t._hasError ? (
                              <span
                                className="text-[9px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase"
                                title={t._errors.join(', ')}
                              >
                                Error
                              </span>
                            ) : (
                              <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">
                                Valid
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Show error details */}
              {errorCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-[10px] font-black text-red-600 uppercase mb-2">Row Errors</p>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {parsedTxns
                      .filter((t) => t._hasError)
                      .map((t) => (
                        <p key={t._rowIndex} className="text-[11px] text-red-700">
                          <span className="font-bold">Row {t._rowIndex + (hasHeaderRow ? 2 : 1)}:</span>{' '}
                          {t._errors.join('; ')}
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 4: IMPORTING ═══ */}
          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <RefreshCw size={32} className="mx-auto text-emerald-500 animate-spin" />
              <p className="text-sm font-bold text-slate-600">Importing transactions...</p>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">{progress}% complete</p>
            </div>
          )}

          {/* ═══ STEP 5: DONE ═══ */}
          {step === 'done' && (
            <div className="py-6 space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check size={32} className="text-emerald-600" />
                </div>
                <p className="text-lg font-black text-slate-800 dark:text-white">Import Complete</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl text-center">
                  <p className="text-xl font-black text-emerald-700">{importResults.success}</p>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase">Imported</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-center">
                  <p className="text-xl font-black text-slate-500">{importResults.skipped}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Skipped</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/30 p-3 rounded-xl text-center">
                  <p className="text-xl font-black text-red-600">{importResults.errors.length}</p>
                  <p className="text-[10px] font-bold text-red-500 uppercase">Errors</p>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-[10px] font-black text-red-600 uppercase mb-2">Errors</p>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {importResults.errors.map((e, i) => (
                      <p key={i} className="text-[11px] text-red-700">
                        <span className="font-bold">{e.transaction}:</span> {e.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-between items-center p-5 border-t border-slate-100 dark:border-slate-700">
          {step === 'upload' && (
            <>
              <div />
              <button
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="px-4 py-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          {step === 'mapping' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleApplyMapping}
                className="px-5 py-2 text-sm font-black text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-lg dark:shadow-none transition-all"
              >
                Preview Import →
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('mapping')}
                className="px-4 py-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleImport}
                disabled={includedCount === 0}
                className="px-5 py-2 text-sm font-black text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
              >
                <ReceiptText size={14} /> Import {includedCount} Transaction{includedCount !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {step === 'importing' && <div className="w-full text-center text-xs text-slate-400">Please wait...</div>}
          {step === 'done' && (
            <>
              <button
                onClick={reset}
                className="px-4 py-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Import More
              </button>
              <button
                onClick={() => {
                  reset();
                  onComplete();
                }}
                className="px-5 py-2 text-sm font-black text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-200 shadow-lg dark:shadow-none transition-all"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
