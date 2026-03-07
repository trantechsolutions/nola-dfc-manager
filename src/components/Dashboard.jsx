import React, { useState } from 'react';
import { TrendingDown, Users, DollarSign, Activity, Archive, Edit } from 'lucide-react';

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

  const projectedSpend = selectedSeasonData?.totalProjectedExpenses || 0;
  const isFinalized = selectedSeasonData?.isFinalized;
  
  const spendPercentage = projectedSpend > 0 ? (totalExpenses / projectedSpend) * 100 : 0;
  const remainingBudget = projectedSpend - totalExpenses;

  const displayedPlayers = viewArchived ? archivedPlayers : players;

  return (
    <div className="space-y-6">
      {/* BUDGET HEALTH INDICATOR */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-slate-800 flex items-center gap-2"><Activity size={18} className="text-blue-600"/> Budget Health</h3>
          {!isFinalized && <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-1 rounded">Drafting Mode</span>}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
              <span>Actual vs. Projected Spend</span>
              <span>{Math.round(spendPercentage)}%</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${spendPercentage > 100 ? 'bg-red-500' : 'bg-blue-500'}`} 
                style={{ width: `${Math.min(spendPercentage, 100)}%` }}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-500"><TrendingDown size={20}/></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Remaining Budget</p>
              <p className={`font-black ${remainingBudget < 0 ? 'text-red-500' : 'text-slate-900'}`}>{formatMoney(remainingBudget)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><DollarSign size={20}/></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Available Cash</p>
              <p className="font-black text-slate-900">{formatMoney(teamBalance)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ROSTER SECTION */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
            <Users size={20} className="text-blue-600"/> 
            {viewArchived ? `Archived Players (${archivedPlayers.length})` : `Seasonal Roster (${players.length})`}
          </h3>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button onClick={() => setViewArchived(!viewArchived)} className="text-slate-500 hover:text-slate-800 px-3 py-2 text-sm font-bold flex items-center gap-1 transition-all">
              <Archive size={16} /> {viewArchived ? 'View Active' : 'View Archived'}
            </button>
            <button onClick={onAddPlayer} className="flex-1 md:flex-none bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-800 transition-all">
              Add Player
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
          {displayedPlayers.length === 0 ? (
             <div className="col-span-full py-10 text-center text-slate-400 font-bold italic border-2 border-dashed border-slate-100 rounded-2xl">
               No players found in this list.
             </div>
          ) : (
            displayedPlayers.map(player => (
              <div key={player.id} className={`p-4 rounded-2xl border transition-all ${viewArchived ? 'bg-slate-100 border-slate-200 opacity-60' : 'border-slate-100 hover:border-blue-200 hover:shadow-md bg-slate-50/50'}`}>
                <div className="flex justify-between items-start">
                  
                  {/* Clicking the text/body opens the Details Modal */}
                  <div className="cursor-pointer flex-grow" onClick={() => onViewPlayer(player)}>
                    <p className="font-black text-slate-900">{player.firstName} {player.lastName}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs font-bold text-slate-400">#{player.jerseyNumber || '??'}</p>
                      
                      {/* Updated Waiver Badge Styling */}
                      {player.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived && (
                        <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded uppercase tracking-widest shadow-sm">
                          Fee Waived
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clicking this button opens the Edit Form */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEditPlayer(player); }} 
                    className="p-2 text-slate-400 hover:text-blue-600 bg-white rounded-lg border border-slate-100 hover:border-blue-200 transition-colors ml-2"
                    title="Edit Player"
                  >
                    <Edit size={16} />
                  </button>
                  
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}