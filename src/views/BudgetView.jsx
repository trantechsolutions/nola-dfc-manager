import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Lock, Unlock, 
  Users, CheckCircle2, TrendingUp, Copy, ChevronDown, ChevronRight
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';

// ─────────────────────────────────────────────
// CATEGORY DEFINITIONS (Matches the Budget Template)
// ─────────────────────────────────────────────
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
const INCOME_CODES  = BUDGET_CATEGORIES.filter(c => c.type === 'income').map(c => c.code);

export default function BudgetView({ selectedSeason, formatMoney, seasons, setSelectedSeason, refreshSeasons, showToast, showConfirm }) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);

  // Budget State
  const [budgetItems, setBudgetItems] = useState([]);
  const [rosterSize, setRosterSize] = useState(0);
  const [bufferPercent, setBufferPercent] = useState(5);
  const [cloneSource, setCloneSource] = useState('');

  // Roster & Player State
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');

  // Transaction State (for Actuals)
  const [seasonTransactions, setSeasonTransactions] = useState([]);

  // Collapsed category tracking
  const [collapsedCats, setCollapsedCats] = useState({});
  const toggleCollapse = (code) => setCollapsedCats(prev => ({ ...prev, [code]: !prev[code] }));

  // ─────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch season data
      const allSeasons = await supabaseService.getAllSeasons();
      const seasonData = allSeasons.find(s => s.id === selectedSeason);

      if (seasonData) {
        setRosterSize(seasonData.expectedRosterSize || 13);
        setBufferPercent(seasonData.bufferPercent ?? 5);
        setIsFinalized(seasonData.isFinalized || false);
      } else {
        setRosterSize(13);
        setBufferPercent(5);
        setIsFinalized(false);
      }

      // Fetch budget items from the budget_items table
      const items = await supabaseService.getBudgetItems(selectedSeason);
      setBudgetItems(items.length > 0 ? items : []);

      // Fetch players (already reshaped with seasonProfiles and guardians)
      setAvailablePlayers(await supabaseService.getAllPlayers());

      // Fetch transactions for actuals
      const allTx = await supabaseService.getAllTransactions();
      setSeasonTransactions(allTx.filter(tx => tx.seasonId === selectedSeason));
    } catch (error) {
      console.error('Budget fetch error:', error);
      if (showToast) showToast('Failed to fetch budget data.', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedSeason]);

  // Auto-count non-waived roster size
  useEffect(() => {
    const activeInSeason = availablePlayers.filter(p =>
      p.seasonProfiles?.[selectedSeason] &&
      p.seasonProfiles[selectedSeason].feeWaived !== true
    ).length;
    if (!isFinalized && activeInSeason > 0) setRosterSize(activeInSeason);
  }, [availablePlayers, selectedSeason, isFinalized]);

  // ─────────────────────────────────────────────
  // COMPUTED VALUES
  // ─────────────────────────────────────────────
  const itemsByCategory = useMemo(() => {
    const map = {};
    BUDGET_CATEGORIES.forEach(cat => {
      map[cat.code] = budgetItems.filter(item => item.category === cat.code);
    });
    return map;
  }, [budgetItems]);

  // Subtotals per category
  const subtotals = useMemo(() => {
    const result = {};
    BUDGET_CATEGORIES.forEach(cat => {
      const items = itemsByCategory[cat.code] || [];
      result[cat.code] = {
        income:        items.reduce((s, i) => s + (Number(i.income) || 0), 0),
        expensesFall:  items.reduce((s, i) => s + (Number(i.expensesFall) || 0), 0),
        expensesSpring:items.reduce((s, i) => s + (Number(i.expensesSpring) || 0), 0),
      };
      result[cat.code].net = result[cat.code].income - result[cat.code].expensesFall - result[cat.code].expensesSpring;
    });
    return result;
  }, [itemsByCategory]);

  // Grand totals
  const grandTotals = useMemo(() => {
    let income = 0, expFall = 0, expSpring = 0;
    Object.values(subtotals).forEach(s => {
      income += s.income;
      expFall += s.expensesFall;
      expSpring += s.expensesSpring;
    });
    return { income, expensesFall: expFall, expensesSpring: expSpring, net: income - expFall - expSpring };
  }, [subtotals]);

  // Actuals from real transactions (non-waterfall, cleared)
  const actuals = useMemo(() => {
    const map = {};
    seasonTransactions.forEach(tx => {
      const cleared = tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';
      if (!cleared || tx.waterfallBatchId) return;
      const cat = tx.category || '';
      if (!map[cat]) map[cat] = 0;
      map[cat] += Number(tx.amount || 0);
    });
    return map;
  }, [seasonTransactions]);

  const totalActual = useMemo(() => Object.values(actuals).reduce((s, v) => s + v, 0), [actuals]);

  // Fee calculation (expenses only)
  const totalExpenseAmount = useMemo(() => {
    return EXPENSE_CODES.reduce((sum, code) => {
      return sum + (subtotals[code]?.expensesFall || 0) + (subtotals[code]?.expensesSpring || 0);
    }, 0);
  }, [subtotals]);

  const bufferAmount = totalExpenseAmount * (bufferPercent / 100);
  const feeGrandTotal = totalExpenseAmount + bufferAmount;
  const rawFee = rosterSize > 0 ? feeGrandTotal / rosterSize : 0;
  const roundedBaseFee = Math.ceil(rawFee / 50) * 50;

  // ─────────────────────────────────────────────
  // ITEM HANDLERS
  // ─────────────────────────────────────────────
  const addItem = (categoryCode) => {
    setBudgetItems(prev => [...prev, {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category: categoryCode,
      label: '',
      income: 0,
      expensesFall: 0,
      expensesSpring: 0,
    }]);
  };

  const updateItem = (itemId, field, value) => {
    setBudgetItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, [field]: field === 'label' ? value : (parseFloat(value) || 0) } : item
    ));
  };

  const removeItem = (itemId) => {
    setBudgetItems(prev => prev.filter(item => item.id !== itemId));
  };

  // ─────────────────────────────────────────────
  // SAVE / FINALIZE
  // ─────────────────────────────────────────────
  const handleSaveBudget = async (finalize = false) => {
    if (finalize) {
      const confirmed = await showConfirm('Finalizing will lock this budget and apply the fee to all players. Proceed?');
      if (!confirmed) return;
    }

    setIsSaving(true);
    try {
      // Save season metadata
      await supabaseService.saveSeason(selectedSeason, {
        name: selectedSeason,
        expectedRosterSize: Number(rosterSize),
        bufferPercent: Number(bufferPercent),
        totalProjectedExpenses: totalExpenseAmount,
        totalProjectedIncome: grandTotals.income,
        calculatedBaseFee: roundedBaseFee,
        isFinalized: finalize || isFinalized,
      });

      // Save budget items to their own table
      await supabaseService.saveBudgetItems(selectedSeason, budgetItems);

      if (finalize) {
        const activePlayers = availablePlayers.filter(p => p.seasonProfiles?.[selectedSeason]);
        if (activePlayers.length > 0) {
          await Promise.all(activePlayers.map(p =>
            supabaseService.updateSeasonProfile(p.id, selectedSeason, { baseFee: roundedBaseFee })
          ));
        }
        setIsFinalized(true);
      }

      await refreshSeasons();
      if (finalize) fetchData();
      if (showToast) showToast(finalize ? 'Budget Finalized & Fees Applied!' : 'Draft Saved.');
    } catch (error) {
      console.error('Save failed:', error);
      if (showToast) showToast('Save failed.', true);
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────────────────────────────────────
  // CLONE / NEW SEASON / ROSTER / WAIVER
  // ─────────────────────────────────────────────
  const handleCloneBudget = async (sourceId) => {
    if (!sourceId) return;
    const confirmed = await showConfirm(`Overwrite current items with data from ${sourceId}?`);
    if (!confirmed) return;
    try {
      const items = await supabaseService.getBudgetItems(sourceId);
      if (items.length > 0) {
        setBudgetItems(items.map(item => ({ ...item, id: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })));
      }
      // Also clone buffer percent from the source season
      const allSeasons = await supabaseService.getAllSeasons();
      const sourceSeason = allSeasons.find(s => s.id === sourceId);
      if (sourceSeason) setBufferPercent(sourceSeason.bufferPercent || 5);
      if (showToast) showToast(`Template cloned from ${sourceId}`);
    } catch (e) {
      if (showToast) showToast('Cloning failed.', true);
    }
  };

  const handleImportRoster = async () => {
    if (selectedPlayers.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(selectedPlayers.map(pId =>
        supabaseService.addPlayerToSeason(pId, selectedSeason, {
          baseFee: roundedBaseFee, feeWaived: false, status: 'active'
        })
      ));
      setSelectedPlayers([]);
      await fetchData();
      if (showToast) showToast(`Imported ${selectedPlayers.length} players.`);
    } catch (e) {
      if (showToast) showToast('Import failed.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSeason = async (e) => {
    e.preventDefault();
    if (!newSeasonName.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.saveSeason(newSeasonName.trim(), {
        name: newSeasonName.trim(), isFinalized: false
      });
      await refreshSeasons();
      setSelectedSeason(newSeasonName.trim());
      setShowNewSeasonModal(false);
      setNewSeasonName('');
      if (showToast) showToast(`Created season ${newSeasonName.trim()}`);
    } catch (e) {
      if (showToast) showToast('Failed to create season.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleWaiver = async (playerId, currentWaivedStatus) => {
    if (isFinalized) { if (showToast) showToast('Cannot modify waivers on a finalized budget.', true); return; }
    setAvailablePlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, seasonProfiles: { ...p.seasonProfiles, [selectedSeason]: { ...p.seasonProfiles[selectedSeason], feeWaived: !currentWaivedStatus } } } : p
    ));
    try {
      await supabaseService.updateSeasonProfile(playerId, selectedSeason, { feeWaived: !currentWaivedStatus });
      if (showToast) showToast(!currentWaivedStatus ? 'Player fee waived.' : 'Player fee reinstated.', false, { label: 'Undo', onClick: () => handleToggleWaiver(playerId, !currentWaivedStatus) });
    } catch (error) {
      if (showToast) showToast('Failed to update waiver.', true);
      fetchData();
    }
  };

  // ─────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────
  const fmt = (val) => {
    if (val === 0) return <span className="text-slate-300">$&mdash;</span>;
    const isNeg = val < 0;
    return <span className={isNeg ? 'text-red-500' : ''}>{formatMoney(Math.abs(val))}</span>;
  };

  const fmtNet = (val) => {
    if (val === 0) return <span className="text-slate-300">$&mdash;</span>;
    const isNeg = val < 0;
    return <span className={isNeg ? 'text-red-500 font-black' : 'font-black'}>{isNeg ? `(${formatMoney(Math.abs(val))})` : formatMoney(val)}</span>;
  };

  const renderCategorySection = (cat) => {
    const items = itemsByCategory[cat.code] || [];
    const sub = subtotals[cat.code];
    const isExpense = cat.type === 'expense';
    const isCollapsed = collapsedCats[cat.code];
    const actual = actuals[cat.code] || 0;

    return (
      <React.Fragment key={cat.code}>
        {/* Category Header */}
        <tr 
          className="bg-slate-800 text-white cursor-pointer select-none"
          onClick={() => toggleCollapse(cat.code)}
        >
          <td colSpan={6} className="px-4 py-2.5">
            <div className="font-black text-xs uppercase tracking-widest flex items-center gap-2">
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              {cat.name}
              <span className="ml-auto text-slate-400 text-[10px] font-medium normal-case tracking-normal">
                {items.length} item{items.length !== 1 && 's'}
              </span>
            </div>
          </td>
        </tr>

        {/* Line Items */}
        {!isCollapsed && items.map((item, idx) => {
          const itemNet = (Number(item.income) || 0) - (Number(item.expensesFall) || 0) - (Number(item.expensesSpring) || 0);
          return (
            <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              {/* Label */}
              <td className="px-4 py-2">
                {isFinalized ? (
                  <span className="text-sm text-slate-700">{cat.code} - {item.label || <span className="italic text-slate-300">Untitled</span>}</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 w-8">{cat.code}</span>
                    <input
                      type="text" placeholder="Line item label..."
                      value={item.label}
                      onChange={(e) => updateItem(item.id, 'label', e.target.value)}
                      className="flex-grow bg-transparent border-b border-slate-200 focus:border-blue-500 py-1 text-sm outline-none"
                    />
                  </div>
                )}
              </td>

              {/* Income */}
              <td className="px-3 py-2 text-right">
                {!isExpense && !isFinalized ? (
                  <input type="number" step="0.01" value={item.income || ''} placeholder="0"
                    onChange={(e) => updateItem(item.id, 'income', e.target.value)}
                    className="w-24 text-right bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-sm font-bold outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                ) : (
                  <span className="text-sm">{fmt(isExpense ? 0 : Number(item.income) || 0)}</span>
                )}
              </td>

              {/* Expenses Fall */}
              <td className="px-3 py-2 text-right">
                {isExpense && !isFinalized ? (
                  <input type="number" step="0.01" value={item.expensesFall || ''} placeholder="0"
                    onChange={(e) => updateItem(item.id, 'expensesFall', e.target.value)}
                    className="w-24 text-right bg-red-50 border border-red-200 rounded px-2 py-1 text-sm font-bold outline-none focus:ring-1 focus:ring-red-400"
                  />
                ) : (
                  <span className="text-sm">{fmt(isExpense ? -(Number(item.expensesFall) || 0) : 0)}</span>
                )}
              </td>

              {/* Expenses Spring */}
              <td className="px-3 py-2 text-right">
                {isExpense && !isFinalized ? (
                  <input type="number" step="0.01" value={item.expensesSpring || ''} placeholder="0"
                    onChange={(e) => updateItem(item.id, 'expensesSpring', e.target.value)}
                    className="w-24 text-right bg-red-50 border border-red-200 rounded px-2 py-1 text-sm font-bold outline-none focus:ring-1 focus:ring-red-400"
                  />
                ) : (
                  <span className="text-sm">{fmt(isExpense ? -(Number(item.expensesSpring) || 0) : 0)}</span>
                )}
              </td>

              {/* Net Budget */}
              <td className="px-3 py-2 text-right text-sm">
                {fmtNet(itemNet)}
              </td>

              {/* Actions (delete) or empty for finalized */}
              <td className="px-3 py-2 text-center w-16">
                {!isFinalized && (
                  <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </td>
            </tr>
          );
        })}

        {/* Add Item Row */}
        {!isCollapsed && !isFinalized && (
          <tr className="border-b border-slate-100">
            <td colSpan={6} className="px-4 py-1.5">
              <button
                onClick={() => addItem(cat.code)}
                className="text-xs font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                <Plus size={12} /> Add Line Item
              </button>
            </td>
          </tr>
        )}

        {/* Subtotal Row */}
        {!isCollapsed && (
          <tr className="bg-slate-100 font-bold border-b-2 border-slate-200">
            <td className="px-4 py-2.5 text-xs text-slate-600 italic uppercase tracking-wide">
              &gt; Sub-Total &ndash; {cat.name}
            </td>
            <td className="px-3 py-2.5 text-right text-sm">{fmtNet(sub.income)}</td>
            <td className="px-3 py-2.5 text-right text-sm">{sub.expensesFall > 0 ? <span className="text-red-500">({formatMoney(sub.expensesFall)})</span> : fmt(0)}</td>
            <td className="px-3 py-2.5 text-right text-sm">{sub.expensesSpring > 0 ? <span className="text-red-500">({formatMoney(sub.expensesSpring)})</span> : fmt(0)}</td>
            <td className="px-3 py-2.5 text-right text-sm">{fmtNet(sub.net)}</td>
            <td className="px-3 py-2.5 text-right text-sm font-black">
              {actual !== 0 ? (
                <span className={actual < 0 ? 'text-red-500' : 'text-emerald-600'}>
                  {actual < 0 ? `(${formatMoney(Math.abs(actual))})` : formatMoney(actual)}
                </span>
              ) : fmt(0)}
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse">LOADING BUDGET...</div>;

  return (
    <div className="space-y-6 pb-20">
      {/* ── HEADER ── */}
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex-col md:flex-row gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className={`p-3 rounded-2xl ${isFinalized ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {isFinalized ? <Lock size={24} /> : <Unlock size={24} />}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-slate-900">{selectedSeason}</h2>
              <button onClick={() => setShowNewSeasonModal(true)} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold hover:bg-blue-100 transition-colors">
                <Plus size={14} className="inline mr-1" /> New
              </button>
            </div>
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded mt-1 inline-block ${isFinalized ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
              {isFinalized ? 'Finalized' : 'Draft Mode'}
            </span>
          </div>
        </div>
        {!isFinalized && (
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => handleSaveBudget(false)} disabled={isSaving} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50">Save Draft</button>
            <button onClick={() => handleSaveBudget(true)} disabled={isSaving} className="px-5 py-2.5 rounded-xl font-black text-white bg-slate-900 hover:bg-slate-800 shadow-lg flex items-center gap-2 disabled:opacity-50">
              <CheckCircle2 size={18} /> Finalize
            </button>
          </div>
        )}
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Budget Table + Tools */}
        <div className="lg:col-span-2 space-y-6">

          {/* Clone Tool */}
          {!isFinalized && (
            <div className="bg-blue-600 p-6 rounded-3xl shadow-lg shadow-blue-200 text-white">
              <h3 className="font-black flex items-center gap-2 mb-4"><Copy size={18} /> Clone Previous Budget</h3>
              <div className="flex gap-3">
                <select value={cloneSource} onChange={(e) => setCloneSource(e.target.value)} className="flex-grow bg-blue-700 border-none rounded-xl p-3 text-sm font-bold text-white outline-none">
                  <option value="">Select a season to copy from...</option>
                  {seasons.filter(s => s.id !== selectedSeason).map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                </select>
                <button onClick={() => handleCloneBudget(cloneSource)} className="bg-white text-blue-600 px-6 py-3 rounded-xl font-black text-sm hover:bg-blue-50 transition-all">Clone Items</button>
              </div>
            </div>
          )}

          {/* ── BUDGET TABLE ── */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Title Bar */}
            <div className="bg-slate-900 text-white px-6 py-4">
              <h3 className="font-black text-lg tracking-tight">NOLA DFC 2015 Boys Black</h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
                Budget for {selectedSeason.replace('-', ' / ')}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[700px]">
                {/* Column Headers */}
                <thead>
                  <tr className="bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-3 w-[40%]">Description</th>
                    <th className="px-3 py-3 text-right w-[12%]">Income</th>
                    <th className="px-3 py-3 text-right w-[12%]">Exp. Fall</th>
                    <th className="px-3 py-3 text-right w-[12%]">Exp. Spring</th>
                    <th className="px-3 py-3 text-right w-[12%]">Net Budget</th>
                    <th className="px-3 py-3 text-right w-[12%]">Actual</th>
                  </tr>
                </thead>

                <tbody>
                  {/* Expense Categories */}
                  {BUDGET_CATEGORIES.filter(c => c.type === 'expense').map(renderCategorySection)}

                  {/* Income Categories */}
                  {BUDGET_CATEGORIES.filter(c => c.type === 'income').map(renderCategorySection)}

                  {/* ── GRAND TOTAL ── */}
                  <tr className="bg-slate-900 text-white font-black text-sm">
                    <td className="px-4 py-4 uppercase tracking-wide">Total</td>
                    <td className="px-3 py-4 text-right">{formatMoney(grandTotals.income)}</td>
                    <td className="px-3 py-4 text-right text-red-300">({formatMoney(grandTotals.expensesFall)})</td>
                    <td className="px-3 py-4 text-right text-red-300">({formatMoney(grandTotals.expensesSpring)})</td>
                    <td className="px-3 py-4 text-right">
                      <span className={grandTotals.net < 0 ? 'text-red-300' : 'text-emerald-300'}>
                        {grandTotals.net < 0 ? `(${formatMoney(Math.abs(grandTotals.net))})` : formatMoney(grandTotals.net)}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <span className={totalActual < 0 ? 'text-red-300' : 'text-emerald-300'}>
                        {formatMoney(totalActual)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── ROSTER IMPORT ── */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 mb-6">
              <Users size={20} className="text-blue-600" /> Add Players to Season
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
              {availablePlayers.filter(p => !p.seasonProfiles?.[selectedSeason]).map(p => (
                <button
                  key={p.id}
                  onClick={() => selectedPlayers.includes(p.id) ? setSelectedPlayers(selectedPlayers.filter(id => id !== p.id)) : setSelectedPlayers([...selectedPlayers, p.id])}
                  className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${selectedPlayers.includes(p.id) ? 'border-blue-600 bg-blue-50' : 'border-slate-50 bg-slate-50 hover:border-slate-200'}`}
                >
                  <span className="font-bold text-slate-700 text-sm">{p.firstName} {p.lastName}</span>
                  {selectedPlayers.includes(p.id) && <CheckCircle2 size={16} className="text-blue-600" />}
                </button>
              ))}
            </div>
            {selectedPlayers.length > 0 && (
              <button onClick={handleImportRoster} disabled={isSaving} className="mt-6 w-full py-4 bg-blue-600 text-white font-black rounded-2xl shadow-lg hover:bg-blue-700 transition-all">
                Import {selectedPlayers.length} Selected Players
              </button>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR: Fee Calculator + Waivers */}
        <div className="space-y-6">
          {/* ── FEE CALCULATOR ── */}
          <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={120} /></div>
            <h3 className="text-xl font-black mb-8 border-b border-slate-800 pb-4 relative z-10">Fee Calculator</h3>
            <div className="space-y-6 relative z-10">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Roster Size (Non-Waived)</label>
                <input type="number" value={rosterSize} readOnly className="w-full bg-slate-800 border-none rounded-2xl p-4 font-black text-2xl text-blue-400 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Total Projected Expenses</label>
                <p className="text-lg font-black text-red-400">{formatMoney(totalExpenseAmount)}</p>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Contingency Buffer</label>
                  <span className="text-[10px] font-black text-blue-400">{bufferPercent}%</span>
                </div>
                <input type="range" min="0" max="25" step="1" value={bufferPercent} disabled={isFinalized} onChange={(e) => setBufferPercent(Number(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>
              <div className="mt-8 bg-blue-600 rounded-3xl p-8 text-center shadow-inner">
                <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-2">Target Season Fee</p>
                <h2 className="text-5xl font-black text-white tracking-tighter">{formatMoney(roundedBaseFee)}</h2>
                <p className="text-[10px] text-blue-200 font-bold mt-4 pt-4 border-t border-blue-500/50">Actual Cost: {formatMoney(rawFee)}</p>
              </div>
            </div>
          </div>

          {/* ── FEE WAIVERS ── */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 mb-2">
              <Users size={18} className="text-blue-600" /> Fee Waivers
            </h3>
            <p className="text-xs font-bold text-slate-500 mb-4 leading-relaxed">
              Exempt specific players from the current season team fee.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
              {availablePlayers.filter(p => p.seasonProfiles?.[selectedSeason]).map(p => {
                const isWaived = p.seasonProfiles[selectedSeason].feeWaived === true;
                return (
                  <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${isWaived ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
                    <span className={`text-sm font-bold ${isWaived ? 'text-amber-700 line-through opacity-70' : 'text-slate-700'}`}>
                      {p.firstName} {p.lastName}
                    </span>
                    <button
                      onClick={() => handleToggleWaiver(p.id, isWaived)}
                      disabled={isFinalized}
                      className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                        isWaived ? 'bg-amber-500 text-white shadow-md shadow-amber-200 hover:bg-amber-600' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isWaived ? 'Revoke Waiver' : 'Waive Fee'}
                    </button>
                  </div>
                );
              })}
              {availablePlayers.filter(p => p.seasonProfiles?.[selectedSeason]).length === 0 && (
                <div className="text-center py-6 text-slate-400 font-bold text-sm">
                  No players imported into this season yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── NEW SEASON MODAL ── */}
      {showNewSeasonModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-black text-slate-800 mb-6">Create New Season</h3>
            <form onSubmit={handleCreateSeason} className="space-y-4">
              <input autoFocus required type="text" placeholder="e.g. 2026-2027" value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNewSeasonModal(false)} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}