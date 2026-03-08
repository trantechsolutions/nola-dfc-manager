import React, { useState, useMemo } from 'react';
import { 
  TrendingDown, Users, DollarSign, Activity, Archive, Edit,
  Search, Shield, ShieldCheck, ShieldX, ChevronRight, Wallet
} from 'lucide-react';

export default function Dashboard({ 
  players, 
  archivedPlayers = [],
  teamBalance, 
  totalExpenses = 0, 
  formatMoney, 
  onAddPlayer, 
  onEditPlayer,
  onViewPlayer, 
  selectedSeasonData 
}) {
  const [viewArchived, setViewArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const projectedSpend = selectedSeasonData?.totalProjectedExpenses || 0;
  const isFinalized = selectedSeasonData?.isFinalized;
  const baseFee = selectedSeasonData?.calculatedBaseFee || 0;
  
  const spendPercentage = projectedSpend > 0 ? (totalExpenses / projectedSpend) * 100 : 0;
  const remainingBudget = projectedSpend - totalExpenses;

  // Compliance stats
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
    return displayedPlayers.filter(p => 
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      String(p.jerseyNumber).includes(q)
    );
  }, [displayedPlayers, searchTerm]);

  return (
    <div className="space-y-6 pb-20 md:pb-6">
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
        <div className={`p-4 md:p-5 rounded-2xl shadow-lg ${remainingBudget < 0 ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-200/50' : 'bg-white border border-slate-200 shadow-slate-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <TrendingDown size={18} className={remainingBudget < 0 ? 'text-white/70' : 'text-slate-400'} />
          </div>
          <p className={`text-xl md:text-2xl font-black tracking-tight ${remainingBudget < 0 ? '' : 'text-slate-900'}`}>{formatMoney(remainingBudget)}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${remainingBudget < 0 ? 'text-red-200' : 'text-slate-400'}`}>Remaining Budget</p>
        </div>

        {/* Roster Size */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-lg shadow-slate-100">
          <div className="flex items-center justify-between mb-3">
            <Users size={18} className="text-slate-400" />
          </div>
          <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{players.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Active Players</p>
        </div>

        {/* Base Fee */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-lg shadow-slate-100">
          <div className="flex items-center justify-between mb-3">
            <Wallet size={18} className="text-slate-400" />
          </div>
          <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{formatMoney(baseFee)}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Season Fee</p>
        </div>
      </div>

      {/* ── BUDGET PROGRESS + COMPLIANCE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Budget Progress */}
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <Activity size={16} className="text-blue-600"/> Budget Burn Rate
            </h3>
            <span className={`text-xs font-black px-2 py-1 rounded-lg ${spendPercentage > 90 ? 'bg-red-50 text-red-600' : spendPercentage > 60 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {Math.round(spendPercentage)}% spent
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${spendPercentage > 90 ? 'bg-red-500' : spendPercentage > 60 ? 'bg-amber-500' : 'bg-blue-500'}`} 
              style={{ width: `${Math.min(spendPercentage, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-3 text-xs text-slate-400 font-bold">
            <span>Spent: {formatMoney(totalExpenses)}</span>
            <span>Projected: {formatMoney(projectedSpend)}</span>
          </div>
        </div>

        {/* Compliance Overview */}
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4">
            <Shield size={16} className="text-blue-600"/> Compliance Overview
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <p className={`text-2xl font-black ${complianceStats.medical === complianceStats.total ? 'text-emerald-600' : 'text-amber-500'}`}>
                {complianceStats.medical}/{complianceStats.total}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Medical</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <p className={`text-2xl font-black ${complianceStats.reeplayer === complianceStats.total ? 'text-emerald-600' : 'text-amber-500'}`}>
                {complianceStats.reeplayer}/{complianceStats.total}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">ReePlayer</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <p className="text-2xl font-black text-blue-600">{complianceStats.fullyCompliant}/{complianceStats.total}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Complete</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROSTER SECTION ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Roster Header */}
        <div className="p-4 md:p-6 border-b border-slate-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
              <Users size={20} className="text-blue-600"/> 
              {viewArchived ? `Archived (${archivedPlayers.length})` : `Roster (${players.length})`}
            </h3>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button onClick={() => setViewArchived(!viewArchived)} className="text-slate-500 hover:text-slate-800 px-3 py-2 text-xs font-bold flex items-center gap-1 transition-all rounded-lg hover:bg-slate-50">
                <Archive size={14} /> {viewArchived ? 'Active' : 'Archived'}
              </button>
              <button onClick={onAddPlayer} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all">
                Add Player
              </button>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
            <input 
              type="text" placeholder="Search by name or jersey number..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>
        
        {/* Player Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 md:p-6">
          {filteredPlayers.length === 0 ? (
             <div className="col-span-full py-10 text-center text-slate-400 font-bold italic border-2 border-dashed border-slate-100 rounded-2xl">
               {searchTerm ? 'No players match your search.' : 'No players found in this list.'}
             </div>
          ) : (
            filteredPlayers.map(player => {
              const isWaived = player.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived;
              const hasMedical = player.medicalRelease;
              const hasReeplayer = player.reePlayerWaiver;
              const isFullyCompliant = hasMedical && hasReeplayer;

              return (
                <div 
                  key={player.id} 
                  onClick={() => onViewPlayer(player)}
                  className={`group p-4 rounded-xl border cursor-pointer transition-all ${
                    viewArchived 
                      ? 'bg-slate-50 border-slate-200 opacity-60' 
                      : 'border-slate-100 hover:border-blue-300 hover:shadow-md bg-white active:scale-[0.98]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Jersey Badge */}
                    <div className="flex items-center justify-center bg-slate-900 text-white font-black h-10 w-10 rounded-xl text-sm shrink-0 group-hover:bg-blue-600 transition-colors">
                      {player.jerseyNumber || '?'}
                    </div>
                    
                    <div className="flex-grow min-w-0">
                      <p className="font-black text-slate-900 text-sm truncate">{player.firstName} {player.lastName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {isWaived && (
                          <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase">Waived</span>
                        )}
                        {isFullyCompliant ? (
                          <ShieldCheck size={13} className="text-emerald-500" />
                        ) : (
                          <ShieldX size={13} className="text-red-400" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onEditPlayer(player); }} 
                        className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Player"
                      >
                        <Edit size={14} />
                      </button>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
