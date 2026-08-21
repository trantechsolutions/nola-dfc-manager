import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Wallet, X } from 'lucide-react';
import { HOLDINGS, HOLDING_LABELS } from '../utils/holdings';
import { useT } from '../i18n/I18nContext';

/**
 * AccountFilterMenu — multi-select account picker for the ledger toolbar.
 *
 * An empty selection means "all accounts", so the ledger starts unfiltered and
 * a cleared selection never blanks the table. Accounts are grouped by holding
 * and each group header toggles its whole group at once.
 *
 * @param {Object} accountsByHolding  holding -> accounts, already narrowed to
 *                                    accounts with activity in the list
 * @param {Set<string>} selectedIds   currently checked account ids
 * @param {(next: Set<string>) => void} onChange
 */
export default function AccountFilterMenu({ accountsByHolding, selectedIds, onChange }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = useMemo(() => HOLDINGS.filter((h) => accountsByHolding[h]?.length > 0), [accountsByHolding]);
  const allAccounts = useMemo(() => groups.flatMap((h) => accountsByHolding[h]), [groups, accountsByHolding]);

  const toggleAccount = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleHolding = (h) => {
    const ids = accountsByHolding[h].map((a) => a.id);
    const allOn = ids.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
    onChange(next);
  };

  const count = selectedIds.size;
  const label =
    count === 0
      ? t('ledger.allAccounts')
      : count === 1
        ? (allAccounts.find((a) => selectedIds.has(a.id))?.name ?? t('ledger.accountsSelected', { n: 1 }))
        : t('ledger.accountsSelected', { n: count });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`flex items-center gap-1.5 border text-xs font-semibold rounded-lg px-2 py-1.5 transition-colors ${
          count > 0
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300'
            : 'bg-background border-border text-foreground hover:bg-muted'
        }`}
      >
        <Wallet size={13} />
        <span className="max-w-[10rem] truncate">{label}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-60 max-h-80 overflow-y-auto bg-card border border-border rounded-lg shadow-lg p-1">
          {groups.map((h) => {
            const ids = accountsByHolding[h].map((a) => a.id);
            const allOn = ids.every((id) => selectedIds.has(id));
            return (
              <div key={h} className="mb-1 last:mb-0">
                <button
                  type="button"
                  onClick={() => toggleHolding(h)}
                  className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  {HOLDING_LABELS[h]}
                  <span className="text-[10px] font-semibold normal-case tracking-normal text-blue-700 dark:text-blue-400">
                    {allOn ? t('common.clear') : t('common.all')}
                  </span>
                </button>
                {accountsByHolding[h].map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-semibold text-foreground hover:bg-background cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleAccount(a.id)}
                      className="accent-blue-600 cursor-pointer"
                    />
                    <span className="truncate">{a.name}</span>
                  </label>
                ))}
              </div>
            );
          })}

          {count > 0 && (
            <div className="border-t border-border mt-1 pt-1">
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-background"
              >
                <X size={12} /> {t('ledger.clearAccounts')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
