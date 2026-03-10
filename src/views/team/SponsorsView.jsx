import React, { useState } from 'react';
import { 
  Award, UserCheck, TrendingUp, Share2, Undo2, Lock, 
  ArrowDownNarrowWide, CheckCircle2, ChevronDown, Zap, Loader2 
} from 'lucide-react';

export default function SponsorsView({ 
  transactions, 
  selectedSeason, 
  formatMoney, 
  onDistribute, 
  onReset, 
  seasonalPlayers,
  seasons,
  currentSeasonData
}) {
  const [showDistribute, setShowDistribute] = useState(false);
  const [distAmount, setDistAmount] = useState('');
  const [distTitle, setDistTitle] = useState('');
  const [sourcePlayerId, setSourcePlayerId] = useState('');
  const [originalTxId, setOriginalTxId] = useState(null); 
  const [distCategory, setDistCategory] = useState('SPO');
  const [activeTab, setActiveTab] = useState('undistributed'); 
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [isDistributingAll, setIsDistributingAll] = useState(false);
  const [distributeAllProgress, setDistributeAllProgress] = useState({ current: 0, total: 0, currentTitle: '' });

  // FIX: Use the merged currentSeasonData (which includes team_season finalization)
  // instead of re-deriving from the global seasons array.
  // Falls back to global season lookup for backwards compatibility.
  const isBudgetLocked = currentSeasonData?.isFinalized 
    ?? seasons.find(s => s.id === selectedSeason)?.isFinalized 
    ?? false;

  const isCleared = (tx) => tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';

  // Extract raw credits for the history tab
  const sponsorTxs = transactions.filter(tx => tx.category === 'SPO' && isCleared(tx) && tx.waterfallBatchId);
  const fundraiserTxs = transactions.filter(tx => tx.category === 'FUN' && isCleared(tx) && tx.waterfallBatchId);
  const allCredits = [...sponsorTxs, ...fundraiserTxs];

  // GROUP HISTORY BY BATCH ID
  const groupedHistoryMap = {};
  allCredits.forEach(tx => {
    if (!groupedHistoryMap[tx.waterfallBatchId]) {
      groupedHistoryMap[tx.waterfallBatchId] = {
        batchId: tx.waterfallBatchId,
        originalTxId: tx.originalTxId,
        title: tx.title.replace(' (Team Pool Overflow)', ''),
        date: tx.date,
        totalAmount: 0,
        recipients: [],
        category: tx.category
      };
    }
    groupedHistoryMap[tx.waterfallBatchId].totalAmount += Number(tx.amount || 0);
    groupedHistoryMap[tx.waterfallBatchId].recipients.push({
      name: tx.playerName || 'Team Pool',
      amount: Number(tx.amount || 0)
    });
  });

  const historyList = Object.values(groupedHistoryMap).sort((a,b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

  // UNDISTRIBUTED FUNDS (Combines SPO and FUN)
  const undistributedSponsors = transactions.filter(tx => 
    ['SPO', 'FUN'].includes(tx.category) && Number(tx.amount || 0) > 0 && !tx.distributed && !tx.waterfallBatchId
  );

  // FUNDRAISING ROLLUP — only raw ledger deposits to avoid double-counting
  const rawFundraisingTxs = transactions.filter(tx => tx.category === 'FUN' && isCleared(tx) && !tx.waterfallBatchId);
  
  const fundraisingByPlayer = seasonalPlayers.map(player => {
    const fullName = `${player.firstName} ${player.lastName}`.trim().toLowerCase();
    const playerTxs = rawFundraisingTxs.filter(tx => {
      if (tx.playerId === player.id) return true;
      const txName = (tx.playerName || tx.Name || '').trim().toLowerCase();
      return txName === fullName;
    });
    const total = playerTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    return { ...player, fundraisingTxs: playerTxs, fundraisingTotal: total };
  }).filter(p => p.fundraisingTotal > 0 || p.fundraisingTxs.length > 0)
    .sort((a, b) => b.fundraisingTotal - a.fundraisingTotal);

  // Sort undistributed: SPO first, then FUN
  const sortedUndistributed = [...undistributedSponsors].sort((a, b) => {
    const order = { SPO: 0, FUN: 1 };
    return (order[a.category] ?? 2) - (order[b.category] ?? 2);
  });

  const handleDistributeAll = async () => {
    if (!isBudgetLocked) {
      alert('Budget must be finalized before distributing funds.');
      return;
    }
    if (sortedUndistributed.length === 0) return;

    const confirmed = window.confirm(
      `This will sequentially distribute ${sortedUndistributed.length} pending fund(s) using the Waterfall Engine (Sponsorships first, then Fundraising).\n\nEach transaction will credit its linked player first, then overflow to the team.\n\nProceed?`
    );
    if (!confirmed) return;

    setIsDistributingAll(true);
    setDistributeAllProgress({ current: 0, total: sortedUndistributed.length, currentTitle: '' });

    try {
      for (let i = 0; i < sortedUndistributed.length; i++) {
        const tx = sortedUndistributed[i];
        setDistributeAllProgress({ current: i + 1, total: sortedUndistributed.length, currentTitle: tx.title });
        // Sequential await — each run recalculates balances before the next
        await onDistribute(tx.amount, tx.title, tx.playerId || '', tx.id, tx.category);
      }
    } catch (err) {
      console.error('Distribute All failed at item:', distributeAllProgress.current, err);
      alert(`Distribution stopped at "${distributeAllProgress.currentTitle}". ${err.message || 'Check the console for details.'}`);
    } finally {
      setIsDistributingAll(false);
      setDistributeAllProgress({ current: 0, total: 0, currentTitle: '' });
    }
  };

  return (
    <div className="space-y-6">
      
      {/* TABS HEADER */}
      <div className="flex flex-wrap gap-2 mb-6 bg-slate-200 p-1 rounded-xl w-fit">
        <button 
          onClick={() => setActiveTab('undistributed')} 
          className={`px-4 md:px-6 py-2 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'undistributed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Undistributed ({undistributedSponsors.length})
        </button>
        <button 
          onClick={() => setActiveTab('distributed')} 
          className={`px-4 md:px-6 py-2 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'distributed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Distribution History
        </button>
        <button 
          onClick={() => setActiveTab('fundraising')} 
          className={`px-4 md:px-6 py-2 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'fundraising' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Player Fundraising
        </button>
      </div>

      {/* --- UNDISTRIBUTED VIEW --- */}
      {activeTab === 'undistributed' && (
        <div className="animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <Lock size={18} className="text-amber-500" /> Pending Distributions
            </h3>
            {undistributedSponsors.length > 1 && (
              <button
                onClick={handleDistributeAll}
                disabled={isDistributingAll || !isBudgetLocked}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm transition-all shadow-md ${
                  !isBudgetLocked 
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                    : isDistributingAll 
                      ? 'bg-amber-500 text-white cursor-wait' 
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                }`}
                title={!isBudgetLocked ? 'Finalize the budget first' : ''}
              >
                {isDistributingAll ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> 
                    Distributing {distributeAllProgress.current}/{distributeAllProgress.total}...
                  </>
                ) : (
                  <>
                    <Zap size={16} /> Distribute All ({undistributedSponsors.length})
                  </>
                )}
              </button>
            )}
          </div>

          {/* Progress Bar (visible during Distribute All) */}
          {isDistributingAll && (
            <div className="mb-4 bg-white p-4 rounded-2xl border border-amber-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Processing</span>
                <span className="text-xs font-black text-slate-700">
                  {distributeAllProgress.current} of {distributeAllProgress.total}
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${(distributeAllProgress.current / distributeAllProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm font-bold text-slate-600 mt-2 truncate">
                {distributeAllProgress.currentTitle}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {undistributedSponsors.length === 0 ? (
              <div className="bg-slate-50 p-12 rounded-2xl border border-slate-200 text-center text-slate-400 font-bold italic">
                All sponsorship funds have been distributed.
              </div>
            ) : (
              sortedUndistributed.map(tx => (
                <div key={tx.id} className={`bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm ${isDistributingAll ? 'opacity-60 pointer-events-none' : ''} ${tx.category === 'SPO' ? 'border-blue-200' : 'border-emerald-200'}`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                        tx.category === 'SPO' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {tx.category === 'SPO' ? 'Sponsorship' : 'Fundraising'}
                      </span>
                      {tx.playerName && (
                        <span className="text-[10px] font-bold text-slate-400">
                          via {tx.playerName}
                        </span>
                      )}
                    </div>
                    <p className="font-black text-slate-800 text-lg">{tx.title}</p>
                    <p className="text-sm font-bold text-slate-500 mt-1">Amount: <span className="text-emerald-600">{formatMoney(tx.amount)}</span></p>
                  </div>
                  <button 
                    onClick={() => {
                      setDistAmount(tx.amount);
                      setDistTitle(tx.title);
                      setOriginalTxId(tx.id);
                      setDistCategory(tx.category);
                      setSourcePlayerId(tx.playerId || '');
                      setShowDistribute(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-md"
                  >
                    Distribute Funds
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- DISTRIBUTED VIEW (RECEIPT GROUPS) --- */}
      {activeTab === 'distributed' && (
        <div className="animate-in fade-in duration-300">
          <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" /> Distribution History
          </h3>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="px-6 py-4">Title / Source</th>
                    <th className="px-6 py-4">Waterfall Breakdown</th>
                    <th className="px-6 py-4 text-right">Total Applied</th>
                    <th className="px-6 py-4 text-center">Undo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historyList.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-slate-400 font-bold italic">
                        No distributed sponsorships or fundraising found.
                      </td>
                    </tr>
                  ) : (
                    historyList.map((group) => (
                      <tr key={group.batchId} className="hover:bg-slate-50 transition-colors items-start">
                        <td className="px-6 py-4 align-top">
                          <p className="font-bold text-slate-800 text-sm">{group.title}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-1">
                            {group.date?.seconds ? new Date(group.date.seconds * 1000).toLocaleDateString() : 'Pending'}
                          </p>
                        </td>
                        <td className="px-6 py-4 align-top">
                           <div className="flex flex-col gap-2">
                             <span className="text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider bg-blue-50 text-blue-600 w-fit">
                               {group.recipients.length} Recipient{group.recipients.length !== 1 && 's'}
                             </span>
                             <div className="text-xs text-slate-500 space-y-1">
                               {group.recipients.map((r, i) => (
                                 <div key={i} className="flex justify-between max-w-[200px] border-b border-slate-100 last:border-0 pb-1 last:pb-0">
                                   <span className="font-medium text-slate-700">{r.name}</span>
                                   <span className="font-bold text-slate-900">{formatMoney(r.amount)}</span>
                                 </div>
                               ))}
                             </div>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-emerald-600 align-top">
                          {formatMoney(group.totalAmount)}
                        </td>
                        <td className="px-6 py-4 text-center align-top">
                          <button 
                            onClick={() => onReset(group.batchId, group.originalTxId)} 
                            className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
                            title="Undo this distribution"
                          >
                            <Undo2 size={16}/>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- FUNDRAISING ROLLUP VIEW --- */}
      {activeTab === 'fundraising' && (
        <div className="animate-in fade-in duration-300">
          <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-500" /> Player Fundraising Totals
          </h3>
          <div className="space-y-3">
            {fundraisingByPlayer.length === 0 ? (
              <div className="bg-slate-50 p-12 rounded-2xl border border-slate-200 text-center text-slate-400 font-bold italic">
                No fundraising activity recorded for this season yet.
              </div>
            ) : (
              fundraisingByPlayer.map(player => (
                <div key={player.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)}
                    className="w-full flex justify-between items-center p-5 hover:bg-slate-50 transition-colors"
                  >
                    <span className="font-black text-slate-800 text-lg flex items-center gap-3">
                      <span className="flex items-center justify-center bg-blue-100 text-blue-700 font-black h-8 w-8 rounded-full text-sm">
                        {player.jerseyNumber || '-'}
                      </span>
                      {player.firstName} {player.lastName}
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="font-black text-emerald-600 text-lg">{formatMoney(player.fundraisingTotal)}</span>
                      <ChevronDown size={20} className={`text-slate-400 transition-transform duration-200 ${expandedPlayerId === player.id ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  
                  {expandedPlayerId === player.id && (
                    <div className="bg-slate-50 border-t border-slate-100 p-4">
                      <table className="w-full text-left text-sm">
                        <tbody>
                          {player.fundraisingTxs.map(tx => (
                            <tr key={tx.id} className="border-b border-slate-200/50 last:border-0">
                              <td className="py-3 px-2 font-bold text-slate-700">{tx.title}</td>
                              <td className="py-3 px-2 text-slate-500 text-xs font-medium">
                                {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="py-3 px-2 text-right font-black text-emerald-600">
                                {formatMoney(tx.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- WATERFALL MODAL --- */}
      {showDistribute && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
              <ArrowDownNarrowWide className="text-emerald-500"/> Waterfall Distribution
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Sponsor / Source</label>
                <input type="text" value={distTitle} onChange={e => setDistTitle(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-slate-400 font-bold">$</span>
                  <input type="number" value={distAmount} onChange={e => setDistAmount(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 pl-8 font-black focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Apply Primary Credit To</label>
                <select value={sourcePlayerId} onChange={e => setSourcePlayerId(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 font-bold text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">Team Pool (Split Evenly)</option>
                  {seasonalPlayers.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-2">Any funds exceeding a player's remaining fee will automatically waterfall to the rest of the team.</p>
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => {
                    setShowDistribute(false);
                    setOriginalTxId(null);
                  }} 
                  className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => { 
                    onDistribute(distAmount, distTitle, sourcePlayerId, originalTxId, distCategory); 
                    setShowDistribute(false);
                    setOriginalTxId(null); 
                  }} 
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                >
                  Apply Waterfall
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}