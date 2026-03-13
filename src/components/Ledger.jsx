import React, { useState, useMemo } from 'react';
import { 
  Search, Filter, ArrowUpDown, CheckCircle2, Clock, Trash2, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, ArrowRightLeft
} from 'lucide-react';

const CATEGORY_LABELS = {
  TMF: 'Team Fees', SPO: 'Sponsorship', FUN: 'Fundraising', 
  OPE: 'Operating', TOU: 'Tournament', LEA: 'League/Refs', 
  CRE: 'Credit', FRI: 'Friendlies', TRF: 'Transfer'
};

const CATEGORY_COLORS = {
  TMF: 'bg-blue-50 text-blue-700', SPO: 'bg-violet-50 text-violet-700', 
  FUN: 'bg-emerald-50 text-emerald-700', OPE: 'bg-slate-100 text-slate-600', 
  TOU: 'bg-amber-50 text-amber-700', LEA: 'bg-orange-50 text-orange-700', 
  CRE: 'bg-cyan-50 text-cyan-700', FRI: 'bg-rose-50 text-rose-700',
  TRF: 'bg-indigo-50 text-indigo-700'
};

export default function Ledger({ transactions, onEditTx, onDeleteTx, formatMoney }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [flowFilter, setFlowFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(tx => 
        tx.title?.toLowerCase().includes(q) || 
        tx.playerName?.toLowerCase().includes(q) ||
        tx.notes?.toLowerCase().includes(q) ||
        tx.transferFrom?.toLowerCase().includes(q) ||
        tx.transferTo?.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter(tx => tx.category === categoryFilter);
    }

    if (flowFilter === 'income') result = result.filter(tx => tx.amount > 0 && tx.category !== 'TRF');
    if (flowFilter === 'expense') result = result.filter(tx => tx.amount < 0 && tx.category !== 'TRF');
    if (flowFilter === 'transfer') result = result.filter(tx => tx.category === 'TRF');

    if (statusFilter === 'cleared') result = result.filter(tx => tx.cleared);
    if (statusFilter === 'pending') result = result.filter(tx => !tx.cleared);

    result.sort((a, b) => {
      const dateA = a.date?.seconds || 0;
      const dateB = b.date?.seconds || 0;
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [transactions, searchTerm, categoryFilter, flowFilter, statusFilter, sortOrder]);

  const totalIncome = filteredTransactions.filter(tx => tx.amount > 0 && tx.category !== 'TRF').reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = filteredTransactions.filter(tx => tx.amount < 0 && tx.category !== 'TRF').reduce((s, tx) => s + tx.amount, 0);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedTransactions = filteredTransactions.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters = searchTerm || categoryFilter !== 'all' || flowFilter !== 'all' || statusFilter !== 'all';
  const clearAllFilters = () => { setSearchTerm(''); setCategoryFilter('all'); setFlowFilter('all'); setStatusFilter('all'); setCurrentPage(1); };
  const setFilterAndReset = (setter) => (val) => { setter(val); setCurrentPage(1); };

  const TransferBadge = ({ tx }) => (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
      {tx.transferFrom} <ArrowRightLeft size={10} /> {tx.transferTo}
    </span>
  );

  const amountColor = (tx) => {
    if (tx.category === 'TRF') return 'text-indigo-600';
    return tx.amount < 0 ? 'text-red-500' : 'text-emerald-600';
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* ── TOOLBAR ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input type="text" placeholder="Search transactions, players, or notes..."
            value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-300 hover:text-slate-500"><X size={16} /></button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1">
            <Filter size={13} className="text-slate-400" />
            <select value={categoryFilter} onChange={(e) => setFilterAndReset(setCategoryFilter)(e.target.value)}
              className="bg-slate-50 border border-slate-100 text-xs font-bold rounded-lg px-2 py-1.5 focus:ring-0 cursor-pointer">
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {[
              { val: 'all', label: 'All' },
              { val: 'income', label: 'Income' },
              { val: 'expense', label: 'Expense' },
              { val: 'transfer', label: 'Transfers' },
            ].map(opt => (
              <button key={opt.val} onClick={() => setFilterAndReset(setFlowFilter)(opt.val)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  flowFilter === opt.val ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}>{opt.label}</button>
            ))}
          </div>

          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {[
              { val: 'all', label: 'All' },
              { val: 'cleared', label: 'Cleared' },
              { val: 'pending', label: 'Pending' },
            ].map(opt => (
              <button key={opt.val} onClick={() => setFilterAndReset(setStatusFilter)(opt.val)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  statusFilter === opt.val ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}>{opt.label}</button>
            ))}
          </div>

          <button onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-100 hover:bg-slate-100 rounded-lg text-[11px] font-bold transition-colors ml-auto">
            <ArrowUpDown size={12} />
            {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
          </button>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500 font-bold">
              {filteredTransactions.length} result{filteredTransactions.length !== 1 && 's'}
              <span className="text-emerald-600 ml-3">+{formatMoney(totalIncome)}</span>
              <span className="text-red-500 ml-2">{formatMoney(totalExpense)}</span>
            </span>
            <button onClick={clearAllFilters} className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <X size={12} /> Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-5 py-3.5">Date</th>
              <th className="px-5 py-3.5">Transaction</th>
              <th className="px-5 py-3.5">Player</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5 text-right">Amount</th>
              <th className="px-3 py-3.5 text-center w-14"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pagedTransactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-blue-50/30 transition-colors cursor-pointer" onClick={() => onEditTx(tx)}>
                <td className="px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">
                  {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : '—'}
                </td>
                <td className="px-5 py-3">
                  <p className="font-bold text-slate-800 text-sm truncate max-w-[250px]">{tx.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${CATEGORY_COLORS[tx.category] || 'bg-slate-100 text-slate-500'}`}>
                      {CATEGORY_LABELS[tx.category] || tx.category}
                    </span>
                    {tx.category === 'TRF' && tx.transferFrom && tx.transferTo && <TransferBadge tx={tx} />}
                  </div>
                </td>
                <td className="px-5 py-3">
                  {tx.category === 'TRF' ? (
                    <span className="text-[10px] font-black px-2 py-1 bg-indigo-50 text-indigo-500 rounded">Internal</span>
                  ) : tx.playerName ? (
                    <span className="text-[10px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded">{tx.playerName}</span>
                  ) : (
                    <span className="text-[10px] font-black px-2 py-1 bg-slate-100 text-slate-400 rounded">Team</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {tx.cleared ? (
                    <div className="flex items-center gap-1 text-emerald-600 font-bold text-[10px] uppercase"><CheckCircle2 size={12} /> Cleared</div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-500 font-bold text-[10px] uppercase"><Clock size={12} /> Pending</div>
                  )}
                </td>
                <td className={`px-5 py-3 text-right font-black text-sm ${amountColor(tx)}`}>
                  {tx.category === 'TRF' && <ArrowRightLeft size={12} className="inline mr-1 opacity-60" />}
                  {formatMoney(tx.amount)}
                </td>
                <td className="px-3 py-3 text-center">
                  <button onClick={(e) => { e.stopPropagation(); onDeleteTx(tx.id); }}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagedTransactions.length === 0 && (
          <div className="p-16 text-center text-slate-400 font-bold italic">No transactions found.</div>
        )}
      </div>

      {/* ── MOBILE CARDS ── */}
      <div className="md:hidden space-y-2">
        {pagedTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-bold italic bg-white rounded-2xl border border-slate-200">No transactions found.</div>
        ) : (
          pagedTransactions.map(tx => (
            <div key={tx.id} onClick={() => onEditTx(tx)}
              className="bg-white p-4 rounded-xl border border-slate-100 active:bg-blue-50/30 transition-colors cursor-pointer">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-grow">
                  <p className="font-bold text-slate-800 text-sm truncate">{tx.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${CATEGORY_COLORS[tx.category] || 'bg-slate-100 text-slate-500'}`}>
                      {CATEGORY_LABELS[tx.category] || tx.category}
                    </span>
                    {tx.category === 'TRF' && tx.transferFrom && tx.transferTo ? (
                      <TransferBadge tx={tx} />
                    ) : tx.playerName ? (
                      <span className="text-[10px] font-bold text-blue-600">{tx.playerName}</span>
                    ) : null}
                    {tx.cleared ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Clock size={12} className="text-amber-400" />}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-black text-sm ${amountColor(tx)}`}>
                    {tx.category === 'TRF' && <ArrowRightLeft size={11} className="inline mr-0.5 opacity-60" />}
                    {formatMoney(tx.amount)}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── PAGINATION ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-bold hidden sm:block">
            Page {safePage} of {totalPages} ({filteredTransactions.length} items)
          </span>
          <span className="text-xs text-slate-500 font-bold sm:hidden">{safePage}/{totalPages}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={safePage <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronsLeft size={16} className="text-slate-600" />
            </button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={16} className="text-slate-600" />
            </button>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page;
                if (totalPages <= 5) page = i + 1;
                else if (safePage <= 3) page = i + 1;
                else if (safePage >= totalPages - 2) page = totalPages - 4 + i;
                else page = safePage - 2 + i;
                return (
                  <button key={page} onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                      page === safePage ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}>{page}</button>
                );
              })}
            </div>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={16} className="text-slate-600" />
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={safePage >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronsRight size={16} className="text-slate-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}