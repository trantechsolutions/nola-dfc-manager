import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import Ledger from '../components/Ledger'; 

export default function LedgerView({ transactions, onAddTx, onEditTx, onDeleteTx, formatMoney }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filtering Logic with Safety Checks for Dates
  const filteredTransactions = transactions.filter(tx => {
    // FIX: Hide generated waterfall credits from the general ledger view
    if (tx.waterfallBatchId) return false;

    let matchesStart = true;
    let matchesEnd = true;

    if (startDate || endDate) {
      let txDateStr = '';
      
      // Safely handle Firestore Timestamps, standard JS Dates, or Strings
      if (tx.date && tx.date.seconds) {
        txDateStr = new Date(tx.date.seconds * 1000).toISOString().split('T')[0];
      } else if (tx.date instanceof Date) {
        txDateStr = tx.date.toISOString().split('T')[0];
      } else if (typeof tx.date === 'string') {
        txDateStr = tx.date.split('T')[0];
      }

      if (txDateStr) {
        if (startDate) matchesStart = txDateStr >= startDate;
        if (endDate) matchesEnd = txDateStr <= endDate;
      }
    }

    return matchesStart && matchesEnd;
  });

  const filteredTotal = filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-6">
      
      {/* HEADER WITH ADD BUTTON */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-900">Team Ledger</h2>
        <button 
          onClick={onAddTx}
          className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-800 flex items-center gap-2"
        >
          <Plus size={16} /> Add Transaction
        </button>
      </div>

      {/* DATE FILTERS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:w-40">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">From</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none"
          />
        </div>
        <div className="w-full md:w-40">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">To</label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none"
          />
        </div>
        <button 
          onClick={() => { setStartDate(''); setEndDate(''); }}
          className="text-xs font-bold text-slate-400 hover:text-slate-600 mb-2 px-2"
        >
          Reset Dates
        </button>
      </div>

      {(startDate || endDate) && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex justify-between items-center">
          <span className="text-blue-800 text-sm font-bold">Showing {filteredTransactions.length} filtered results</span>
          <span className={`text-lg font-black ${filteredTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            Net: {formatMoney(filteredTotal)}
          </span>
        </div>
      )}

      {/* THE TABLE */}
      <Ledger
        transactions={filteredTransactions} 
        onEditTx={onEditTx} 
        onDeleteTx={onDeleteTx}
        formatMoney={formatMoney} 
      />
    </div>
  );
}