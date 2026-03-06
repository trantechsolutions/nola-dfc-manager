import React, { useState, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, CheckCircle2, Clock, Trash2 } from 'lucide-react';

export default function Ledger({ transactions, onEditTx, onDeleteTx, formatMoney }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc'); // Newest first

  // Enhanced Filtering and Sorting Logic
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // 1. Search Filter (matches Title or Player Name)
    if (searchTerm) {
      const lowSearch = searchTerm.toLowerCase();
      result = result.filter(tx => 
        tx.title?.toLowerCase().includes(lowSearch) || 
        tx.playerName?.toLowerCase().includes(lowSearch)
      );
    }

    // 2. Category Filter
    if (categoryFilter !== 'all') {
      result = result.filter(tx => tx.category === categoryFilter);
    }

    // 3. Sorting (by Date)
    result.sort((a, b) => {
      const dateA = a.date?.seconds || 0;
      const dateB = b.date?.seconds || 0;
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [transactions, searchTerm, categoryFilter, sortOrder]);

  return (
    <div className="space-y-6 pb-20">
      {/* TOOLBAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
        <div className="relative flex-grow min-w-[200px]">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search transactions or players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-50 border-none text-sm font-bold rounded-xl focus:ring-0 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="TMF">Team Fees</option>
            <option value="SPO">Sponsorships</option>
            <option value="FUN">Fundraising</option>
            <option value="EXP">Expenses</option>
            <option value="CRE">Credits/Discounts</option>
            <option value="TOU">Tournament (Exp)</option>
            <option value="LEA">League/Refs (Exp)</option>
            <option value="OPE">Operating (Exp)</option>
          </select>
        </div>

        <button 
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-sm font-bold transition-colors"
        >
          <ArrowUpDown size={16} />
          {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
        </button>
      </div>

      {/* LEDGER TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Transaction</th>
              <th className="px-6 py-4">Player</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Amount</th>
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredTransactions.map((tx) => (
              <tr 
                key={tx.id} 
                className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                onClick={() => onEditTx(tx)} // Click row to edit
              >
                <td className="px-6 py-4 text-xs font-medium text-slate-500">
                  {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : '---'}
                </td>
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-800 text-sm">{tx.title}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{tx.category}</p>
                </td>
                <td className="px-6 py-4">
                  {tx.playerName ? (
                    <span className="text-[10px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded">
                      {tx.playerName}
                    </span>
                  ) : (
                    <span className="text-[10px] font-black px-2 py-1 bg-slate-100 text-slate-400 rounded">
                      Team
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {tx.cleared ? (
                    <div className="flex items-center gap-1 text-emerald-600 font-bold text-[10px] uppercase">
                      <CheckCircle2 size={12} /> Cleared
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-500 font-bold text-[10px] uppercase">
                      <Clock size={12} /> Pending
                    </div>
                  )}
                </td>
                <td className={`px-6 py-4 text-right font-black ${tx.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {formatMoney(tx.amount)}
                </td>
                <td className="px-4 py-4 text-center">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation(); // Prevents the row click from firing
                      onDeleteTx(tx.id);
                    }}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Transaction"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTransactions.length === 0 && (
          <div className="p-20 text-center text-slate-400 font-bold italic">
            No transactions found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
}