import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Save, Landmark, Loader2, Lock, Unlock, 
  Users, CheckCircle2, AlertCircle, TrendingUp 
} from 'lucide-react';
import { 
  doc, getDoc, getDocs, setDoc, updateDoc, 
  collection, query, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

// ADDED PROPS: seasons, setSelectedSeason, refreshSeasons
export default function BudgetView({ selectedSeason, formatMoney, seasons, setSelectedSeason, refreshSeasons }) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  
  // Budget State
  const [rosterSize, setRosterSize] = useState(12);
  const [bufferPercent, setBufferPercent] = useState(5);
  const [expenseItems, setExpenseItems] = useState([]);
  
  // Roster Migration State
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  // New Season State
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Load Season/Budget Data
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

        // 2. Load Players available for import
        const pSnap = await getDocs(query(collection(db, "players")));
        const allPlayers = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter out players already in this season profile to avoid double imports
        setAvailablePlayers(allPlayers.filter(p => !p.seasonProfiles?.[selectedSeason]));
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedSeason]);

  // --- MATH LOGIC ---
  const totalItemized = expenseItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const bufferAmount = totalItemized * (bufferPercent / 100);
  const grandTotal = totalItemized + bufferAmount;
  const rawFee = rosterSize > 0 ? (grandTotal / rosterSize) : 0;
  // Round UP to the nearest $50 increment
  const roundedBaseFee = Math.ceil(rawFee / 50) * 50;

  // --- HANDLERS ---
  const handleSaveBudget = async (finalize = false) => {
    if (finalize && !window.confirm("Finalizing will lock this budget and the fee. Proceed?")) return;
    
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

      if (finalize) setIsFinalized(true);
      
      // FIX: Force the global season state to refresh so the rest of the app knows the budget is locked!
      await refreshSeasons(); 
      
      alert(finalize ? "Budget Finalized!" : "Draft Saved.");
    } catch (error) {
      alert("Save failed.");
    } finally {
      setIsSaving(false);
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
      
      setAvailablePlayers(prev => prev.filter(p => !selectedPlayers.includes(p.id)));
      setSelectedPlayers([]);
      alert(`Imported ${promises.length} players to ${selectedSeason}.`);
    } catch (e) { alert("Import failed."); }
    finally { setIsSaving(false); }
  };

  const handleCreateSeason = async (e) => {
    e.preventDefault();
    if (!newSeasonName.trim()) return;
    
    const formattedName = newSeasonName.trim();
    if (seasons.some(s => s.id === formattedName)) {
      alert("This season name already exists!");
      return;
    }

    setIsSaving(true);
    try {
      // Initialize a fresh default season document in the database
      await setDoc(doc(db, 'seasons', formattedName), {
        name: formattedName,
        expectedRosterSize: 12,
        bufferPercent: 5,
        itemizedExpenses: [{ id: Date.now(), label: '', amount: 0 }],
        totalProjectedExpenses: 0,
        calculatedBaseFee: 0,
        isFinalized: false,
        createdAt: serverTimestamp()
      });
      
      await refreshSeasons(); // Tell the App to fetch the new season list
      setSelectedSeason(formattedName); // Auto-switch to the newly created season
      setShowNewSeasonModal(false);
      setNewSeasonName('');
    } catch (error) {
      console.error(error);
      alert("Failed to create season.");
    } finally {
      setIsSaving(false);
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
              <h2 className="text-2xl font-black text-slate-900 leading-tight">{selectedSeason} Season</h2>
              <button 
                onClick={() => setShowNewSeasonModal(true)} 
                className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-1 transition-colors"
              >
                <Plus size={14}/> New Season
              </button>
            </div>
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded mt-1 inline-block ${isFinalized ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
              {isFinalized ? 'Finalized' : 'Draft Mode'}
            </span>
          </div>
        </div>
        {!isFinalized && (
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => handleSaveBudget(false)} disabled={isSaving} className="flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50">Save Draft</button>
            <button onClick={() => handleSaveBudget(true)} disabled={isSaving} className="flex-1 md:flex-none px-5 py-2.5 rounded-xl font-black text-white bg-slate-900 hover:bg-slate-800 shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50">
              <CheckCircle2 size={18}/> Finalize
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: EXPENSES & ROSTER IMPORT */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* ITEMIZATION */}
          <div className={`bg-white p-8 rounded-3xl border border-slate-200 shadow-sm ${isFinalized ? 'opacity-80 pointer-events-none' : ''}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><Landmark size={20} className="text-blue-600"/> Itemized Expenses</h3>
              {!isFinalized && <button onClick={() => setExpenseItems([...expenseItems, { id: Date.now(), label: '', amount: 0 }])} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">Add Line Item</button>}
            </div>
            <div className="space-y-3">
              {expenseItems.map((item, index) => (
                <div key={item.id} className="flex gap-3 items-center group">
                  <input placeholder="e.g. Tournament Registration" value={item.label} onChange={(e) => {
                    const newItems = [...expenseItems];
                    newItems[index].label = e.target.value;
                    setExpenseItems(newItems);
                  }} className="flex-grow border border-slate-200 rounded-xl p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  <div className="relative w-36">
                    <span className="absolute left-4 top-3.5 text-slate-400 font-bold">$</span>
                    <input type="number" value={item.amount} onChange={(e) => {
                      const newItems = [...expenseItems];
                      newItems[index].amount = e.target.value;
                      setExpenseItems(newItems);
                    }} className="w-full border border-slate-200 rounded-xl p-3 pl-8 text-sm font-black outline-none" />
                  </div>
                  {!isFinalized && <button onClick={() => setExpenseItems(expenseItems.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>}
                </div>
              ))}
            </div>
          </div>

          {/* ROSTER IMPORT */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 mb-2"><Users size={20} className="text-blue-600"/> Roster Migration</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">Select players to roll over to {selectedSeason}</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
              {availablePlayers.length > 0 ? availablePlayers.map(p => (
                <button 
                  key={p.id} 
                  onClick={() => selectedPlayers.includes(p.id) ? setSelectedPlayers(selectedPlayers.filter(id => id !== p.id)) : setSelectedPlayers([...selectedPlayers, p.id])}
                  className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${selectedPlayers.includes(p.id) ? 'border-blue-600 bg-blue-50' : 'border-slate-50 bg-slate-50 hover:border-slate-200'}`}
                >
                  <span className="font-bold text-slate-700 text-sm">{p.firstName} {p.lastName}</span>
                  {selectedPlayers.includes(p.id) && <CheckCircle2 size={16} className="text-blue-600" />}
                </button>
              )) : <div className="col-span-full py-10 text-center text-slate-400 font-bold italic border-2 border-dashed border-slate-100 rounded-2xl">All known players are already in this season profile.</div>}
            </div>

            {selectedPlayers.length > 0 && (
              <button onClick={handleImportRoster} disabled={isSaving} className="mt-6 w-full py-4 bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-100 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50">
                <Plus size={20}/> Import {selectedPlayers.length} Players to {selectedSeason}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT: LIVE CALCULATOR */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-2xl sticky top-6 overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={120}/></div>
            
            <h3 className="text-xl font-black mb-8 border-b border-slate-800 pb-4">Fee Calculator</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Target Roster Size</label>
                <input type="number" value={rosterSize} disabled={isFinalized} onChange={(e) => setRosterSize(e.target.value)} className="w-full bg-slate-800 border-none rounded-2xl p-4 font-black text-2xl text-white outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Contingency Buffer</label>
                  <span className="text-[10px] font-black text-blue-400">{bufferPercent}%</span>
                </div>
                <input type="range" min="0" max="25" step="1" value={bufferPercent} disabled={isFinalized} onChange={(e) => setBufferPercent(e.target.value)} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-800">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-slate-500">Subtotal</span>
                  <span>{formatMoney(totalItemized)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-slate-500">Buffer</span>
                  <span className="text-amber-400">+{formatMoney(bufferAmount)}</span>
                </div>
              </div>

              <div className="mt-8 bg-blue-600 rounded-3xl p-8 text-center relative shadow-inner">
                <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-2">Rounded Team Fee</p>
                <h2 className="text-5xl font-black text-white tracking-tighter">{formatMoney(roundedBaseFee)}</h2>
                <div className="mt-4 pt-4 border-t border-blue-500/50">
                   <p className="text-[10px] text-blue-200 font-bold">Actual Cost: {formatMoney(rawFee)}</p>
                   <p className="text-[10px] text-blue-200/60 mt-1 italic">Nearest $50 increment applied</p>
                </div>
              </div>
              
              {isFinalized && (
                <div className="flex items-center gap-2 bg-slate-800/50 p-4 rounded-2xl text-amber-500">
                  <AlertCircle size={16}/>
                  <p className="text-[10px] font-bold uppercase tracking-tight">Budget locked. No further edits allowed.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- CREATE NEW SEASON MODAL --- */}
      {showNewSeasonModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-800 mb-2">Create New Season</h3>
            <p className="text-xs text-slate-500 mb-6 font-medium">Enter the season format (e.g., 2026-2027)</p>
            
            <form onSubmit={handleCreateSeason} className="space-y-4">
              <input 
                autoFocus
                required
                type="text" 
                placeholder="2026-2027" 
                value={newSeasonName} 
                onChange={e => setNewSeasonName(e.target.value)} 
                className="w-full border border-slate-200 rounded-xl p-3 font-bold focus:ring-2 focus:ring-blue-500 outline-none" 
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewSeasonModal(false)} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all shadow-lg disabled:opacity-50">
                  {isSaving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}