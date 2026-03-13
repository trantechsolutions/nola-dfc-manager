import React, { useState, useRef, useCallback } from 'react';
import {
  X, Upload, FileText, AlertCircle, Check, ChevronDown, ChevronUp,
  Download, RefreshCw, Users, Trash2, Edit, AlertTriangle
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';

// ── CSV Template ──
const CSV_TEMPLATE = `First Name,Last Name,Jersey #,Guardian 1 Name,Guardian 1 Email,Guardian 1 Phone,Guardian 2 Name,Guardian 2 Email,Guardian 2 Phone
John,Smith,7,Jane Smith,jane@email.com,555-0101,Bob Smith,bob@email.com,555-0102
Sarah,Johnson,10,Mike Johnson,mike@email.com,555-0201,,,`;

// ── CSV Parser (handles quoted fields, commas inside quotes, newlines) ──
function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);

  return lines.map(line => {
    const fields = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++; }
        else inQ = !inQ;
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

// ── Column mapping presets ──
const COLUMN_KEYS = [
  { key: 'firstName', label: 'First Name', required: true },
  { key: 'lastName', label: 'Last Name', required: true },
  { key: 'jerseyNumber', label: 'Jersey #', required: false },
  { key: 'g1Name', label: 'Guardian 1 Name', required: false },
  { key: 'g1Email', label: 'Guardian 1 Email', required: false },
  { key: 'g1Phone', label: 'Guardian 1 Phone', required: false },
  { key: 'g2Name', label: 'Guardian 2 Name', required: false },
  { key: 'g2Email', label: 'Guardian 2 Email', required: false },
  { key: 'g2Phone', label: 'Guardian 2 Phone', required: false },
];

// ── Auto-detect column mapping from header row ──
function autoMapColumns(headers) {
  const mapping = {};
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const patterns = {
    firstName: ['firstname', 'first', 'fname', 'playerfirst', 'playerfirstname'],
    lastName: ['lastname', 'last', 'lname', 'playerlast', 'playerlastname'],
    jerseyNumber: ['jersey', 'number', 'jerseyno', 'jerseynumber', 'no', 'num'],
    g1Name: ['guardian1name', 'parent1name', 'guardian1', 'parent1', 'guardianname', 'parentname', 'mothername', 'fathername', 'contactname', 'contact1name'],
    g1Email: ['guardian1email', 'parent1email', 'guardianemail', 'parentemail', 'email', 'contact1email', 'contactemail'],
    g1Phone: ['guardian1phone', 'parent1phone', 'guardianphone', 'parentphone', 'phone', 'contact1phone', 'contactphone', 'mobile', 'cell'],
    g2Name: ['guardian2name', 'parent2name', 'guardian2', 'parent2', 'contact2name'],
    g2Email: ['guardian2email', 'parent2email', 'contact2email'],
    g2Phone: ['guardian2phone', 'parent2phone', 'contact2phone'],
  };

  for (const [key, keywords] of Object.entries(patterns)) {
    const idx = lower.findIndex(h => keywords.some(kw => h.includes(kw)));
    if (idx !== -1) mapping[key] = idx;
  }

  return mapping;
}

export default function BulkUploadModal({
  show, onClose, onComplete,
  selectedTeam, club, selectedSeason, currentTeamSeason,
  existingPlayers, showToast,
}) {
  const [step, setStep] = useState('upload'); // upload | mapping | preview | importing | done
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [parsedPlayers, setParsedPlayers] = useState([]);
  const [importResults, setImportResults] = useState({ success: 0, skipped: 0, errors: [] });
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [enrollInSeason, setEnrollInSeason] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  if (!show) return null;

  const reset = () => {
    setStep('upload');
    setRawRows([]);
    setHeaders([]);
    setColumnMap({});
    setParsedPlayers([]);
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

      // Auto-map columns
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
    a.download = 'roster_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Apply Column Mapping → Preview ──
  const handleApplyMapping = () => {
    if (columnMap.firstName === undefined || columnMap.lastName === undefined) {
      showToast('First Name and Last Name columns are required.', true);
      return;
    }

    const dataRows = hasHeaderRow ? rawRows.slice(1) : rawRows;
    const existingNames = new Set(
      (existingPlayers || []).map(p => `${p.firstName?.toLowerCase()}|${p.lastName?.toLowerCase()}`)
    );

    const players = dataRows
      .filter(row => row.some(cell => cell.trim())) // skip empty rows
      .map((row, idx) => {
        const get = (key) => (columnMap[key] !== undefined ? (row[columnMap[key]] || '').trim() : '');

        const firstName = get('firstName');
        const lastName = get('lastName');
        if (!firstName || !lastName) return null;

        const guardians = [];
        const g1Name = get('g1Name');
        if (g1Name) guardians.push({ name: g1Name, email: get('g1Email'), phone: get('g1Phone') });
        const g2Name = get('g2Name');
        if (g2Name) guardians.push({ name: g2Name, email: get('g2Email'), phone: get('g2Phone') });

        const isDuplicate = existingNames.has(`${firstName.toLowerCase()}|${lastName.toLowerCase()}`);

        return {
          _rowIndex: idx,
          _isDuplicate: isDuplicate,
          _include: !isDuplicate || !skipDuplicates,
          firstName,
          lastName,
          jerseyNumber: get('jerseyNumber'),
          guardians,
          status: 'active',
        };
      })
      .filter(Boolean);

    setParsedPlayers(players);
    setStep('preview');
  };

  // ── Toggle include/exclude player from import ──
  const togglePlayer = (rowIndex) => {
    setParsedPlayers(prev => prev.map(p =>
      p._rowIndex === rowIndex ? { ...p, _include: !p._include } : p
    ));
  };

  // ── Run Import ──
  const handleImport = async () => {
    const toImport = parsedPlayers.filter(p => p._include);
    if (toImport.length === 0) {
      showToast('No players selected for import.', true);
      return;
    }

    setStep('importing');
    const results = { success: 0, skipped: 0, errors: [] };

    for (let i = 0; i < toImport.length; i++) {
      const p = toImport[i];
      setProgress(Math.round(((i + 1) / toImport.length) * 100));

      try {
        const playerData = {
          firstName: p.firstName,
          lastName: p.lastName,
          jerseyNumber: p.jerseyNumber || null,
          status: 'active',
          medicalRelease: false,
          reePlayerWaiver: false,
          guardians: p.guardians,
          ...(club?.id ? { clubId: club.id } : {}),
          ...(selectedTeam?.id ? { teamId: selectedTeam.id } : {}),
          seasonProfiles: enrollInSeason && selectedSeason ? {
            [selectedSeason]: {
              feeWaived: false,
              status: 'active',
              ...(currentTeamSeason?.id ? { teamSeasonId: currentTeamSeason.id } : {}),
            }
          } : {},
        };

        await supabaseService.addPlayer(playerData);
        results.success++;
      } catch (err) {
        results.errors.push({ player: `${p.firstName} ${p.lastName}`, error: err.message });
      }
    }

    results.skipped = parsedPlayers.filter(p => !p._include).length;
    setImportResults(results);
    setStep('done');
  };

  const includedCount = parsedPlayers.filter(p => p._include).length;
  const duplicateCount = parsedPlayers.filter(p => p._isDuplicate).length;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* ── Header ── */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Upload size={20} className="text-blue-600" /> Import Roster
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {step === 'upload' && 'Upload a CSV file with player and guardian information.'}
              {step === 'mapping' && 'Map your CSV columns to the correct fields.'}
              {step === 'preview' && `Review ${parsedPlayers.length} players before importing.`}
              {step === 'importing' && 'Importing players...'}
              {step === 'done' && 'Import complete!'}
            </p>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {/* ═══ STEP 1: UPLOAD ═══ */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
              >
                <FileText size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-bold text-slate-600">Click to select a CSV file</p>
                <p className="text-[11px] text-slate-400 mt-1">or drag and drop</p>
                <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFileSelect} className="hidden" />
              </div>

              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Expected Format</p>
                <p className="text-xs text-slate-500">
                  Your CSV should include columns for player first/last name and optionally jersey number and guardian contact info.
                  The importer will attempt to auto-detect your columns.
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
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
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={hasHeaderRow} onChange={e => setHasHeaderRow(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  First row is a header
                </label>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 mb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Sample Data (row 1)</p>
                <div className="flex flex-wrap gap-1">
                  {headers.map((h, i) => (
                    <span key={i} className="text-[10px] font-mono bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-600">
                      {i}: {h}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {COLUMN_KEYS.map(col => (
                  <div key={col.key} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-36 ${col.required ? 'text-slate-800' : 'text-slate-500'}`}>
                      {col.label} {col.required && <span className="text-red-500">*</span>}
                    </span>
                    <select
                      value={columnMap[col.key] ?? ''}
                      onChange={e => {
                        const val = e.target.value;
                        setColumnMap(prev => {
                          const next = { ...prev };
                          if (val === '') delete next[col.key];
                          else next[col.key] = parseInt(val);
                          return next;
                        });
                      }}
                      className="flex-grow text-xs font-bold border border-slate-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— skip —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>Column {i}: {h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={enrollInSeason} onChange={e => setEnrollInSeason(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  Enroll all imported players in {selectedSeason}
                </label>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  Skip players that already exist on this roster (matched by name)
                </label>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: PREVIEW ═══ */}
          {step === 'preview' && (
            <div className="space-y-3">
              {duplicateCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800">{duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} detected</p>
                    <p className="text-[11px] text-amber-600">
                      {skipDuplicates
                        ? 'These players already exist and will be skipped. You can toggle them back on individually.'
                        : 'Duplicate detection is off — all players will be imported.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="text-xs font-bold text-slate-500 flex items-center justify-between">
                <span>{includedCount} of {parsedPlayers.length} players will be imported</span>
                <span className="text-[10px] text-slate-400">{enrollInSeason ? `→ enrolled in ${selectedSeason}` : 'No season enrollment'}</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-[35vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <th className="p-2 text-left w-8"></th>
                        <th className="p-2 text-left">Player</th>
                        <th className="p-2 text-left">Jersey</th>
                        <th className="p-2 text-left">Guardians</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedPlayers.map((p) => (
                        <tr key={p._rowIndex} className={`${!p._include ? 'opacity-40' : ''} hover:bg-slate-50/50`}>
                          <td className="p-2">
                            <input type="checkbox" checked={p._include} onChange={() => togglePlayer(p._rowIndex)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          </td>
                          <td className="p-2 font-bold text-slate-800">{p.firstName} {p.lastName}</td>
                          <td className="p-2 text-slate-500">{p.jerseyNumber || '—'}</td>
                          <td className="p-2 text-slate-500">
                            {p.guardians.length > 0
                              ? p.guardians.map(g => g.name).join(', ')
                              : <span className="text-slate-300 italic">None</span>}
                          </td>
                          <td className="p-2">
                            {p._isDuplicate ? (
                              <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase">Duplicate</span>
                            ) : (
                              <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">New</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 4: IMPORTING ═══ */}
          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <RefreshCw size={32} className="mx-auto text-blue-500 animate-spin" />
              <p className="text-sm font-bold text-slate-600">Importing players...</p>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
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
                <p className="text-lg font-black text-slate-800">Import Complete</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 p-3 rounded-xl text-center">
                  <p className="text-xl font-black text-emerald-700">{importResults.success}</p>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase">Imported</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl text-center">
                  <p className="text-xl font-black text-slate-500">{importResults.skipped}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Skipped</p>
                </div>
                <div className="bg-red-50 p-3 rounded-xl text-center">
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
                        <span className="font-bold">{e.player}:</span> {e.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-between items-center p-5 border-t border-slate-100">
          {step === 'upload' && (
            <>
              <div />
              <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
                Cancel
              </button>
            </>
          )}
          {step === 'mapping' && (
            <>
              <button onClick={() => { setStep('upload'); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
                ← Back
              </button>
              <button onClick={handleApplyMapping}
                className="px-5 py-2 text-sm font-black text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg transition-all">
                Preview Import →
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('mapping')} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
                ← Back
              </button>
              <button onClick={handleImport} disabled={includedCount === 0}
                className="px-5 py-2 text-sm font-black text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-lg disabled:opacity-50 transition-all flex items-center gap-2">
                <Users size={14} /> Import {includedCount} Player{includedCount !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {step === 'importing' && <div className="w-full text-center text-xs text-slate-400">Please wait...</div>}
          {step === 'done' && (
            <>
              <button onClick={() => { reset(); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
                Import More
              </button>
              <button onClick={() => { reset(); onComplete(); }}
                className="px-5 py-2 text-sm font-black text-white bg-slate-900 rounded-xl hover:bg-slate-800 shadow-lg transition-all">
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
