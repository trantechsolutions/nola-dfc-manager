import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Landmark, Lock, Unlock, 
  Users, CheckCircle2, AlertCircle, TrendingUp, Copy
} from 'lucide-react';
import { 
  doc, getDoc, getDocs, setDoc, updateDoc, 
  collection, query, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

export default function BudgetView({ selectedSeason, formatMoney, seasons, setSelectedSeason, refreshSeasons, showToast, showConfirm }) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  
  // Budget State
  const [rosterSize, setRosterSize] = useState(12);
  const [bufferPercent, setBufferPercent] = useState(5);
  const [expenseItems, setExpenseItems] = useState([]);
  const [cloneSource, setCloneSource] = useState('');
  
  // Roster Management State
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');

  // 1. Fetch Season Data and Player List
  const fetchData = async () => {
    setLoading(true);
    try {
      const seasonRef = doc(db, 'seasons', selectedSeason);
      const seasonSnap = await getDoc(seasonRef);

      if (seasonSnap.exists()) {
        const data = seasonSnap.data();
        setRosterSize(data.expectedRosterSize || 12);
        setBufferPercent(data.bufferPercent ?? 5);
        setIsFinalized(data.isFinalized || false);
        setExpenseItems(data.itemizedExpenses || [{ id: Date.now(), label: '', amount: 0 }]);
      } else {
        setRosterSize(12);
        setBufferPercent(5);
        setIsFinalized(false);
        setExpenseItems([{ id: Date.now(), label: '', amount: 0 }]);
      }

      const pSnap = await getDocs(query(collection(db, "players")));
      const allPlayers = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAvailablePlayers(allPlayers);
    } catch (error) {
      console.error("Fetch error:", error);
      if (showToast) showToast("Failed to fetch budget data.", true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSeason]);

  // 2. Auto-calculate Roster Size based on actual active players
  useEffect(() => {
    const activeInSeason = availablePlayers.filter(p => 
      p.seasonProfiles?.[selectedSeason] && 
      p.seasonProfiles[selectedSeason].feeWaived !== true
    ).length;
    
    // Update count if there are players assigned and budget isn't locked
    if (!isFinalized && activeInSeason > 0) {
      setRosterSize(activeInSeason);
    } else if (!isFinalized && activeInSeason === 0) {
      setRosterSize(0);
    }
  }, [availablePlayers, selectedSeason, isFinalized]);

  // --- MATH LOGIC ---
  const totalItemized = expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const bufferAmount = totalItemized * (bufferPercent / 100);
  const grandTotal = totalItemized + bufferAmount;
  const rawFee = rosterSize > 0 ? (grandTotal / rosterSize) : 0;
  const roundedBaseFee = Math.ceil(rawFee / 50) * 50;

  // --- HANDLERS ---
  const handleSaveBudget = async (finalize = false) => {
    if (finalize) {
      const confirmed = await showConfirm("Finalizing will lock this budget and the fee. Proceed?");
      if (!confirmed) return;
    }
    
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'seasons', selectedSeason), {
        name: selectedSeason,
        expectedRosterSize: Number(rosterSize),
        bufferPercent: Number(bufferPercent),
        itemizedExpenses: expenseItems,
        totalProjectedExpenses: totalItemized,
        calculatedBaseFee: roundedBaseFee,
        isFinalized: finalize || isFinalized,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (finalize) {
        const activePlayers = availablePlayers.filter(p => p.seasonProfiles?.[selectedSeason]);
        
        if (activePlayers.length > 0) {
          const promises = activePlayers.map(p => {
            return updateDoc(doc(db, "players", p.id), {
              // This strictly targets their fee without touching their waiver status
              [`seasonProfiles.${selectedSeason}.baseFee`]: roundedBaseFee
            });
          });
          await Promise.all(promises);
        }
        setIsFinalized(true);
      }

      await refreshSeasons(); 
      // Trigger a fresh fetch so the waiver panel and internal state reflect the new DB reality
      if (finalize) fetchData(); 
      
      if (showToast) showToast(finalize ? "Budget Finalized & Fees Applied!" : "Draft Saved.");
    } catch (error) {
      if (showToast) showToast("Save failed.", true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloneBudget = async (sourceId) => {
    if (!sourceId) return;
    const confirmed = await showConfirm(`Overwrite current items with data from ${sourceId}?`);
    if (!confirmed) return;

    try {
      const sourceRef = doc(db, 'seasons', sourceId);
      const snap = await getDoc(sourceRef);
      if (snap.exists()) {
        const data = snap.data();
        setExpenseItems(data.itemizedExpenses || []);
        setBufferPercent(data.bufferPercent || 5);
        if (showToast) showToast(`Template cloned from ${sourceId}`);
      }
    } catch (e) { 
      if (showToast) showToast("Cloning failed.", true); 
    }
  };

  const handleImportRoster = async () => {
    if (selectedPlayers.length === 0) return;
    setIsSaving(true);
    try {
      const promises = selectedPlayers.map(pId => 
        updateDoc(doc(db, "players", pId), {
          [`seasonProfiles.${selectedSeason}`]: {
            status: 'active',
            baseFee: roundedBaseFee,
            feeWaived: false
          }
        })
      );
      await Promise.all(promises);
      setSelectedPlayers([]);
      await fetchData(); 
      if (showToast) showToast(`Imported ${promises.length} players.`);
    } catch (e) { 
      if (showToast) showToast("Import failed.", true); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleCreateSeason = async (e) => {
    e.preventDefault();
    if (!newSeasonName.trim()) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'seasons', newSeasonName.trim()), {
        name: newSeasonName.trim(),
        isFinalized: false,
        createdAt: serverTimestamp()
      });
      await refreshSeasons();
      setSelectedSeason(newSeasonName.trim());
      setShowNewSeasonModal(false);
      setNewSeasonName('');
      if (showToast) showToast(`Created season ${newSeasonName.trim()}`);
    } catch (e) { 
      if (showToast) showToast("Failed to create season.", true); 
    } finally { 
      setIsSaving(false); 
    }
  };

  // --- WAIVER HANDLER WITH UNDO ---
  const handleToggleWaiver = async (playerId, currentWaivedStatus) => {
    if (isFinalized) {
      if (showToast) showToast("Cannot modify waivers on a finalized budget.", true);
      return;
    }

    // 1. Optimistic UI Update (Makes the math change instantly)
    const updatedPlayers = availablePlayers.map(p => {
      if (p.id === playerId) {
        return {
          ...p,
          seasonProfiles: {
            ...p.seasonProfiles,
            [selectedSeason]: {
              ...p.seasonProfiles[selectedSeason],
              feeWaived: !currentWaivedStatus
            }
          }
        };
      }
      return p;
    });
    setAvailablePlayers(updatedPlayers);

    // 2. Background Database Update
    try {
      await updateDoc(doc(db, "players", playerId), {
        [`seasonProfiles.${selectedSeason}.feeWaived`]: !currentWaivedStatus
      });
      
      // 3. Fire the Toast with the integrated UNDO action
      if (showToast) {
        showToast(
          !currentWaivedStatus ? "Player fee waived." : "Player fee reinstated.", 
          false, 
          {
            label: "Undo",
            onClick: () => handleToggleWaiver(playerId, !currentWaivedStatus) // Reverses the action
          }
        );
      }
    } catch (error) {
      if (showToast) showToast("Failed to update waiver.", true);
      fetchData(); // Revert UI if it fails
    }
  };

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse">LOADING BUDGET...</div>;

  return (
    <div className="space-y-6 pb-20">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex-col md:flex-row gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className={`p-3 rounded-2xl ${isFinalized ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {isFinalized ? <Lock size={24}/> : <Unlock size={24}/>}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-slate-900">{selectedSeason}</h2>
              <button onClick={() => setShowNewSeasonModal(true)} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold hover:bg-blue-100 transition-colors">
                <Plus size={14} className="inline mr-1"/> New
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
              <CheckCircle2 size={18}/> Finalize
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* CLONE TOOL */}
          {!isFinalized && (
            <div className="bg-blue-600 p-6 rounded-3xl shadow-lg shadow-blue-200 text-white">
              <h3 className="font-black flex items-center gap-2 mb-4"><Copy size={18}/> Clone Previous Budget</h3>
              <div className="flex gap-3">
                <select 
                  value={cloneSource} 
                  onChange={(e) => setCloneSource(e.target.value)}
                  className="flex-grow bg-blue-700 border-none rounded-xl p-3 text-sm font-bold text-white outline-none"
                >
                  <option value="">Select a season to copy from...</option>
                  {seasons.filter(s => s.id !== selectedSeason).map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                </select>
                <button onClick={() => handleCloneBudget(cloneSource)} className="bg-white text-blue-600 px-6 py-3 rounded-xl font-black text-sm hover:bg-blue-50 transition-all">Clone Items</button>
              </div>
            </div>
          )}

          {/* ITEMIZATION */}
          <div className={`bg-white p-8 rounded-3xl border border-slate-200 shadow-sm ${isFinalized ? 'opacity-80 pointer-events-none' : ''}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><Landmark size={20} className="text-blue-600"/> Expense Items</h3>
              {!isFinalized && <button onClick={() => setExpenseItems([...expenseItems, { id: Date.now(), label: '', amount: 0 }])} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100">Add Item</button>}
            </div>
            <div className="space-y-3">
              {expenseItems.map((item, index) => (
                <div key={item.id} className="flex gap-3 items-center">
                  <input placeholder="Item Label" value={item.label} onChange={(e) => {
                    const newItems = [...expenseItems];
                    newItems[index].label = e.target.value;
                    setExpenseItems(newItems);
                  }} className="flex-grow border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="relative w-36">
                    <span className="absolute left-4 top-3.5 text-slate-400 font-bold">$</span>
                    <input type="number" value={item.amount} onChange={(e) => {
                      const newItems = [...expenseItems];
                      newItems[index].amount = e.target.value;
                      setExpenseItems(newItems);
                    }} className="w-full border border-slate-200 rounded-xl p-3 pl-8 text-sm font-black outline-none" />
                  </div>
                  {!isFinalized && <button onClick={() => setExpenseItems(expenseItems.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={20}/></button>}
                </div>
              ))}
            </div>
          </div>

          {/* ROSTER MIGRATION */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 mb-6"><Users size={20} className="text-blue-600"/> Add Players to Season</h3>
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

        {/* CALCULATOR SIDEBAR */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={120}/></div>
            <h3 className="text-xl font-black mb-8 border-b border-slate-800 pb-4 relative z-10">Fee Calculator</h3>
            <div className="space-y-6 relative z-10">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Roster Size (Auto-Counted)</label>
                <input type="number" value={rosterSize} readOnly className="w-full bg-slate-800 border-none rounded-2xl p-4 font-black text-2xl text-blue-400 outline-none" />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Contingency Buffer</label>
                  <span className="text-[10px] font-black text-blue-400">{bufferPercent}%</span>
                </div>
                <input type="range" min="0" max="25" step="1" value={bufferPercent} disabled={isFinalized} onChange={(e) => setBufferPercent(e.target.value)} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>
              <div className="mt-8 bg-blue-600 rounded-3xl p-8 text-center shadow-inner">
                <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-2">Target Season Fee</p>
                <h2 className="text-5xl font-black text-white tracking-tighter">{formatMoney(roundedBaseFee)}</h2>
                <p className="text-[10px] text-blue-200 font-bold mt-4 pt-4 border-t border-blue-500/50">Actual Cost: {formatMoney(rawFee)}</p>
              </div>
            </div>
          </div>

          {/* WAIVER MANAGEMENT LIST */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 mb-2">
              <Users size={18} className="text-blue-600"/> Fee Waivers
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
                        isWaived 
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-200 hover:bg-amber-600' 
                          : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
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

      {/* NEW SEASON MODAL */}
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