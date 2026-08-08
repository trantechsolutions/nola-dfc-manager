import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Layers, CheckSquare, Square, AlertCircle } from 'lucide-react';
import ResponsiveModal from './layout/ResponsiveModal';
import { useT } from '../i18n/I18nContext';
import { EVENT_TYPES } from '../utils/eventClassifier';
import { getSeasonForDate } from '../utils/seasonUtils';
import { HOLDINGS, HOLDING_LABELS } from '../utils/holdings';
import { EXPENSE_CATEGORIES, getCategoryLabels, getSuggestedExpenses } from '../utils/expenseCategories';

// Line keys only have to be stable across re-renders of one open modal.
let lineSeq = 0;
const makeLine = (accountId = '', preset = {}) => ({
  key: `line-${(lineSeq += 1)}`,
  title: preset.title || '',
  amount: '',
  category: preset.category || 'OPE',
  accountId,
});

/**
 * BulkExpenseModal — the same set of expenses applied to many events at once.
 *
 * The per-event modal is fine for one tournament, but a season of league games
 * means retyping "Referee Fees" twenty times. Here the expense lines are
 * authored once and multiplied across whichever events are ticked, which is why
 * the whole batch goes out as a single insert rather than one save per row.
 *
 * `candidates` are schedule events that exist in the DB (only those can carry an
 * event_id), each { id, title, displayDate, eventDate, eventType, isPast }.
 */
