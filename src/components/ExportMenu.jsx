import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { exportToCSV, exportLedgerPDF, exportPlayerBalancesPDF } from '../utils/exportUtils';

export default function ExportMenu({ transactions, players, calculatePlayerFinancials, formatMoney, seasonInfo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const info = seasonInfo || { name: 'All' };

  const handleLedgerCSV = () => {
    setOpen(false);
    const columns = [
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Title' },
      { key: 'category', label: 'Category' },
      { key: 'playerName', label: 'Player' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
    ];
    const rows = transactions.map((tx) => ({
      date: tx.date ? new Date(tx.date).toLocaleDateString() : '',
      title: tx.title || tx.description || '',
      category: tx.category || '',
      playerName: tx.playerName || '',
      amount: tx.amount || 0,
      status: tx.cleared ? 'Cleared' : 'Pending',
    }));
    exportToCSV(rows, `ledger-${info.name}`, columns);
  };

  const handleLedgerPDF = () => {
    setOpen(false);
    exportLedgerPDF(transactions, info, formatMoney);
  };

  const handleBalancesCSV = () => {
    setOpen(false);
    if (!players || !calculatePlayerFinancials) return;
    const columns = [
      { key: 'name', label: 'Player Name' },
      { key: 'jersey', label: 'Jersey #' },
      { key: 'baseFee', label: 'Base Fee' },
      { key: 'paid', label: 'Paid' },
      { key: 'credits', label: 'Credits' },
      { key: 'remaining', label: 'Remaining Balance' },
    ];
    const rows = players.map((p) => {
      const fin = calculatePlayerFinancials(p);
      return {
        name: `${p.lastName || ''}, ${p.firstName || ''}`.trim(),
        jersey: p.jerseyNumber != null ? p.jerseyNumber : '',
        baseFee: fin.baseFee || 0,
        paid: fin.totalPaid || 0,
        credits: fin.credits || 0,
        remaining: fin.remainingBalance || 0,
      };
    });
    exportToCSV(rows, `player-balances-${info.name}`, columns);
  };

  const handleBalancesPDF = () => {
    setOpen(false);
    if (!players || !calculatePlayerFinancials) return;
    exportPlayerBalancesPDF(players, calculatePlayerFinancials, info, formatMoney);
  };

  const menuItems = [
    { label: 'Ledger CSV', icon: FileSpreadsheet, action: handleLedgerCSV },
    { label: 'Ledger PDF', icon: FileText, action: handleLedgerPDF },
    { label: 'Player Balances CSV', icon: FileSpreadsheet, action: handleBalancesCSV, needsPlayers: true },
    { label: 'Player Balances PDF', icon: FileText, action: handleBalancesPDF, needsPlayers: true },
  ];

  const hasPlayers = players && players.length > 0 && calculatePlayerFinancials;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
      >
        <Download size={14} />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
          {menuItems.map((item) => {
            const disabled = item.needsPlayers && !hasPlayers;
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={disabled ? undefined : item.action}
                disabled={disabled}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                  disabled
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
