import { useEffect, useState, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import { 
  LayoutDashboard, ReceiptText, Wallet, Users, 
  Calendar, Plus, Settings, LogOut, Sparkles
} from 'lucide-react';

// Components & Views
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Sponsors from './components/Sponsors';
import LedgerView from './views/LedgerView';
import BudgetView from './views/BudgetView';
import InsightsView from './views/InsightsView';
import ScheduleView from './views/ScheduleView';
import ParentView from './views/ParentView';
import PublicCalendarView from './views/PublicCalendarView';
import TransactionModal from './components/TransactionModal';
import PlayerFormModal from './components/PlayerFormModal';
import PlayerModal from './components/PlayerModal';
import ConfirmModal from './components/ConfirmModal';

// Services & Hooks
import { supabaseService } from './services/supabaseService';
import { useSoccerYear } from './hooks/useSoccerYear';
import { useFinance } from './hooks/useFinance';
import { useSchedule } from './hooks/useSchedule';
import { usePlayerManager } from './hooks/usePlayerManager';
import { useLedgerManager } from './hooks/useLedgerManager';

function App() {
  // ROUTING HOOKS
  const navigate = useNavigate();
  const location = useLocation();
  const currentView = location.pathname.replace('/', '') || 'dashboard';

  const [user, setUser] = useState(null);
  const [role, setRole] = useState('parent');
  
  // Data State
  const [players, setPlayers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal States
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [playerToEdit, setPlayerToEdit] = useState(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [playerToView, setPlayerToView] = useState(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [txToEdit, setTxToEdit] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Hooks
  const { seasons, selectedSeason, setSelectedSeason, currentSeasonData, refreshSeasons } = useSoccerYear(user);
  const { events, blackoutDates, toggleBlackout } = useSchedule(user);

  const fetchData = async () => {
    try {
      const [pData, tData] = await Promise.all([
        supabaseService.getAllPlayers(),
        supabaseService.getAllTransactions()
      ]);
      setPlayers(pData);
      setTransactions(tData);
    } catch (e) {
      console.error("Data fetch error", e);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, isError = false, action = null) => {
    setToast({ msg, isError, action });
    setTimeout(() => setToast(null), 4000);
  };

  const showConfirm = (message) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        onConfirm: () => { resolve(true); setConfirmDialog(null); },
        onCancel: () => { resolve(false); setConfirmDialog(null); }
      });
    });
  };

  // Logic & Filtering
  const seasonalPlayers = useMemo(() => 
    players.filter(p => p.seasonProfiles?.[selectedSeason] && p.status !== 'archived'),
  [players, selectedSeason]);

  const archivedPlayers = useMemo(() => 
    players.filter(p => p.status === 'archived'),
  [players]);

  const seasonalTransactions = useMemo(() => 
    transactions.filter(tx => tx.seasonId === selectedSeason),
  [transactions, selectedSeason]);

  const myPlayers = useMemo(() => {
    if (!user || role === 'manager') return [];
    return players.filter(p => 
      p.guardians?.some(g => g.email?.toLowerCase() === user.email.toLowerCase())
    );
  }, [players, user, role]);

  const { calculatePlayerFinancials, handleWaterfallCredit, revertWaterfall } = useFinance(
    selectedSeason, seasonalPlayers, currentSeasonData?.isFinalized
  );

  const { handleSavePlayer, handleArchivePlayer, handleToggleWaiveFee } = usePlayerManager(fetchData);
  const { handleSaveTransaction, handleDeleteTransaction } = useLedgerManager(
    fetchData, selectedSeason, handleWaterfallCredit
  );

  // ── SUPABASE AUTH LISTENER ──
  useEffect(() => {
    const ADMIN_EMAILS = ['jonny5v@gmail.com', 'lauren.willie@gmail.com'];
    
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        setRole(ADMIN_EMAILS.includes(currentUser.email) ? 'manager' : 'parent');
        fetchData();
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        setRole(ADMIN_EMAILS.includes(currentUser.email) ? 'manager' : 'parent');
        fetchData();
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const teamBalance = seasonalTransactions.reduce((acc, tx) => {
    return (tx.cleared && !tx.waterfallBatchId) ? acc + tx.amount : acc;
  }, 0);
  const totalExpenses = seasonalTransactions.reduce((acc, tx) => tx.amount < 0 ? acc + Math.abs(tx.amount) : acc, 0);
  const formatMoney = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-300">LOADING...</div>;

  // PUBLIC / UN-AUTHENTICATED ROUTES
  if (!user) {
    return (
      <Routes>
        <Route path="/calendar" element={<PublicCalendarView events={events} blackoutDates={blackoutDates} onBack={() => navigate('/')} />} />
        <Route path="*" element={
          <div className="relative">
            <Login />
            <button onClick={() => navigate('/calendar')} className="absolute top-4 right-4 bg-white/20 px-4 py-2 rounded-xl text-white font-bold">
              📅 Calendar
            </button>
          </div>
        } />
      </Routes>
    );
  }

  const navItems = role === 'manager' 
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'ledger', label: 'Ledger', icon: ReceiptText },
        { id: 'budget', label: 'Budget', icon: Settings },
        { id: 'sponsors', label: 'Sponsors', icon: Wallet },
        { id: 'insights', label: 'Insights', icon: Sparkles },
        { id: 'schedule', label: 'Schedule', icon: Calendar },
      ]
    : [
        { id: 'dashboard', label: 'My Player', icon: Users },
        { id: 'schedule', label: 'Schedule', icon: Calendar },
      ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col sticky top-0 h-screen">
        <div className="p-6">
          <h1 className="text-xl font-black tracking-tighter uppercase">NOLA DFC</h1>
          <div className="mt-4 p-3 bg-slate-800 rounded-xl">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Season</p>
            <select 
              value={selectedSeason} 
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-full bg-transparent border-none text-blue-400 font-bold text-sm p-0 focus:ring-0 cursor-pointer"
            >
              {seasons.map(s => <option key={s.id} value={s.id} className="text-slate-900">{s.id}</option>)}
            </select>
          </div>
        </div>

        <nav className="flex-grow px-4 space-y-2">
          {navItems.map(item => (
            <button key={item.id} onClick={() => navigate(`/${item.id}`)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${currentView === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800'}`}>
              <item.icon size={20} />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-red-400 hover:bg-red-900/20 transition-all">
            <LogOut size={20} />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* --- MOBILE HEADER --- */}
      <header className="md:hidden bg-white border-b border-slate-200 p-4 sticky top-0 z-40 flex justify-between items-center">
        <h1 className="font-black text-slate-900">NOLA DFC</h1>
        <div className="flex items-center gap-3">
          <select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)} className="text-xs font-bold text-blue-600 bg-slate-50 rounded-lg border-none px-2 py-1">
            {seasons.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
          </select>
          <button onClick={() => supabase.auth.signOut()} className="text-red-500"><LogOut size={18}/></button>
        </div>
      </header>

      {/* --- CONTENT AREA WITH ROUTES --- */}
      <main className="flex-grow p-4 md:p-8 pb-32 md:pb-8 max-w-6xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          <Route path="/dashboard" element={
            role === 'manager' ? (
              <Dashboard 
                players={seasonalPlayers} archivedPlayers={archivedPlayers} teamBalance={teamBalance} 
                totalExpenses={totalExpenses} formatMoney={formatMoney} selectedSeasonData={currentSeasonData} 
                transactions={seasonalTransactions} calculatePlayerFinancials={calculatePlayerFinancials}
                onAddPlayer={() => { setPlayerToEdit(null); setShowPlayerForm(true); }} 
                onEditPlayer={(p) => { setPlayerToEdit(p); setShowPlayerForm(true); }} 
                onViewPlayer={(p) => { setPlayerToView(p); setShowPlayerModal(true); }} 
                onToggleWaive={(pId, state) => handleToggleWaiveFee(pId, selectedSeason, state)} 
              />
            ) : (
              <ParentView players={myPlayers} transactions={seasonalTransactions} calculatePlayerFinancials={calculatePlayerFinancials} formatMoney={formatMoney} />
            )
          } />
          
          <Route path="/schedule" element={
             <ScheduleView events={events} blackoutDates={blackoutDates} onToggleBlackout={role === 'manager' ? toggleBlackout : null} />
          } />

          {role === 'manager' && (
            <>
              <Route path="/ledger" element={<LedgerView transactions={seasonalTransactions} formatMoney={formatMoney} onAddTx={() => { setTxToEdit(null); setShowTxForm(true); }} onEditTx={(tx) => { setTxToEdit(tx); setShowTxForm(true); }} onDeleteTx={ async (id) => {const confirmed = await showConfirm("Are you sure you want to delete this transaction? This cannot be undone."); if (confirmed) { await handleDeleteTransaction(id); showToast("Transaction deleted"); } }} />} />
              <Route path="/budget" element={<BudgetView selectedSeason={selectedSeason} formatMoney={formatMoney} seasons={seasons} setSelectedSeason={setSelectedSeason} refreshSeasons={refreshSeasons} showToast={showToast} showConfirm={showConfirm} />} />
              <Route path="/insights" element={
                <InsightsView 
                  transactions={seasonalTransactions}
                  players={seasonalPlayers}
                  selectedSeason={selectedSeason}
                  currentSeasonData={currentSeasonData}
                  calculatePlayerFinancials={calculatePlayerFinancials}
                  formatMoney={formatMoney}
                  events={events}
                />
              } />
              <Route path="/sponsors" element={
                <Sponsors 
                  transactions={seasonalTransactions} 
                  selectedSeason={selectedSeason} 
                  formatMoney={formatMoney} 
                  onDistribute={async (amt, title, pId, originalId, category) => { 
                    try { 
                      await handleWaterfallCredit(amt, title, pId, originalId, category); 
                      await fetchData(); 
                      showToast("Funds Distributed!"); 
                    } catch (error) { 
                      showToast(error.message, true); 
                    } 
                  }} 
                  onReset={async (batchId, originalTxId) => { 
                    await revertWaterfall(batchId, originalTxId); 
                    await fetchData(); 
                    showToast("Distribution Reverted."); 
                  }} 
                  seasonalPlayers={seasonalPlayers} 
                  seasons={seasons} 
                />
              } />
            </>
          )}

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      {/* --- MOBILE BOTTOM NAV --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-20 flex items-center justify-around px-2 z-50">
        {navItems.map(item => (
          <button key={item.id} onClick={() => navigate(`/${item.id}`)} className={`flex flex-col items-center gap-1 flex-1 ${currentView === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
            <item.icon size={20} strokeWidth={currentView === item.id ? 3 : 2} />
            <span className="text-[10px] font-bold">{item.label}</span>
          </button>
        ))}
        {role === 'manager' && (
          <button onClick={() => { setTxToEdit(null); setShowTxForm(true); }} className="mb-10 bg-slate-900 text-white p-4 rounded-full shadow-xl border-4 border-white active:scale-90 transition-transform">
            <Plus size={24} strokeWidth={3} />
          </button>
        )}
      </nav>

      {/* --- MODALS --- */}
      {showPlayerModal && (
        <PlayerModal 
          player={playerToView} transactions={seasonalTransactions} selectedSeason={selectedSeason} onClose={() => { setShowPlayerModal(false); setPlayerToView(null); }}
          calculateFinancials={calculatePlayerFinancials} formatMoney={formatMoney}
          onToggleCompliance={async (id, field, currentState) => { 
            setPlayerToView(prev => ({ ...prev, [field]: !currentState })); 
            await supabaseService.updatePlayerField(id, field, !currentState); 
            fetchData(); 
          }}
        />
      )}

      <PlayerFormModal 
        show={showPlayerForm} initialData={playerToEdit} selectedSeason={selectedSeason}
        onSubmit={async (data) => { await handleSavePlayer(data); setShowPlayerForm(false); showToast(playerToEdit ? "Player Updated" : "Player Added"); }} 
        onArchive={async (id) => { const confirmed = await showConfirm("Archive this player? They will be removed from active rosters."); if (confirmed) { await handleArchivePlayer(id); setShowPlayerForm(false); showToast("Player Archived"); } }} 
        onClose={() => setShowPlayerForm(false)} 
      />
      
      <TransactionModal 
        show={showTxForm} initialData={txToEdit} 
        onSubmit={async (data) => { const result = await handleSaveTransaction(data); if (result && result.success === false) { showToast(result.error, true); } else { setShowTxForm(false); showToast(txToEdit ? "Transaction Updated" : "Transaction Added"); } }} 
        onClose={() => setShowTxForm(false)} players={seasonalPlayers} 
      />

      {confirmDialog && (
        <ConfirmModal 
          message={confirmDialog.message} 
          onConfirm={confirmDialog.onConfirm} 
          onCancel={confirmDialog.onCancel} 
        />
      )}

      {/* --- TOAST --- */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 text-white px-6 py-4 rounded-2xl shadow-2xl font-black z-[200] border-2 flex items-center gap-3 ${toast.isError ? 'bg-red-600 border-red-400 shadow-red-500/20' : 'bg-slate-900 border-slate-700 shadow-slate-900/20'}`}>
          {toast.isError && <Settings size={20} className="animate-spin" />}
          <span>{toast.msg}</span>
          {toast.action && (
            <button 
              onClick={() => { toast.action.onClick(); setToast(null); }}
              className="ml-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 active:scale-95 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;