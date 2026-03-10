import React, { useState, useMemo } from 'react';
import { 
  TrendingDown, Users, DollarSign, Activity, Archive, Edit,
  Search, Shield, ShieldCheck, ShieldX, ChevronRight, Wallet, AlertCircle
} from 'lucide-react';

// ── Jersey SVG Component ──
const JerseyBadge = ({ number, size = 40, className = '', color = 'slate' }) => {
  const colors = {
    slate:   { fill: '#0f172a', stroke: '#1e293b', text: '#ffffff' },
    blue:    { fill: '#2563eb', stroke: '#1d4ed8', text: '#ffffff' },
    red:     { fill: '#dc2626', stroke: '#b91c1c', text: '#ffffff' },
    amber:   { fill: '#f59e0b', stroke: '#d97706', text: '#ffffff' },
    emerald: { fill: '#059669', stroke: '#047857', text: '#ffffff' },
  };
  const c = colors[color] || colors.slate;

  return (
    <div className={`shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
        <path d="M8 12L4 8L10 4L15 2H25L30 4L36 8L32 12V40H8V12Z" fill={c.fill} stroke={c.stroke} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 12L4 8L2 14L6 16L8 12Z" fill={c.fill} stroke={c.stroke} strokeWidth="1" strokeLinejoin="round" />
        <path d="M32 12L36 8L38 14L34 16L32 12Z" fill={c.fill} stroke={c.stroke} strokeWidth="1" strokeLinejoin="round" />
        <path d="M15 2C15 2 17 6 20 6C23 6 25 2 25 2" stroke={c.stroke} strokeWidth="1.5" fill="none" />
        <text x="20" y="29" textAnchor="middle" fill={c.text} fontSize={String(number).length > 2 ? '10' : '13'} fontWeight="900" fontFamily="system-ui, sans-serif">
          {number ?? '?'}
        </text>
      </svg>
    </div>
  );
};

export default function Dashboard({ 
  players, 
  archivedPlayers = [],
  teamBalance, 
  totalExpenses = 0, 
  formatMoney, 
  onAddPlayer, 
  onEditPlayer,
  onViewPlayer, 
  selectedSeasonData,
  transactions = [],
  calculatePlayerFinancials,
}) {
  const [viewArchived, setViewArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const projectedSpend = selectedSeasonData?.totalProjectedExpenses || 0;
  const isFinalized = selectedSeasonData?.isFinalized;
  const baseFee = selectedSeasonData?.calculatedBaseFee || 0;
  const spendPercentage = projectedSpend > 0 ? (totalExpenses / projectedSpend) * 100 : 0;
  const remainingBudget = projectedSpend - totalExpenses;

  // Player financials
  const playerFinancials = useMemo(() => {
    if (!calculatePlayerFinancials) return {};
    const map = {};
    players.forEach(p => { map[p.id] = calculatePlayerFinancials(p, transactions); });
    return map;
  }, [players, transactions, calculatePlayerFinancials]);

  // Outstanding fees
  const outstandingPlayers = useMemo(() => {
    return players
      .map(p => ({ ...p, fin: playerFinancials[p.id] }))
      .filter(p => p.fin && p.fin.remainingBalance > 0 && !p.fin.isWaived)
      .sort((a, b) => b.fin.remainingBalance - a.fin.remainingBalance);
  }, [players, playerFinancials]);

  const totalOutstanding = useMemo(() => outstandingPlayers.reduce((s, p) => s + p.fin.remainingBalance, 0), [outstandingPlayers]);

  // Compliance
  const complianceStats = useMemo(() => {
    const total = players.length;
    const medical = players.filter(p => p.medicalRelease).length;
    const reeplayer = players.filter(p => p.reePlayerWaiver).length;
    const waived = players.filter(p => p.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived).length;
    return { total, medical, reeplayer, waived, fullyCompliant: players.filter(p => p.medicalRelease && p.reePlayerWaiver).length };
  }, [players, selectedSeasonData]);

  const displayedPlayers = viewArchived ? archivedPlayers : players;
  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return displayedPlayers;
    const q = searchTerm.toLowerCase();
    return displayedPlayers.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || String(p.jerseyNumber).includes(q));
  }, [displayedPlayers, searchTerm]);

  return (
    <div className="space-y-6 pb-20 md:pb-6">

      {/* ── DRAFT BUDGET NOTICE (dynamic — updates on every saved draft) ── */}
      {!isFinalized && baseFee > 0 && (() => {
        const projExpenses = selectedSeasonData?.totalProjectedExpenses || 0;
        const projIncome = selectedSeasonData?.totalProjectedIncome || 0;
        const rosterCount = selectedSeasonData?.expectedRosterSize || 0;
        const buffer = selectedSeasonData?.bufferPercent ?? 0;
        const gap = projExpenses - projIncome;
        return (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 border-dashed rounded-2xl p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-xl shrink-0 mt-0.5">
                <AlertCircle size={18} className="text-amber-600" />
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-amber-800">Budget is in Draft</p>
                  <span className="text-[9px] font-black bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                    Not Finalized
                  </span>
                </div>
                <p className="text-xs text-amber-700 mt-1.5 leading-relaxed">
                  Estimated season fee: <span className="font-black text-amber-900">{formatMoney(baseFee)}</span>
                  {rosterCount > 0 && (
                    <span className="text-amber-600"> · {rosterCount} player{rosterCount !== 1 && 's'}</span>
                  )}
                  {buffer > 0 && (
                    <span className="text-amber-600"> · {buffer}% buffer</span>
                  )}
                </p>
                {projExpenses > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] font-bold">
                    <span className="text-red-600">Projected Spend: {formatMoney(projExpenses)}</span>
                    {projIncome > 0 && (
                      <span className="text-emerald-600">Projected Income: {formatMoney(projIncome)}</span>
                    )}
                    {gap > 0 && (
                      <span className="text-amber-700">Gap: {formatMoney(gap)}</span>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-amber-500 mt-2">
                  Fees and balances will change as the budget is revised. Fund distributions are disabled until finalization.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Available Cash */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white p-4 md:p-5 rounded-2xl shadow-lg shadow-emerald-200/50">
          <div className="flex items-center justify-between mb-3">
            <DollarSign size={18} className="opacity-70" />
            {!isFinalized && <span className="text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded">Draft</span>}
          </div>
          <p className="text-xl md:text-2xl font-black tracking-tight">{formatMoney(teamBalance)}</p>
          <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest mt-1">Available Cash</p>
        </div>

        {/* Remaining Budget */}
        <div className={`p-4 md:p-5 rounded-2xl shadow-lg ${!isFinalized ? 'border-dashed ' : ''}${remainingBudget < 0 ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-200/50' : 'bg-white border border-slate-200 shadow-slate-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <TrendingDown size={18} className={remainingBudget < 0 ? 'text-white/70' : 'text-slate-400'} />
            {!isFinalized && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${remainingBudget < 0 ? 'bg-white/20' : 'bg-amber-100 text-amber-600'}`}>Draft</span>}
          </div>
          <p className={`text-xl md:text-2xl font-black tracking-tight ${remainingBudget < 0 ? '' : 'text-slate-900'}`}>{formatMoney(remainingBudget)}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${remainingBudget < 0 ? 'text-red-200' : 'text-slate-400'}`}>Remaining Budget{!isFinalized ? ' (Est.)' : ''}</p>
        </div>

        {/* Active Players */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-lg shadow-slate-100">
          <div className="flex items-center justify-between mb-3"><Users size={18} className="text-slate-400" /></div>
          <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{players.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Active Players</p>
        </div>

        {/* Season Fee */}
        <div className={`bg-white p-4 md:p-5 rounded-2xl border shadow-lg shadow-slate-100 ${!isFinalized && baseFee > 0 ? 'border-dashed border-amber-200' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <Wallet size={18} className="text-slate-400" />
            {!isFinalized && baseFee > 0 && <span className="text-[8px] font-black bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase">Estimated</span>}
            {isFinalized && <span className="text-[8px] font-black bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded uppercase">Locked</span>}
          </div>
          <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{formatMoney(baseFee)}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Season Fee</p>
          {!isFinalized && baseFee > 0 && (
            <p className="text-[9px] font-bold text-amber-500 mt-0.5">May change until finalized</p>
          )}
        </div>
      </div>

      {/* ── OUTSTANDING FEES CALLOUT ── */}
      {outstandingPlayers.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-red-800 text-sm flex items-center gap-2">
              <AlertCircle size={16} className="text-red-500" /> Outstanding Fees
            </h3>
            <span className="text-lg font-black text-red-600">{formatMoney(totalOutstanding)}</span>
          </div>
          <p className="text-[10px] font-bold text-red-600/70 mb-3">
            {outstandingPlayers.length} player{outstandingPlayers.length !== 1 && 's'} with unpaid balances
          </p>
          <div className="space-y-1.5">
            {outstandingPlayers.map(p => {
              const pct = p.fin.baseFee > 0 ? Math.round(((p.fin.baseFee - p.fin.remainingBalance) / p.fin.baseFee) * 100) : 0;
              return (
                <div key={p.id} className="flex items-center gap-3 bg-white/70 rounded-xl p-2.5 backdrop-blur-sm">
                  <JerseyBadge number={p.jerseyNumber} size={32} color="red" />
                  <div className="flex-grow min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{p.firstName} {p.lastName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-grow h-1.5 bg-red-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 shrink-0">{pct}%</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-red-600">{formatMoney(p.fin.remainingBalance)}</p>
                    <p className="text-[9px] text-slate-400">of {formatMoney(p.fin.baseFee)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── BUDGET PROGRESS + COMPLIANCE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <Activity size={16} className="text-blue-600"/> Budget Burn Rate
            </h3>
            <div className="flex items-center gap-1">
              <span className={`text-xs font-black px-2 py-1 rounded-lg ${spendPercentage > 90 ? 'bg-red-50 text-red-600' : spendPercentage > 60 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {Math.round(spendPercentage)}%
              </span>
              {!isFinalized && (
                <span className="text-[8px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded ml-1">DRAFT</span>
              )}
            </div>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${spendPercentage > 90 ? 'bg-red-500' : spendPercentage > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, spendPercentage)}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400">
            <span>Spent: {formatMoney(totalExpenses)}</span>
            <span>Budget: {formatMoney(projectedSpend)}</span>
          </div>
        </div>

        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4">
            <Shield size={16} className="text-violet-600" /> Compliance
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-black text-slate-900">{complianceStats.fullyCompliant}</p>
              <p className="text-[10px] font-bold text-emerald-600">Compliant</p>
            </div>
            <div>
              <p className="text-xl font-black text-slate-900">{complianceStats.medical}</p>
              <p className="text-[10px] font-bold text-slate-400">Medical</p>
            </div>
            <div>
              <p className="text-xl font-black text-slate-900">{complianceStats.reeplayer}</p>
              <p className="text-[10px] font-bold text-slate-400">ReePlayer</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROSTER ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-black text-slate-800 text-sm">
              {viewArchived ? `Archived (${archivedPlayers.length})` : `Roster (${players.length})`}
            </h3>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button onClick={() => setViewArchived(!viewArchived)} className="text-slate-500 hover:text-slate-800 px-3 py-2 text-xs font-bold flex items-center gap-1 transition-all rounded-lg hover:bg-slate-50">
                <Archive size={14} /> {viewArchived ? 'Active' : 'Archived'}
              </button>
              <button onClick={onAddPlayer} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all">Add Player</button>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
            <input type="text" placeholder="Search by name or jersey number..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 md:p-6">
          {filteredPlayers.length === 0 ? (
            <div className="col-span-full py-10 text-center text-slate-400 font-bold italic border-2 border-dashed border-slate-100 rounded-2xl">
              {searchTerm ? 'No players match your search.' : 'No players found.'}
            </div>
          ) : (
            filteredPlayers.map(player => {
              const isWaived = player.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived;
              const hasMedical = player.medicalRelease;
              const hasReeplayer = player.reePlayerWaiver;
              const isFullyCompliant = hasMedical && hasReeplayer;
              const fin = playerFinancials[player.id];
              const hasBalance = fin && fin.remainingBalance > 0 && !isWaived;
              const paidPct = fin && fin.baseFee > 0 ? Math.round(((fin.baseFee - fin.remainingBalance) / fin.baseFee) * 100) : 100;
              const jerseyColor = viewArchived ? 'slate' : hasBalance ? 'amber' : 'slate';

              return (
                <div key={player.id} onClick={() => onViewPlayer(player)}
                  className={`group p-4 rounded-xl border cursor-pointer transition-all ${
                    viewArchived ? 'bg-slate-50 border-slate-200 opacity-60' 
                    : hasBalance ? 'border-amber-200 hover:border-amber-400 hover:shadow-md bg-amber-50/30 active:scale-[0.98]'
                    : 'border-slate-100 hover:border-blue-300 hover:shadow-md bg-white active:scale-[0.98]'
                  }`}>
                  <div className="flex items-center gap-3">
                    <JerseyBadge number={player.jerseyNumber} size={40} color={jerseyColor} className="group-hover:scale-105 transition-transform" />
                    
                    <div className="flex-grow min-w-0">
                      <p className="font-black text-slate-900 text-sm truncate">{player.firstName} {player.lastName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {isWaived && <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase">Waived</span>}
                        {isFullyCompliant ? <ShieldCheck size={13} className="text-emerald-500" /> : <ShieldX size={13} className="text-red-400" />}
                        {hasBalance && (
                          <span className="text-[9px] font-black text-red-500">
                            owes {formatMoney(fin.remainingBalance)}
                          </span>
                        )}
                        {fin && fin.remainingBalance <= 0 && !isWaived && (
                          <span className="text-[9px] font-bold text-emerald-500">Paid</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); onEditPlayer(player); }} 
                        className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                        <Edit size={14} />
                      </button>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </div>

                  {hasBalance && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex-grow h-1 bg-red-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400">{paidPct}%</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}