import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Lock, Unlock, Users, CheckCircle2, TrendingUp, Copy, 
  ChevronDown, ChevronRight, BarChart3, Lightbulb, ArrowUpRight, 
  ArrowDownRight, Sparkles, FileSpreadsheet, UserPlus, AlertTriangle
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import PlayerFormModal from '../components/PlayerFormModal';

const BUDGET_CATEGORIES = [
  { code: 'OPE', name: 'Operating',    type: 'expense' },
  { code: 'COA', name: 'Coach Fees',   type: 'expense' },
  { code: 'TOU', name: 'Tournaments',  type: 'expense' },
  { code: 'LEA', name: 'League',       type: 'expense' },
  { code: 'FRI', name: 'Friendlies',   type: 'expense' },
  { code: 'TMF', name: 'Team Fees',    type: 'income'  },
  { code: 'FUN', name: 'Fundraisers',  type: 'income'  },
  { code: 'SPO', name: 'Sponsorships', type: 'income'  },
];
const EXPENSE_CODES = BUDGET_CATEGORIES.filter(c => c.type === 'expense').map(c => c.code);

export default function BudgetView({ selectedSeason, selectedTeamId, formatMoney, seasons, setSelectedSeason, refreshSeasons, showToast, showConfirm, onDataChange }) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [activeTab, setActiveTab] = useState('budget');

  const [budgetItems, setBudgetItems] = useState([]);
  const [rosterSize, setRosterSize] = useState(13);
  const [bufferPercent, setBufferPercent] = useState(5);
  const [cloneSource, setCloneSource] = useState('');
  const [collapsedCats, setCollapsedCats] = useState({});
  const [teamSeasonId, setTeamSeasonId] = useState(null);

  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [isSubmittingPlayer, setIsSubmittingPlayer] = useState(false);

  const [seasonTransactions, setSeasonTransactions] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [historicalBudgets, setHistoricalBudgets] = useState({});
  const [allSeasonsList, setAllSeasonsList] = useState([]);

  // ─── DATA FETCHING ───
  const fetchData = async () => {
    setLoading(true);
    try {
      const allSeasons = await supabaseService.getAllSeasons();
      let tsData = null;
      if (selectedTeamId) tsData = await supabaseService.getTeamSeason(selectedTeamId, selectedSeason);

      if (tsData) {
        setTeamSeasonId(tsData.id);
        setRosterSize(tsData.expectedRosterSize || 13);
        setBufferPercent(tsData.bufferPercent ?? 5);
        setIsFinalized(tsData.isFinalized || false);
      } else {
        setTeamSeasonId(null); setRosterSize(13); setBufferPercent(5); setIsFinalized(false);
      }

      setBudgetItems((await supabaseService.getBudgetItems(selectedSeason)) || []);
      setAvailablePlayers(await supabaseService.getAllPlayers());

      const allTx = await supabaseService.getAllTransactions();
      setAllTransactions(allTx);
      setSeasonTransactions(allTx.filter(tx => tx.seasonId === selectedSeason));

      const allTeamSeasons = selectedTeamId ? await supabaseService.getTeamSeasons(selectedTeamId) : [];
      const finalized = allTeamSeasons.filter(ts => ts.isFinalized && ts.seasonId !== selectedSeason);
      const budgets = {};
      for (const ts of finalized) budgets[ts.seasonId] = await supabaseService.getBudgetItems(ts.seasonId);
      setHistoricalBudgets(budgets);

      setAllSeasonsList(allSeasons.map(s => {
        const ts = allTeamSeasons.find(t => t.seasonId === s.id);
        return { ...s, isFinalized: ts?.isFinalized || false, bufferPercent: ts?.bufferPercent ?? 5 };
      }));
    } catch (error) {
      console.error('Budget fetch error:', error);
      if (showToast) showToast('Failed to fetch budget data.', true);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [selectedSeason, selectedTeamId]);

  useEffect(() => {
    const active = availablePlayers.filter(p =>
      p.seasonProfiles?.[selectedSeason] && p.seasonProfiles[selectedSeason].feeWaived !== true
    ).length;
    if (!isFinalized && active > 0) setRosterSize(active);
  }, [availablePlayers, selectedSeason, isFinalized]);

  // ─── COMPUTED ───
  const itemsByCategory = useMemo(() => {
    const map = {};
    BUDGET_CATEGORIES.forEach(cat => { map[cat.code] = budgetItems.filter(i => i.category === cat.code); });
    return map;
  }, [budgetItems]);

  const subtotals = useMemo(() => {
    const result = {};
    BUDGET_CATEGORIES.forEach(cat => {
      const items = itemsByCategory[cat.code] || [];
      result[cat.code] = {
        income: items.reduce((s, i) => s + (Number(i.income) || 0), 0),
        expensesFall: items.reduce((s, i) => s + (Number(i.expensesFall) || 0), 0),
        expensesSpring: items.reduce((s, i) => s + (Number(i.expensesSpring) || 0), 0),
      };
      result[cat.code].net = result[cat.code].income - result[cat.code].expensesFall - result[cat.code].expensesSpring;
    });
    return result;
  }, [itemsByCategory]);

  const grandTotals = useMemo(() => {
    let income = 0, expFall = 0, expSpring = 0;
    Object.values(subtotals).forEach(s => { income += s.income; expFall += s.expensesFall; expSpring += s.expensesSpring; });
    return { income, expensesFall: expFall, expensesSpring: expSpring, net: income - expFall - expSpring };
  }, [subtotals]);

  const actuals = useMemo(() => {
    const map = {};
    seasonTransactions.forEach(tx => {
      const cleared = tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';
      if (!cleared || tx.waterfallBatchId) return;
      map[tx.category || ''] = (map[tx.category || ''] || 0) + Number(tx.amount || 0);
    });
    return map;
  }, [seasonTransactions]);

  const totalActual = useMemo(() => Object.values(actuals).reduce((s, v) => s + v, 0), [actuals]);

  const totalExpenseAmount = useMemo(() =>
    EXPENSE_CODES.reduce((sum, code) => sum + (subtotals[code]?.expensesFall || 0) + (subtotals[code]?.expensesSpring || 0), 0)
  , [subtotals]);

  const bufferAmount = totalExpenseAmount * (bufferPercent / 100);
  const rawFee = rosterSize > 0 ? (totalExpenseAmount + bufferAmount) / rosterSize : 0;
  const roundedBaseFee = Math.ceil(rawFee / 50) * 50;

  // ─── PROJECTIONS ───
  const projections = useMemo(() => {
    const isCleared = (tx) => tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';
    const pastSeasons = allSeasonsList.filter(s => s.isFinalized && s.id !== selectedSeason);
    if (pastSeasons.length === 0) return null;

    const categoryHistory = {};
    BUDGET_CATEGORIES.forEach(cat => { categoryHistory[cat.code] = { budgeted: [], actual: [], seasons: [] }; });
    pastSeasons.forEach(season => {
      const items = historicalBudgets[season.id] || [];
      const txs = allTransactions.filter(tx => tx.seasonId === season.id && isCleared(tx) && !tx.waterfallBatchId);
      const seasonActuals = {};
      txs.forEach(tx => { seasonActuals[tx.category || ''] = (seasonActuals[tx.category || ''] || 0) + Number(tx.amount || 0); });
      BUDGET_CATEGORIES.forEach(cat => {
        const catItems = items.filter(i => i.category === cat.code);
        const budgeted = catItems.reduce((s, i) => cat.type === 'income' ? s + (Number(i.income) || 0) : s + (Number(i.expensesFall) || 0) + (Number(i.expensesSpring) || 0), 0);
        categoryHistory[cat.code].budgeted.push(budgeted);
        categoryHistory[cat.code].actual.push(Math.abs(seasonActuals[cat.code] || 0));
        categoryHistory[cat.code].seasons.push(season.id);
      });
    });

    const categoryProjections = {};
    BUDGET_CATEGORIES.forEach(cat => {
      const h = categoryHistory[cat.code];
      const avgBudgeted = h.budgeted.length > 0 ? h.budgeted.reduce((a, b) => a + b, 0) / h.budgeted.length : 0;
      const avgActual = h.actual.length > 0 ? h.actual.reduce((a, b) => a + b, 0) / h.actual.length : 0;
      const variance = avgBudgeted > 0 ? ((avgActual - avgBudgeted) / avgBudgeted) * 100 : 0;
      categoryProjections[cat.code] = { avgBudgeted, avgActual, variance, suggested: Math.ceil(Math.max(avgActual, avgBudgeted) / 10) * 10 };
    });

    const suggestedItems = (historicalBudgets[pastSeasons[0]?.id] || []).map(item => ({
      ...item, id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, source: pastSeasons[0]?.id,
    }));

    return {
      categoryProjections, suggestedItems, pastSeasons,
      totalBudgeted: Object.values(categoryProjections).reduce((s, p) => s + p.avgBudgeted, 0),
      totalActualAvg: Object.values(categoryProjections).reduce((s, p) => s + p.avgActual, 0),
    };
  }, [allSeasonsList, historicalBudgets, allTransactions, selectedSeason]);

  // ─── HANDLERS ───
  const addItem = (code) => setBudgetItems(prev => [...prev, { id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, category: code, label: '', income: 0, expensesFall: 0, expensesSpring: 0 }]);
  const updateItem = (id, field, value) => setBudgetItems(prev => prev.map(item => item.id === id ? { ...item, [field]: field === 'label' ? value : (parseFloat(value) || 0) } : item));
  const removeItem = (id) => setBudgetItems(prev => prev.filter(i => i.id !== id));
  const toggleCollapse = (code) => setCollapsedCats(prev => ({ ...prev, [code]: !prev[code] }));

  // ─── SAVE BUDGET (both draft and finalize go through here) ───
  const handleSaveBudget = async (finalize = false) => {
    if (finalize) {
      const ok = await showConfirm('Finalizing locks the budget and applies fees to all players. Proceed?');
      if (!ok) return;
    }
    setIsSaving(true);
    try {
      // 1. Ensure season record exists (id + name only)
      await supabaseService.saveSeason(selectedSeason, { name: selectedSeason });

      // 2. Save budget metadata to team_seasons
      let currentTeamSeasonId = teamSeasonId;
      if (selectedTeamId) {
        const tsResult = await supabaseService.saveTeamSeason({
          id: teamSeasonId || undefined,
          teamId: selectedTeamId,
          seasonId: selectedSeason,
          isFinalized: finalize || isFinalized,
          bufferPercent: Number(bufferPercent),
          expectedRosterSize: Number(rosterSize),
          baseFee: roundedBaseFee,
          totalProjectedExpenses: totalExpenseAmount,
          totalProjectedIncome: grandTotals.income,
        });
        if (tsResult?.id) { setTeamSeasonId(tsResult.id); currentTeamSeasonId = tsResult.id; }
      }

      // 3. Save budget line items
      await supabaseService.saveBudgetItems(selectedSeason, budgetItems);

      // 4. player_financials is a VIEW — auto-computed from team_seasons.base_fee +
      //    player_seasons.fee_waived + transactions. Writing baseFee to team_seasons
      //    in step 2 is all that's needed; the view recalculates on every query.

      // 5. If finalizing, lock it
      if (finalize) setIsFinalized(true);

      await refreshSeasons();
      if (finalize) fetchData();
      onDataChange?.();
      if (showToast) showToast(finalize ? 'Budget Finalized & Fees Applied!' : 'Draft Saved.');
    } catch (e) {
      console.error('Save error:', e);
      if (showToast) showToast(`Save failed: ${e.message}`, true);
    } finally { setIsSaving(false); }
  };

  const handleDeleteSeason = async () => {
    const ok = await showConfirm(`Delete "${selectedSeason}"? This removes all budget items, roster assignments, and transactions.`);
    if (!ok) return;
    setIsSaving(true);
    try {
      await supabaseService.deleteSeason(selectedSeason);
      await refreshSeasons();
      const remaining = allSeasonsList.filter(s => s.id !== selectedSeason);
      setSelectedSeason(remaining.length > 0 ? remaining[0].id : '2025-2026');
      onDataChange?.();
      if (showToast) showToast(`Season "${selectedSeason}" deleted.`);
    } catch (e) { if (showToast) showToast('Delete failed.', true); }
    finally { setIsSaving(false); }
  };

  const handleCloneBudget = async (sourceId) => {
    if (!sourceId) return;
    const ok = await showConfirm(`Overwrite current items with data from ${sourceId}?`);
    if (!ok) return;
    try {
      const items = await supabaseService.getBudgetItems(sourceId);
      if (items.length > 0) setBudgetItems(items.map(i => ({ ...i, id: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })));
      const source = allSeasonsList.find(s => s.id === sourceId);
      if (source) setBufferPercent(source.bufferPercent || 5);
      if (showToast) showToast(`Cloned from ${sourceId}`);
    } catch (e) { if (showToast) showToast('Clone failed.', true); }
  };

  const handleImportRoster = async () => {
    if (selectedPlayers.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(selectedPlayers.map(id => supabaseService.addPlayerToSeason(id, selectedSeason, { feeWaived: false, status: 'active' }, teamSeasonId)));
      setSelectedPlayers([]); await fetchData(); onDataChange?.();
      if (showToast) showToast(`Imported ${selectedPlayers.length} players.`);
    } catch (e) { if (showToast) showToast('Import failed.', true); }
    finally { setIsSaving(false); }
  };

  const handleCreateSeason = async (e) => {
    e.preventDefault();
    if (!newSeasonName.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.saveSeason(newSeasonName.trim(), { name: newSeasonName.trim() });
      await refreshSeasons(); setSelectedSeason(newSeasonName.trim()); setShowNewSeasonModal(false); setNewSeasonName('');
      if (showToast) showToast(`Created ${newSeasonName.trim()}`);
    } catch (e) { if (showToast) showToast('Create failed.', true); }
    finally { setIsSaving(false); }
  };

  const handleToggleWaiver = async (playerId, currentWaivedStatus) => {
    if (isFinalized) { if (showToast) showToast('Cannot modify waivers on a finalized budget.', true); return; }
    setAvailablePlayers(prev => prev.map(p => p.id === playerId ? { ...p, seasonProfiles: { ...p.seasonProfiles, [selectedSeason]: { ...p.seasonProfiles[selectedSeason], feeWaived: !currentWaivedStatus } } } : p));
    try {
      await supabaseService.updateSeasonProfile(playerId, selectedSeason, { feeWaived: !currentWaivedStatus });
      onDataChange?.();
      if (showToast) showToast(!currentWaivedStatus ? 'Player fee waived.' : 'Fee reinstated.', false, { label: 'Undo', onClick: () => handleToggleWaiver(playerId, !currentWaivedStatus) });
    } catch (e) { if (showToast) showToast('Failed.', true); fetchData(); }
  };

  const handleApplySuggestions = () => {
    if (!projections?.suggestedItems?.length) return;
    setBudgetItems(projections.suggestedItems.map(i => ({ ...i, id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })));
    if (showToast) showToast(`Applied ${projections.suggestedItems.length} items from ${projections.pastSeasons[0]?.id}`);
  };

  const handleAddNewPlayer = async (playerData) => {
    setIsSubmittingPlayer(true);
    try {
      const profiles = playerData.seasonProfiles || {};
      profiles[selectedSeason] = { ...(profiles[selectedSeason] || {}), status: playerData.status || 'active', feeWaived: false, ...(teamSeasonId ? { teamSeasonId } : {}) };
      await supabaseService.addPlayer({ ...playerData, seasonProfiles: profiles, status: 'active' });
      setShowPlayerForm(false); await fetchData(); onDataChange?.();
      if (showToast) showToast(`${playerData.firstName} ${playerData.lastName} added.`);
    } catch (e) { if (showToast) showToast('Failed to add player.', true); }
    finally { setIsSubmittingPlayer(false); }
  };

  const handleRemoveFromSeason = async (player) => {
    const ok = await showConfirm(`Remove ${player.firstName} ${player.lastName} from ${selectedSeason}?`);
    if (!ok) return;
    try { await supabaseService.removePlayerFromSeason(player.id, selectedSeason); await fetchData(); onDataChange?.(); if (showToast) showToast(`${player.firstName} removed.`); }
    catch (e) { if (showToast) showToast('Remove failed.', true); }
  };

  // ─── RENDER HELPERS ───
  const fmt = (val) => val === 0 ? <span className="text-slate-300">—</span> : <span className={val < 0 ? 'text-red-500' : ''}>{formatMoney(Math.abs(val))}</span>;
  const fmtNet = (val) => val === 0 ? <span className="text-slate-300">—</span> : <span className={`font-black ${val < 0 ? 'text-red-500' : ''}`}>{val < 0 ? `(${formatMoney(Math.abs(val))})` : formatMoney(val)}</span>;

  const seasonPlayers = availablePlayers.filter(p => p.seasonProfiles?.[selectedSeason]);
  const unassignedPlayers = availablePlayers.filter(p => !p.seasonProfiles?.[selectedSeason]);
  const tabs = [
    { id: 'budget', label: 'Budget Table', icon: FileSpreadsheet },
    { id: 'roster', label: 'Roster & Waivers', icon: Users, badge: seasonPlayers.length },
    ...(projections ? [{ id: 'projections', label: 'Projections', icon: BarChart3 }] : []),
  ];

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse">LOADING BUDGET...</div>;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* HEADER */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isFinalized ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>{isFinalized ? <Lock size={20} /> : <Unlock size={20} />}</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900">{selectedSeason}</h2>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${isFinalized ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>{isFinalized ? 'Finalized' : 'Draft'}</span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Aug {selectedSeason.split('-')[0]} – May {selectedSeason.split('-')[1]} · {seasonPlayers.length} players · Fee: {formatMoney(roundedBaseFee)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!isFinalized && (<>
              <button onClick={handleDeleteSeason} disabled={isSaving} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
              <button onClick={() => handleSaveBudget(false)} disabled={isSaving} className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50">Save</button>
              <button onClick={() => handleSaveBudget(true)} disabled={isSaving} className="px-4 py-2 rounded-xl font-black text-xs text-white bg-slate-900 hover:bg-slate-800 shadow-lg flex items-center gap-1.5 disabled:opacity-50"><CheckCircle2 size={14} /> Finalize</button>
            </>)}
            <button onClick={() => setShowNewSeasonModal(true)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Plus size={16} /></button>
          </div>
        </div>
        <div className="flex gap-1 mt-4 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <tab.icon size={14} />{tab.label}{tab.badge != null && <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">{tab.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* BUDGET TABLE TAB */}
      {activeTab === 'budget' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {!isFinalized && (
              <div className="bg-blue-600 p-5 rounded-2xl text-white">
                <h3 className="font-black flex items-center gap-2 mb-3 text-sm"><Copy size={16} /> Clone Budget</h3>
                <div className="flex gap-2">
                  <select value={cloneSource} onChange={(e) => setCloneSource(e.target.value)} className="flex-grow bg-blue-700 border-none rounded-lg p-2.5 text-sm font-bold text-white outline-none">
                    <option value="">Select season...</option>
                    {seasons.filter(s => s.id !== selectedSeason).map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                  </select>
                  <button onClick={() => handleCloneBudget(cloneSource)} className="bg-white text-blue-600 px-5 py-2.5 rounded-lg font-black text-xs hover:bg-blue-50">Clone</button>
                </div>
              </div>
            )}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-900 text-white px-5 py-3"><h3 className="font-black text-sm">Budget {selectedSeason.replace('-', ' / ')}</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[640px]">
                  <thead><tr className="bg-slate-700 text-white text-[9px] font-black uppercase tracking-widest">
                    <th className="px-4 py-2.5 w-[38%]">Description</th><th className="px-3 py-2.5 text-right w-[12%]">Income</th>
                    <th className="px-3 py-2.5 text-right w-[12%]">Exp Fall</th><th className="px-3 py-2.5 text-right w-[12%]">Exp Spring</th>
                    <th className="px-3 py-2.5 text-right w-[12%]">Net</th><th className="px-3 py-2.5 text-right w-[14%]">Actual</th>
                  </tr></thead>
                  <tbody>
                    {BUDGET_CATEGORIES.map(cat => {
                      const items = itemsByCategory[cat.code] || [];
                      const sub = subtotals[cat.code];
                      const isExp = cat.type === 'expense';
                      const collapsed = collapsedCats[cat.code];
                      const actual = actuals[cat.code] || 0;
                      return (
                        <React.Fragment key={cat.code}>
                          <tr className="bg-slate-800 text-white cursor-pointer select-none" onClick={() => toggleCollapse(cat.code)}>
                            <td colSpan={6} className="px-4 py-2"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}{cat.name}<span className="ml-auto text-slate-400 text-[9px] font-medium normal-case tracking-normal">{items.length} items</span></div></td>
                          </tr>
                          {!collapsed && items.map(item => {
                            const itemNet = (Number(item.income) || 0) - (Number(item.expensesFall) || 0) - (Number(item.expensesSpring) || 0);
                            return (
                              <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                <td className="px-4 py-1.5">{isFinalized ? <span className="text-xs text-slate-700">{cat.code} - {item.label || <span className="italic text-slate-300">Untitled</span>}</span> : (
                                  <div className="flex items-center gap-2"><span className="text-[9px] font-bold text-slate-400 w-7">{cat.code}</span><input type="text" placeholder="Label..." value={item.label} onChange={(e) => updateItem(item.id, 'label', e.target.value)} className="flex-grow bg-transparent border-b border-slate-200 focus:border-blue-500 py-1 text-xs outline-none" /><button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button></div>
                                )}</td>
                                <td className="px-2 py-1.5 text-right">{!isExp && !isFinalized ? <input type="number" min="0" step="0.01" value={item.income || ''} onChange={(e) => updateItem(item.id, 'income', e.target.value)} className="w-full text-right bg-transparent border-b border-slate-200 focus:border-blue-500 py-1 text-xs outline-none" /> : fmt(item.income)}</td>
                                <td className="px-2 py-1.5 text-right">{isExp && !isFinalized ? <input type="number" min="0" step="0.01" value={item.expensesFall || ''} onChange={(e) => updateItem(item.id, 'expensesFall', e.target.value)} className="w-full text-right bg-transparent border-b border-slate-200 focus:border-blue-500 py-1 text-xs outline-none" /> : fmt(item.expensesFall)}</td>
                                <td className="px-2 py-1.5 text-right">{isExp && !isFinalized ? <input type="number" min="0" step="0.01" value={item.expensesSpring || ''} onChange={(e) => updateItem(item.id, 'expensesSpring', e.target.value)} className="w-full text-right bg-transparent border-b border-slate-200 focus:border-blue-500 py-1 text-xs outline-none" /> : fmt(item.expensesSpring)}</td>
                                <td className="px-2 py-1.5 text-right text-xs">{fmtNet(itemNet)}</td>
                                <td className="px-2 py-1.5 text-right text-xs text-slate-300">—</td>
                              </tr>);
                          })}
                          {!collapsed && !isFinalized && (<tr className="border-b border-slate-100"><td colSpan={6} className="px-4 py-1"><button onClick={() => addItem(cat.code)} className="text-blue-500 hover:text-blue-700 text-[10px] font-bold flex items-center gap-1"><Plus size={10} /> Add {cat.name} Item</button></td></tr>)}
                          {!collapsed && (<tr className="bg-slate-50 font-bold text-xs border-b border-slate-200">
                            <td className="px-4 py-2 text-slate-600">{cat.name} Subtotal</td>
                            <td className="px-2 py-2 text-right">{sub.income > 0 ? formatMoney(sub.income) : fmt(0)}</td>
                            <td className="px-2 py-2 text-right">{sub.expensesFall > 0 ? <span className="text-red-500">({formatMoney(sub.expensesFall)})</span> : fmt(0)}</td>
                            <td className="px-2 py-2 text-right">{sub.expensesSpring > 0 ? <span className="text-red-500">({formatMoney(sub.expensesSpring)})</span> : fmt(0)}</td>
                            <td className="px-2 py-2 text-right">{fmtNet(sub.net)}</td>
                            <td className="px-2 py-2 text-right font-black">{actual !== 0 ? <span className={actual < 0 ? 'text-red-500' : 'text-emerald-600'}>{actual < 0 ? `(${formatMoney(Math.abs(actual))})` : formatMoney(actual)}</span> : fmt(0)}</td>
                          </tr>)}
                        </React.Fragment>);
                    })}
                    <tr className="bg-slate-900 text-white font-black text-xs">
                      <td className="px-4 py-3 uppercase">Total</td>
                      <td className="px-2 py-3 text-right">{formatMoney(grandTotals.income)}</td>
                      <td className="px-2 py-3 text-right text-red-300">({formatMoney(grandTotals.expensesFall)})</td>
                      <td className="px-2 py-3 text-right text-red-300">({formatMoney(grandTotals.expensesSpring)})</td>
                      <td className="px-2 py-3 text-right"><span className={grandTotals.net < 0 ? 'text-red-300' : 'text-emerald-300'}>{grandTotals.net < 0 ? `(${formatMoney(Math.abs(grandTotals.net))})` : formatMoney(grandTotals.net)}</span></td>
                      <td className="px-2 py-3 text-right"><span className={totalActual < 0 ? 'text-red-300' : 'text-emerald-300'}>{formatMoney(totalActual)}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Fee Calculator Sidebar */}
          <div className="space-y-4 sticky top-4 self-start">
            <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10"><TrendingUp size={80} /></div>
              <h3 className="text-sm font-black mb-6 border-b border-slate-800 pb-3 relative z-10">Fee Calculator</h3>
              <div className="space-y-5 relative z-10">
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Roster (Non-Waived)</label><p className="text-2xl font-black text-blue-400">{rosterSize}</p></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Projected Expenses</label><p className="text-lg font-black text-red-400">{formatMoney(totalExpenseAmount)}</p></div>
                <div>
                  <div className="flex justify-between mb-1"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Buffer</label><span className="text-[9px] font-black text-blue-400">{bufferPercent}%</span></div>
                  <input type="range" min="0" max="25" step="1" value={bufferPercent} disabled={isFinalized} onChange={(e) => setBufferPercent(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                </div>
                <div className="bg-blue-600 rounded-2xl p-6 text-center shadow-inner mt-4">
                  <p className="text-[9px] font-bold text-blue-200 uppercase tracking-widest mb-1">Season Fee</p>
                  <h2 className="text-4xl font-black tracking-tighter">{formatMoney(roundedBaseFee)}</h2>
                  <p className="text-[9px] text-blue-200 font-bold mt-3 pt-3 border-t border-blue-500/50">Actual: {formatMoney(rawFee)}</p>
                </div>
              </div>
            </div>
            {projections && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 mb-3"><BarChart3 size={14} className="text-violet-600" /> vs Last Season<span className="ml-auto text-[9px] font-bold text-slate-400">{projections.pastSeasons[0]?.id}</span></h3>
                <div className="space-y-2">
                  {BUDGET_CATEGORIES.filter(c => c.type === 'expense').map(cat => {
                    const proj = projections.categoryProjections[cat.code];
                    if (!proj || (proj.avgBudgeted === 0 && proj.avgActual === 0)) return null;
                    const currentBudgeted = (subtotals[cat.code]?.expensesFall || 0) + (subtotals[cat.code]?.expensesSpring || 0);
                    const diff = currentBudgeted - proj.avgActual;
                    const hasData = currentBudgeted > 0;
                    const maxVal = Math.max(currentBudgeted, proj.avgActual, 1);
                    return (<div key={cat.code} className="space-y-1">
                      <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-600">{cat.name}</span>{hasData && <span className={`text-[9px] font-black ${diff > 0 ? 'text-red-500' : diff < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>{diff > 0 ? '+' : ''}{formatMoney(diff)}</span>}</div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${hasData ? (diff > 0 ? 'bg-red-400' : 'bg-emerald-400') : 'bg-slate-300'}`} style={{ width: `${(currentBudgeted / maxVal) * 100}%` }} /></div>
                      <div className="flex justify-between text-[9px] text-slate-400"><span>Now: {hasData ? formatMoney(currentBudgeted) : '—'}</span><span>Prev: {formatMoney(proj.avgActual)}</span></div>
                    </div>);
                  })}
                </div>
                <button onClick={() => setActiveTab('projections')} className="mt-3 w-full py-2 text-[10px] font-bold text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">View Full Projections →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ROSTER TAB */}
      {activeTab === 'roster' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[{ v: seasonPlayers.length, l: 'In Season', c: 'text-slate-800' }, { v: rosterSize, l: 'Paying', c: 'text-blue-600' }, { v: seasonPlayers.filter(p => p.seasonProfiles[selectedSeason]?.feeWaived).length, l: 'Waived', c: 'text-amber-600' }, { v: unassignedPlayers.length, l: 'Unassigned', c: 'text-slate-400' }].map((s, i) => (
              <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center"><p className={`text-2xl font-black ${s.c}`}>{s.v}</p><p className="text-[10px] font-bold text-slate-400 uppercase">{s.l}</p></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><Users size={16} className="text-blue-600" /> {selectedSeason} Roster</h3>
                {!isFinalized && <button onClick={() => setShowPlayerForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[10px] font-black rounded-lg hover:bg-blue-700"><Plus size={12} /> New Player</button>}
              </div>
              {seasonPlayers.length === 0 ? <div className="text-center py-10 text-slate-400 font-bold text-xs border-2 border-dashed border-slate-100 rounded-xl">No players assigned yet.</div> : (
                <div className="space-y-2">{seasonPlayers.map(p => {
                  const isWaived = p.seasonProfiles[selectedSeason]?.feeWaived;
                  return (<div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${isWaived ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                    <div className="flex items-center gap-2.5"><span className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center text-xs font-black">{p.jerseyNumber || '?'}</span><div><p className="text-xs font-bold text-slate-800">{p.firstName} {p.lastName}</p>{isWaived && <span className="text-[9px] font-black text-amber-600 uppercase">Fee Waived</span>}</div></div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggleWaiver(p.id, isWaived)} disabled={isFinalized} className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${isWaived ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'} disabled:opacity-50`}>{isWaived ? 'Waived' : 'Waive'}</button>
                      {!isFinalized && <button onClick={() => handleRemoveFromSeason(p)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>}
                    </div>
                  </div>);
                })}</div>
              )}
            </div>
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-3"><UserPlus size={16} className="text-blue-600" /> Assign Existing</h3>
              <p className="text-[10px] text-slate-400 font-bold mb-3">Players not yet in {selectedSeason}.</p>
              {unassignedPlayers.length === 0 ? <div className="text-center py-8 text-slate-400 font-bold text-xs">All players are assigned.</div> : (<>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">{unassignedPlayers.map(p => (
                  <button key={p.id} onClick={() => selectedPlayers.includes(p.id) ? setSelectedPlayers(selectedPlayers.filter(id => id !== p.id)) : setSelectedPlayers([...selectedPlayers, p.id])}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-all text-left ${selectedPlayers.includes(p.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}>
                    <div className="flex items-center gap-2"><span className="w-6 h-6 rounded bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-black">{p.jerseyNumber || '?'}</span><span className="font-bold text-slate-700 text-xs">{p.firstName} {p.lastName}</span></div>
                    {selectedPlayers.includes(p.id) && <CheckCircle2 size={14} className="text-blue-600" />}
                  </button>
                ))}</div>
                {selectedPlayers.length > 0 && <button onClick={handleImportRoster} disabled={isSaving} className="mt-3 w-full py-2.5 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 text-xs disabled:opacity-50">Assign {selectedPlayers.length} Player{selectedPlayers.length !== 1 && 's'}</button>}
              </>)}
              {!isFinalized && <div className="mt-4 pt-4 border-t border-slate-100"><button onClick={() => setShowPlayerForm(true)} className="w-full py-2.5 border-2 border-dashed border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"><Plus size={14} /> Create New Player</button></div>}
            </div>
          </div>
        </div>
      )}

      {/* PROJECTIONS TAB */}
      {activeTab === 'projections' && projections && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm"><p className="text-[10px] font-bold text-slate-400 uppercase">Avg Budgeted</p><p className="text-xl font-black text-slate-800 mt-1">{formatMoney(projections.totalBudgeted)}</p></div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm"><p className="text-[10px] font-bold text-slate-400 uppercase">Avg Actual Spend</p><p className="text-xl font-black text-slate-800 mt-1">{formatMoney(projections.totalActualAvg)}</p></div>
            {!isFinalized && projections.suggestedItems.length > 0 && (
              <div className="bg-violet-50 p-4 rounded-2xl border border-violet-200 shadow-sm flex flex-col justify-center">
                <button onClick={handleApplySuggestions} className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5"><Sparkles size={14} /> Apply {projections.pastSeasons[0]?.id} Template</button>
              </div>
            )}
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4"><BarChart3 size={16} className="text-violet-600" /> Expense Analysis</h3>
            <div className="space-y-3">{BUDGET_CATEGORIES.filter(c => c.type === 'expense').map(cat => {
              const p = projections.categoryProjections[cat.code];
              if (!p || (p.avgBudgeted === 0 && p.avgActual === 0)) return null;
              const maxVal = Math.max(p.avgBudgeted, p.avgActual, 1);
              const isOver = p.variance > 5;
              return (<div key={cat.code} className="bg-slate-50 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-slate-700">{cat.name}</span><span className={`text-[10px] font-black ${isOver ? 'text-red-500' : p.variance < -10 ? 'text-emerald-500' : 'text-slate-400'}`}>{p.variance > 0 ? '+' : ''}{p.variance.toFixed(0)}%</span></div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400 w-16">Budgeted</span><div className="flex-grow h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{ width: `${(p.avgBudgeted / maxVal) * 100}%` }} /></div><span className="text-[10px] font-bold w-16 text-right text-slate-600">{formatMoney(p.avgBudgeted)}</span></div>
                  <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400 w-16">Actual</span><div className="flex-grow h-2 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${isOver ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${(p.avgActual / maxVal) * 100}%` }} /></div><span className={`text-[10px] font-bold w-16 text-right ${isOver ? 'text-red-600' : 'text-slate-600'}`}>{formatMoney(p.avgActual)}</span></div>
                </div>
                {isOver && <div className="mt-2 flex items-start gap-1.5"><Lightbulb size={11} className="text-amber-500 shrink-0 mt-0.5" /><p className="text-[10px] text-amber-700 font-medium">Consider budgeting ~{formatMoney(p.suggested)}.</p></div>}
              </div>);
            })}</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4"><TrendingUp size={16} className="text-emerald-600" /> Income History</h3>
            <div className="space-y-2">{BUDGET_CATEGORIES.filter(c => c.type === 'income').map(cat => {
              const p = projections.categoryProjections[cat.code];
              if (!p || (p.avgBudgeted === 0 && p.avgActual === 0)) return null;
              return (<div key={cat.code} className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl"><div><span className="text-xs font-bold text-slate-700">{cat.name}</span><p className="text-[10px] text-slate-400">Avg received: {formatMoney(p.avgActual)}</p></div><span className="text-sm font-black text-emerald-600">{formatMoney(p.avgBudgeted)}</span></div>);
            })}</div>
          </div>
        </div>
      )}

      {/* NEW SEASON MODAL */}
      {showNewSeasonModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-black text-slate-800 mb-4">New Season</h3>
            <form onSubmit={handleCreateSeason} className="space-y-4">
              <input autoFocus required type="text" placeholder="e.g. 2026-2027" value={newSeasonName} onChange={(e) => setNewSeasonName(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowNewSeasonModal(false)} className="flex-1 py-3 text-slate-500 font-bold rounded-xl hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 disabled:opacity-50">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PlayerFormModal show={showPlayerForm} onClose={() => setShowPlayerForm(false)} onSubmit={handleAddNewPlayer} isSubmitting={isSubmittingPlayer} selectedSeason={selectedSeason} />
    </div>
  );
}