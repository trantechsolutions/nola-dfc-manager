import React, { useState, useMemo } from 'react';
import { Plus, CalendarDays, X } from 'lucide-react';
import Ledger from '../components/Ledger'; 

export default function LedgerView({ transactions, onAddTx, onEditTx, onDeleteTx, formatMoney }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDateRange, setShowDateRange] = useState(false);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (tx.waterfallBatchId) return false;

      if (!startDate && !endDate) return true;

      let txDateStr = '';
      if (tx.date && tx.date.seconds) {
        txDateStr = new Date(tx.date.seconds * 1000).toISOString().split('T')[0];
      } else if (tx.date instanceof Date) {
        txDateStr = tx.date.toISOString().split('T')[0];
      } else if (typeof tx.date === 'string') {
        txDateStr = tx.date.split('T')[0];
      }

      if (!txDateStr) return true;
      if (startDate && txDateStr < startDate) return false;
      if (endDate && txDateStr > endDate) return false;
      return true;
    });
  }, [transactions, startDate, endDate]);

  const filteredTotal = filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const hasDateFilter = startDate || endDate;

  return (
    <div className="space-y-4">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Team Ledger</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 && 's'} 
            {hasDateFilter && <span className="text-blue-500"> (date filtered)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setShowDateRange(!showDateRange)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
              hasDateFilter
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CalendarDays size={14} />
            {hasDateFilter ? 'Date Active' : 'Date Range'}
          </button>
          <button onClick={onAddTx}
            className="flex-1 sm:flex-none bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 flex items-center justify-center gap-1.5 transition-all">
            <Plus size={14} /> Add Transaction
          </button>
        </div>
      </div>

      {/* ── DATE RANGE PANEL ── */}
      {showDateRange && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-end">
          <div className="w-full sm:w-40">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {hasDateFilter && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-2">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Date filter summary */}
      {hasDateFilter && (
        <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex justify-between items-center">
          <span className="text-blue-800 text-xs font-bold">
            {filteredTransactions.length} results in range
          </span>
          <span className={`text-sm font-black ${filteredTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            Net: {formatMoney(filteredTotal)}
          </span>
        </div>
      )}

      {/* ── TABLE ── */}
      <Ledger
        transactions={filteredTransactions} 
        onEditTx={onEditTx} 
        onDeleteTx={onDeleteTx}
        formatMoney={formatMoney} 
      />
    </div>
  );
}