export default function BulkExpenseModal({
  show,
  onClose,
  candidates = [],
  existingByEventId = {},
  onBulkAddExpenses,
  seasonIds = [],
  activeAccounts = [],
}) {
  const { t } = useT();
  const defaultAccountId = activeAccounts[0]?.id || '';

  const [lines, setLines] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [scope, setScope] = useState('upcoming');
  const [typeFilters, setTypeFilters] = useState([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fresh form every time the modal is opened — it stays mounted in between.
  useEffect(() => {
    if (!show) return;
    setLines([makeLine(defaultAccountId)]);
    setSelectedIds([]);
    setScope('upcoming');
    setTypeFilters([]);
    setSkipDuplicates(true);
    setError('');
    // defaultAccountId is only a seed for the first line; re-running on an
    // account list change would wipe a form the user is in the middle of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const CATEGORY_LABELS = getCategoryLabels(t);
  const suggestions = getSuggestedExpenses(t);

  const visibleEvents = useMemo(() => {
    return candidates.filter((c) => {
      if (scope === 'upcoming' && c.isPast) return false;
      if (scope === 'past' && !c.isPast) return false;
      if (typeFilters.length > 0 && !typeFilters.includes(c.eventType)) return false;
      return true;
    });
  }, [candidates, scope, typeFilters]);

  // Selections survive filter changes, so anything counted has to still be
  // visible — otherwise the summary promises rows the user can no longer see.
  const effectiveIds = useMemo(
    () => visibleEvents.filter((c) => selectedIds.includes(c.id)).map((c) => c.id),
    [visibleEvents, selectedIds],
  );

  const validLines = lines.filter((l) => l.title.trim() && parseFloat(l.amount) > 0);

  // The exact rows that would be inserted — also what drives the summary, so
  // the count shown and the count written can't disagree.
  const pendingRows = useMemo(() => {
    const rows = [];
    effectiveIds.forEach((id) => {
      const event = candidates.find((c) => c.id === id);
      if (!event) return;
      const existingTitles = new Set(
        (existingByEventId[id] || []).filter((tx) => tx.category !== 'TRF').map((tx) => tx.title?.toLowerCase()),
      );
      validLines.forEach((line) => {
        if (skipDuplicates && existingTitles.has(line.title.trim().toLowerCase())) return;
        const date = event.eventDate.split('T')[0];
        const detectedSeason = getSeasonForDate(date, seasonIds);
        rows.push({
          title: line.title.trim(),
          amount: -Math.abs(parseFloat(line.amount)),
          date,
          category: line.category,
          accountId: line.accountId || null,
          cleared: false,
          playerId: '',
          eventId: id,
          ...(detectedSeason ? { seasonId: detectedSeason } : {}),
        });
      });
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIds, candidates, existingByEventId, lines, skipDuplicates, seasonIds]);

  const pendingTotal = pendingRows.reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const skippedCount = effectiveIds.length * validLines.length - pendingRows.length;

  if (!show) return null;

  const updateLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));

  const addFromSuggestion = (tmpl) => {
    setLines((prev) => {
      // An untouched first line is a placeholder, not something to preserve.
      const blank = prev.length === 1 && !prev[0].title && !prev[0].amount;
      return blank ? [makeLine(defaultAccountId, tmpl)] : [...prev, makeLine(defaultAccountId, tmpl)];
    });
  };

  const toggleEvent = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleType = (key) =>
    setTypeFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const allVisibleSelected = visibleEvents.length > 0 && effectiveIds.length === visibleEvents.length;
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visible = new Set(visibleEvents.map((c) => c.id));
      setSelectedIds((prev) => prev.filter((id) => !visible.has(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...visibleEvents.map((c) => c.id)])]);
    }
  };

  const handleApply = async () => {
    if (pendingRows.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const result = await onBulkAddExpenses(pendingRows);
      // handleBulkUpload reports failures in-band rather than throwing.
      if (result && result.success === false) {
        setError(result.error);
        return;
      }
      onClose(pendingRows.length);
    } finally {
      setSaving(false);
    }
  };

  const SCOPES = [
    { id: 'upcoming', label: t('bulkExpenses.scopeUpcoming') },
    { id: 'past', label: t('bulkExpenses.scopePast') },
    { id: 'all', label: t('common.all') },
  ];

  return (
    <ResponsiveModal onClose={() => onClose(0)} size="2xl">
      <ResponsiveModal.Header className="items-start border-b border-border">
        <h3 className="font-semibold text-lg leading-tight text-foreground flex items-center gap-2">
          <Layers size={18} className="text-muted-foreground" />
          {t('bulkExpenses.title')}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{t('bulkExpenses.subtitle')}</p>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="p-0">
        {/* ── Expense lines ── */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-xs font-bold text-muted-foreground">{t('bulkExpenses.linesTitle')}</p>

          {lines.map((line) => (
            <div key={line.key} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
              <div className="col-span-2 sm:col-span-4">
                <input
                  type="text"
                  aria-label={t('expenses.description')}
                  placeholder={t('expenses.description')}
                  value={line.title}
                  onChange={(e) => updateLine(line.key, { title: e.target.value })}
                  className="w-full border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  aria-label={t('expenses.amountLabel')}
                  placeholder="0.00"
                  value={line.amount}
                  onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                  className="w-full border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <select
                  aria-label={t('expenses.category')}
                  value={line.category}
                  onChange={(e) => updateLine(line.key, { category: e.target.value })}
                  className="w-full border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] || c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <select
                  aria-label={t('txModal.account')}
                  value={line.accountId || ''}
                  onChange={(e) => updateLine(line.key, { accountId: e.target.value })}
                  className="w-full border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                >
                  <option value="">{t('txModal.noAccount')}</option>
                  {HOLDINGS.filter((h) => h !== 'none' && activeAccounts.some((a) => a.holding === h)).map((h) => (
                    <optgroup key={h} label={HOLDING_LABELS[h]}>
                      {activeAccounts
                        .filter((a) => a.holding === h)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <button
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length === 1}
                  title={t('bulkExpenses.removeLine')}
                  aria-label={t('bulkExpenses.removeLine')}
                  className="p-2 text-muted-foreground hover:text-red-700 dark:hover:text-red-400 transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setLines((prev) => [...prev, makeLine(defaultAccountId)])}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:text-blue-400 hover:bg-blue-100 transition-all"
            >
              <Plus size={11} /> {t('bulkExpenses.addLine')}
            </button>
            <span className="w-px h-4 bg-border mx-1" />
            {suggestions.map((tmpl) => (
              <button
                key={tmpl.title}
                onClick={() => addFromSuggestion(tmpl)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-muted text-foreground hover:bg-muted hover:text-foreground dark:hover:text-white transition-all"
              >
                <Plus size={11} /> {tmpl.title}
              </button>
            ))}
          </div>
        </div>

        {/* ── Event picker ── */}
        <div className="px-6 py-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-bold text-muted-foreground">{t('bulkExpenses.eventsTitle')}</p>
            <button
              onClick={toggleSelectAll}
              disabled={visibleEvents.length === 0}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 disabled:opacity-40"
            >
              {allVisibleSelected ? t('bulkExpenses.clearAll') : t('bulkExpenses.selectAll')}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setScope(s.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    scope === s.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 bg-muted rounded-lg p-0.5">
              {Object.entries(EVENT_TYPES).map(([key, type]) => (
                <button
                  key={key}
                  onClick={() => toggleType(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                    typeFilters.includes(key) ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${type.dot}`} />
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {visibleEvents.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center text-xs font-semibold text-muted-foreground">
              {candidates.length === 0 ? t('bulkExpenses.noSyncedEvents') : t('bulkExpenses.noMatches')}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-lg border border-border divide-y divide-border">
              {visibleEvents.map((c) => {
                const type = EVENT_TYPES[c.eventType] || EVENT_TYPES.event;
                const checked = selectedIds.includes(c.id);
                const existing = (existingByEventId[c.id] || []).filter((tx) => tx.category !== 'TRF').length;
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleEvent(c.id)}
                    role="checkbox"
                    aria-checked={checked}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      checked ? 'bg-blue-50/60 dark:bg-blue-900/20' : 'hover:bg-background'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare size={16} className="shrink-0 text-blue-700 dark:text-blue-400" />
                    ) : (
                      <Square size={16} className="shrink-0 text-muted-foreground" />
                    )}
                    <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${type.colorLight}`}>
                      {type.label}
                    </span>
                    <span className="text-sm font-semibold text-foreground truncate flex-1">{c.title}</span>
                    {existing > 0 && (
                      <span className="text-xs font-semibold text-muted-foreground shrink-0">
                        {t('bulkExpenses.existing', { n: existing })}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-medium shrink-0">{c.displayDate}</span>
                  </button>
                );
              })}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="rounded border-border"
            />
            {t('bulkExpenses.skipDuplicates')}
          </label>

          {error && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>
      </ResponsiveModal.Body>

      <ResponsiveModal.Footer className="justify-between">
        <div className="text-xs font-semibold text-muted-foreground">
          {pendingRows.length > 0 ? (
            <>
              <span className="text-foreground">
                {t('bulkExpenses.summary', {
                  n: pendingRows.length,
                  events: effectiveIds.length,
                  amount: `$${pendingTotal.toFixed(2)}`,
                })}
              </span>
              {skipDuplicates && skippedCount > 0 && (
                <span className="block mt-0.5">{t('bulkExpenses.skipped', { n: skippedCount })}</span>
              )}
            </>
          ) : (
            t('bulkExpenses.nothingToAdd')
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onClose(0)}
            className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={saving || pendingRows.length === 0}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Layers size={12} />
            {saving ? t('bulkExpenses.applying') : t('bulkExpenses.apply')}
          </button>
        </div>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
