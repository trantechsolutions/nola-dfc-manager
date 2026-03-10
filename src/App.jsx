import { useEffect, useState, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import { 
  LayoutDashboard, ReceiptText, Wallet, Users, 
  Calendar, Plus, Settings, LogOut, Sparkles, ChevronDown, Building2, Shield, ListTree,
  CalendarRange, Wand2, FileText, UserPlus
} from 'lucide-react';

// Views
import LoginView from './views/LoginView';
import TeamOverviewView from './views/TeamOverviewView';
import SponsorsView from './views/SponsorsView';
import LedgerView from './views/LedgerView';
import BudgetView from './views/BudgetView';
import InsightsView from './views/InsightsView';
import ScheduleView from './views/ScheduleView';
import ParentView from './views/ParentView';
import PublicCalendarView from './views/PublicCalendarView';
import ClubDashboard from './views/ClubDashboard';
import TeamList from './views/TeamList';
import ClubSettings from './views/ClubSettings';
import ClubCalendarView from './views/ClubCalendarView';
import TeamOnboarding from './views/TeamOnboarding';
import DocumentManager from './views/DocumentManager';
import UserManagement from './views/UserManagement';
import TeamUserManagement from './views/TeamUserManagement';

// Components
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
import { useTeamContext } from './hooks/useTeamContext';
import { PERMISSIONS } from './utils/roles';

const NAV_ICON_MAP = {
  dashboard: LayoutDashboard,
  ledger: ReceiptText,
  budget: Settings,
  sponsors: Wallet,
  insights: Sparkles,
  schedule: Calendar,
  'club-overview': Building2,
  'club-teams': ListTree,
  'club-calendar': CalendarRange,
  'club-settings': Shield,
  'club-onboard': Wand2,
  'club-users': UserPlus,
  'team-users': Users,
  documents: FileText,
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentView = location.pathname.replace('/', '') || 'dashboard';

  const [user, setUser] = useState(null);
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  // Data State
  const [players, setPlayers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [playerFinancials, setPlayerFinancials] = useState({});
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

  // ── TEAM CONTEXT ──
  const { 
    userRoles, club, teams, selectedTeam, selectedTeamId, setSelectedTeamId,
    effectiveRole, isStaff, isClubAdmin, navItems: roleNavItems, can,
    loading: contextLoading, refreshContext,
  } = useTeamContext(user);

  const role = isStaff ? 'manager' : 'parent';

  // ── PARENT TEAM DETECTION ──
  // Parents have no roles so selectedTeamId is null. We derive their team
  // from the player roster so useSoccerYear can fetch the correct team_seasons
  // (and therefore the correct isFinalized status).
  const myPlayers = useMemo(() => {
    if (!user || role === 'manager') return [];
    return players.filter(p => 
      p.guardians?.some(g => g.email?.toLowerCase() === user.email.toLowerCase())
    );
  }, [players, user, role]);

  const parentTeamId = useMemo(() => {
    if (isStaff || selectedTeamId) return null; // staff already has a team
    // Find first player whose guardian email matches this user
    const myPlayer = players.find(p => 
      p.guardians?.some(g => g.email?.toLowerCase() === user?.email?.toLowerCase()) && p.teamId
    );
    return myPlayer?.teamId || null;
  }, [isStaff, selectedTeamId, players, user]);

  // Use the staff's selected team OR the parent's derived team for season lookup
  const effectiveTeamId = selectedTeamId || parentTeamId;

  // ── SEASON CONTEXT (uses effectiveTeamId so parents get team_seasons too) ──
  const { seasons, selectedSeason, setSelectedSeason, currentSeasonData, currentTeamSeason, refreshSeasons } = useSoccerYear(user, effectiveTeamId);

  // ── SCHEDULE ──
  const { events, blackoutDates, toggleBlackout } = useSchedule(user, selectedTeam);

  // ── DATA FETCHING ──
  const fetchData = async () => {
    try {
      const pData = selectedTeamId
        ? await supabaseService.getPlayersByTeam(selectedTeamId)
        : await supabaseService.getAllPlayers();
      const tData = await supabaseService.getAllTransactions();

      const tsId = currentTeamSeason?.id || null;
      let fData = {};
      try {
        fData = await supabaseService.getPlayerFinancials(selectedSeason, tsId);
      } catch (e) {
        console.warn('Could not fetch player_financials view:', e.message);
      }

      setPlayers(pData);
      setTransactions(tData);
      setPlayerFinancials(fData);
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

  // ── FILTERED DATA ──
  const seasonalPlayers = useMemo(() => {
    let filtered = players.filter(p => p.seasonProfiles?.[selectedSeason] && p.status !== 'archived');
    if (selectedTeamId) {
      filtered = filtered.filter(p => !p.teamId || p.teamId === selectedTeamId);
    }
    return filtered;
  }, [players, selectedSeason, selectedTeamId]);

  const archivedPlayers = useMemo(() => 
    players.filter(p => p.status === 'archived'),
  [players]);

  const seasonalTransactions = useMemo(() => {
    let filtered = transactions.filter(tx => tx.seasonId === selectedSeason);
    if (currentTeamSeason?.id) {
      filtered = filtered.filter(tx => 
        tx.teamSeasonId === currentTeamSeason.id || !tx.teamSeasonId
      );
    }
    return filtered;
  }, [transactions, selectedSeason, currentTeamSeason]);

  // ── HOOKS ──
  const teamSeasonId = currentTeamSeason?.id || currentSeasonData?.teamSeasonId || null;

  const { calculatePlayerFinancials, handleWaterfallCredit, revertWaterfall } = useFinance(
    selectedSeason, seasonalPlayers, currentSeasonData?.isFinalized, teamSeasonId, currentSeasonData, playerFinancials
  );

  const { handleSavePlayer, handleArchivePlayer, handleToggleWaiveFee } = usePlayerManager(
    fetchData, club?.id || null, selectedTeamId
  );

  const { handleSaveTransaction, handleDeleteTransaction } = useLedgerManager(
    fetchData, selectedSeason, teamSeasonId
  );

  // ── AUTH LISTENER ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) fetchData();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) fetchData();
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-fetch when team changes
  useEffect(() => {
    if (user && selectedTeamId) {
      setLoading(true);
      fetchData();
    }
  }, [selectedTeamId]);

  // Re-fetch financials when team season resolves or season changes
  useEffect(() => {
    if (user && selectedSeason) {
      const tsId = currentTeamSeason?.id || null;
      supabaseService.getPlayerFinancials(selectedSeason, tsId)
        .then(fData => setPlayerFinancials(fData || {}))
        .catch(e => {
          console.warn('Financials refresh failed:', e.message);
          setPlayerFinancials({});
        });
    }
  }, [currentTeamSeason?.id, selectedSeason]);

  // ── COMPUTED ──
  const teamBalance = seasonalTransactions.reduce((acc, tx) => (tx.cleared && !tx.waterfallBatchId) ? acc + tx.amount : acc, 0);
  const totalExpenses = seasonalTransactions.reduce((acc, tx) => tx.amount < 0 ? acc + Math.abs(tx.amount) : acc, 0);
  const formatMoney = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (loading || contextLoading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-300 animate-pulse">LOADING...</div>;

  // ── PUBLIC / UNAUTHENTICATED ──
  if (!user) {
    return (
      <Routes>
        <Route path="/calendar" element={<PublicCalendarView events={events} blackoutDates={blackoutDates} onBack={() => navigate('/')} />} />
        <Route path="*" element={
          <div className="relative">
            <LoginView />
            <button onClick={() => navigate('/calendar')} className="absolute top-4 right-4 bg-white/20 px-4 py-2 rounded-xl text-white font-bold">📅 Calendar</button>
          </div>
        } />
      </Routes>
    );
  }

  // ── NAV ──
  const clubNavItems = isClubAdmin ? [
    { id: 'club-overview', label: 'Club Overview', icon: Building2, section: 'club' },
    { id: 'club-teams', label: 'Teams', icon: ListTree, section: 'club' },
    { id: 'club-calendar', label: 'Club Calendar', icon: CalendarRange, section: 'club' },
    { id: 'club-users', label: 'Users', icon: UserPlus, section: 'club' },
    { id: 'club-settings', label: 'Settings', icon: Shield, section: 'club' },
  ] : [];

  const NAV_LABELS = { dashboard: 'Team Overview', 'team-users': 'Team Users', documents: 'Documents' };

  const teamNavItems = isStaff
    ? [
        ...roleNavItems.map(id => ({
          id,
          label: NAV_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1),
          icon: NAV_ICON_MAP[id] || LayoutDashboard,
          section: 'team',
        })),
        ...(can(PERMISSIONS.TEAM_VIEW_ROSTER) ? [{ id: 'documents', label: 'Documents', icon: FileText, section: 'team' }] : []),
      ]
    : [
        { id: 'dashboard', label: 'My Player', icon: Users, section: 'team' },
        { id: 'schedule', label: 'Schedule', icon: Calendar, section: 'team' },
      ];

  const navItemsFull = [...clubNavItems, ...teamNavItems];
  const canEditSchedule = can(PERMISSIONS.TEAM_EDIT_SCHEDULE);
  const canEditLedger = can(PERMISSIONS.TEAM_EDIT_LEDGER);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col sticky top-0 h-screen">
        <div className="p-6">
          <h1 className="text-xl font-black tracking-tighter uppercase">{club?.name || 'NOLA DFC'}</h1>

          {teams.length > 1 && (
            <div className="mt-3 relative">
              <button onClick={() => setShowTeamPicker(!showTeamPicker)}
                className="w-full p-2.5 bg-slate-800 rounded-xl text-left flex items-center justify-between hover:bg-slate-700 transition-colors">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Team</p>
                  <p className="text-sm font-bold text-blue-400 truncate">{selectedTeam?.name || 'Select Team'}</p>
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${showTeamPicker ? 'rotate-180' : ''}`} />
              </button>
              {showTeamPicker && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                  {teams.map(t => (
                    <button key={t.id} onClick={() => { setSelectedTeamId(t.id); setShowTeamPicker(false); }}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-700 transition-colors ${t.id === selectedTeamId ? 'bg-slate-700' : ''}`}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.colorPrimary || '#3b82f6' }} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{t.name}</p>
                        <p className="text-[9px] text-slate-400">{t.ageGroup} · {t.gender} · {t.tier}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {teams.length === 1 && (
            <div className="mt-3 p-2.5 bg-slate-800 rounded-xl">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Team</p>
              <p className="text-sm font-bold text-blue-400">{selectedTeam?.name}</p>
            </div>
          )}

          <div className="mt-2 p-2.5 bg-slate-800 rounded-xl">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Season</p>
            <select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-full bg-transparent border-none text-blue-400 font-bold text-sm p-0 focus:ring-0 cursor-pointer">
              {seasons.map(s => <option key={s.id} value={s.id} className="text-slate-900">{s.id}</option>)}
            </select>
          </div>
        </div>

        <nav className="flex-grow px-4 space-y-1 overflow-y-auto">
          {clubNavItems.length > 0 && (
            <>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-4 pt-2 pb-1">Club</p>
              {clubNavItems.map(item => (
                <button key={item.id} onClick={() => navigate(`/${item.id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                    currentView === item.id ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20' : 'text-slate-400 hover:bg-slate-800'
                  }`}>
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </button>
              ))}
              <div className="border-t border-slate-800 my-2" />
            </>
          )}

          {selectedTeam && (
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-4 pt-1 pb-1">{selectedTeam.name}</p>
          )}
          {teamNavItems.map(item => (
            <button key={item.id} onClick={() => navigate(`/${item.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                currentView === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800'
              }`}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="px-4 py-2 mb-2">
            <p className="text-[10px] font-bold text-slate-500 truncate">{user.email}</p>
            <p className="text-[9px] font-bold text-blue-400 uppercase">{effectiveRole.replace('_', ' ')}</p>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-red-400 hover:bg-red-900/20 transition-all">
            <LogOut size={20} />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* ═══ MOBILE HEADER ═══ */}
      <header className="md:hidden bg-white border-b border-slate-200 p-4 sticky top-0 z-40">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-black text-slate-900 text-sm">{club?.name || 'NOLA DFC'}</h1>
            {selectedTeam && <p className="text-[10px] font-bold text-blue-600">{selectedTeam.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            {teams.length > 1 && (
              <select value={selectedTeamId || ''} onChange={(e) => setSelectedTeamId(e.target.value)}
                className="text-[10px] font-bold text-slate-600 bg-slate-50 rounded-lg border-none px-2 py-1 max-w-[120px]">
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}
              className="text-[10px] font-bold text-blue-600 bg-slate-50 rounded-lg border-none px-2 py-1">
              {seasons.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
            <button onClick={() => supabase.auth.signOut()} className="text-red-500"><LogOut size={16}/></button>
          </div>
        </div>
      </header>

      {/* ═══ CONTENT ═══ */}
      <main className="flex-grow p-4 md:p-8 pb-32 md:pb-8 max-w-6xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {isClubAdmin && (
            <>
              <Route path="/club-overview" element={
                <ClubDashboard club={club} teams={teams} seasons={seasons} selectedSeason={selectedSeason}
                  onSelectTeam={(teamId) => { setSelectedTeamId(teamId); navigate('/dashboard'); }} />
              } />
              <Route path="/club-teams" element={
                <TeamList club={club} teams={teams} formatMoney={formatMoney}
                  onSelectTeam={(teamId) => { setSelectedTeamId(teamId); navigate('/dashboard'); }}
                  showToast={showToast} showConfirm={showConfirm} refreshContext={refreshContext} />
              } />
              <Route path="/club-settings" element={
                <ClubSettings club={club} teams={teams} userRoles={userRoles}
                  showToast={showToast} showConfirm={showConfirm} refreshContext={refreshContext} />
              } />
              <Route path="/club-calendar" element={<ClubCalendarView club={club} teams={teams} />} />
              <Route path="/club-onboard" element={
                <TeamOnboarding club={club} seasons={seasons} showToast={showToast}
                  onComplete={(teamId) => { refreshContext(); if (teamId) { setSelectedTeamId(teamId); navigate('/dashboard'); } else { navigate('/club-teams'); } }}
                  onCancel={() => navigate('/club-teams')} />
              } />
              <Route path="/club-users" element={
                <UserManagement club={club} teams={teams} showToast={showToast} showConfirm={showConfirm} refreshContext={refreshContext} />
              } />
            </>
          )}

          {/* ── TEAM ROUTES ── */}
          <Route path="/dashboard" element={
            isStaff ? (
              <TeamOverviewView 
                players={seasonalPlayers} archivedPlayers={archivedPlayers} teamBalance={teamBalance} 
                totalExpenses={totalExpenses} formatMoney={formatMoney} selectedSeasonData={currentSeasonData} 
                transactions={seasonalTransactions} calculatePlayerFinancials={calculatePlayerFinancials}
                onAddPlayer={() => { setPlayerToEdit(null); setShowPlayerForm(true); }} 
                onEditPlayer={(p) => { setPlayerToEdit(p); setShowPlayerForm(true); }} 
                onViewPlayer={(p) => { setPlayerToView(p); setShowPlayerModal(true); }} 
                onToggleWaive={(pId, state) => handleToggleWaiveFee(pId, selectedSeason, state)} 
              />
            ) : (
              <ParentView players={myPlayers} transactions={seasonalTransactions} 
                calculatePlayerFinancials={calculatePlayerFinancials} formatMoney={formatMoney} 
                teams={teams} seasons={seasons} selectedSeason={selectedSeason} 
                setSelectedSeason={setSelectedSeason} currentSeasonData={currentSeasonData} />
            )
          } />
          
          <Route path="/schedule" element={
            <ScheduleView events={events} blackoutDates={blackoutDates} 
              onToggleBlackout={canEditSchedule ? toggleBlackout : null} 
              selectedTeam={selectedTeam} refreshContext={refreshContext} showToast={showToast} />
          } />

          {isStaff && (
            <>
              {can(PERMISSIONS.TEAM_VIEW_LEDGER) && (
                <Route path="/ledger" element={
                  <LedgerView transactions={seasonalTransactions} formatMoney={formatMoney} 
                    onAddTx={canEditLedger ? () => { setTxToEdit(null); setShowTxForm(true); } : null} 
                    onEditTx={canEditLedger ? (tx) => { setTxToEdit(tx); setShowTxForm(true); } : null} 
                    onDeleteTx={canEditLedger ? async (id) => { const ok = await showConfirm("Delete this transaction?"); if (ok) { await handleDeleteTransaction(id); showToast("Transaction deleted"); } } : null} />
                } />
              )}
              {can(PERMISSIONS.TEAM_VIEW_BUDGET) && (
                <Route path="/budget" element={
                  <BudgetView selectedSeason={selectedSeason} formatMoney={formatMoney} seasons={seasons} 
                    setSelectedSeason={setSelectedSeason} refreshSeasons={refreshSeasons} 
                    showToast={showToast} showConfirm={showConfirm} onDataChange={fetchData}
                    selectedTeamId={selectedTeamId} currentTeamSeason={currentTeamSeason} />
                } />
              )}
              {can(PERMISSIONS.TEAM_VIEW_INSIGHTS) && (
                <Route path="/insights" element={
                  <InsightsView transactions={seasonalTransactions} players={seasonalPlayers} selectedSeason={selectedSeason} 
                    currentSeasonData={currentSeasonData} calculatePlayerFinancials={calculatePlayerFinancials} 
                    formatMoney={formatMoney} events={events} />
                } />
              )}
              {can(PERMISSIONS.TEAM_VIEW_SPONSORS) && (
                <Route path="/sponsors" element={
                  <SponsorsView 
                    transactions={seasonalTransactions} selectedSeason={selectedSeason} formatMoney={formatMoney} 
                    currentSeasonData={currentSeasonData}
                    onDistribute={(can(PERMISSIONS.TEAM_EDIT_SPONSORS) && currentSeasonData?.isFinalized) ? async (amt, title, pId, originalId, category) => { 
                      try { await handleWaterfallCredit(amt, title, pId, originalId, category); await fetchData(); showToast("Funds Distributed!"); } 
                      catch (error) { showToast(error.message, true); } 
                    } : null}
                    onReset={(can(PERMISSIONS.TEAM_EDIT_SPONSORS) && currentSeasonData?.isFinalized) ? async (batchId, originalTxId) => { 
                      await revertWaterfall(batchId, originalTxId); await fetchData(); showToast("Distribution Reverted."); 
                    } : null}
                    seasonalPlayers={seasonalPlayers} seasons={seasons} />
                } />
              )}
              {can(PERMISSIONS.TEAM_VIEW_ROSTER) && (
                <Route path="/documents" element={
                  <DocumentManager players={seasonalPlayers} selectedSeason={selectedSeason}
                    club={club} selectedTeam={selectedTeam}
                    formatMoney={formatMoney} showToast={showToast} showConfirm={showConfirm}
                    can={can} PERMISSIONS={PERMISSIONS} />
                } />
              )}
              {can(PERMISSIONS.TEAM_MANAGE_USERS) && (
                <Route path="/team-users" element={
                  <TeamUserManagement selectedTeam={selectedTeam} showToast={showToast} showConfirm={showConfirm} />
                } />
              )}
            </>
          )}

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-20 flex items-center justify-around px-2 z-50">
        {isClubAdmin && (
          <button onClick={() => navigate('/club-overview')} className={`flex flex-col items-center gap-1 flex-1 ${currentView === 'club-overview' ? 'text-violet-600' : 'text-slate-400'}`}>
            <Building2 size={20} strokeWidth={currentView === 'club-overview' ? 3 : 2} />
            <span className="text-[9px] font-bold">Club</span>
          </button>
        )}
        {teamNavItems.slice(0, isClubAdmin ? 4 : 5).map(item => (
          <button key={item.id} onClick={() => navigate(`/${item.id}`)} className={`flex flex-col items-center gap-1 flex-1 ${currentView === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
            <item.icon size={20} strokeWidth={currentView === item.id ? 3 : 2} />
            <span className="text-[9px] font-bold">{item.label}</span>
          </button>
        ))}
        {canEditLedger && (
          <button onClick={() => { setTxToEdit(null); setShowTxForm(true); }} className="mb-10 bg-slate-900 text-white p-4 rounded-full shadow-xl border-4 border-white active:scale-90 transition-transform">
            <Plus size={24} strokeWidth={3} />
          </button>
        )}
      </nav>

      {/* ═══ MODALS ═══ */}
      {showPlayerModal && playerToView && (
        <PlayerModal 
          player={playerToView} 
          selectedSeason={selectedSeason}
          stats={calculatePlayerFinancials(playerToView, seasonalTransactions)}
          onClose={() => { setShowPlayerModal(false); setPlayerToView(null); }}
          onToggleCompliance={async (id, field, currentState) => { 
            setPlayerToView(prev => ({ ...prev, [field]: !currentState })); 
            await supabaseService.updatePlayerField(id, field, !currentState); fetchData(); 
          }}
          formatMoney={formatMoney}
        />
      )}

      <PlayerFormModal show={showPlayerForm} initialData={playerToEdit} selectedSeason={selectedSeason}
        onSubmit={async (data) => { await handleSavePlayer(data); setShowPlayerForm(false); showToast(playerToEdit ? "Player Updated" : "Player Added"); }} 
        onArchive={async (id) => { const ok = await showConfirm("Archive this player?"); if (ok) { await handleArchivePlayer(id); setShowPlayerForm(false); showToast("Player Archived"); } }} 
        onClose={() => setShowPlayerForm(false)} />
      
      <TransactionModal show={showTxForm} initialData={txToEdit} 
        onSubmit={async (data) => { const r = await handleSaveTransaction(data); if (r && r.success === false) { showToast(r.error, true); } else { setShowTxForm(false); showToast(txToEdit ? "Transaction Updated" : "Transaction Added"); } }} 
        onClose={() => setShowTxForm(false)} players={seasonalPlayers} />

      {confirmDialog && <ConfirmModal message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={confirmDialog.onCancel} />}

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 text-white px-6 py-4 rounded-2xl shadow-2xl font-black z-[200] border-2 flex items-center gap-3 ${toast.isError ? 'bg-red-600 border-red-400' : 'bg-slate-900 border-slate-700'}`}>
          {toast.isError && <Settings size={20} className="animate-spin" />}
          <span>{toast.msg}</span>
          {toast.action && (
            <button onClick={() => { toast.action.onClick(); setToast(null); }}
              className="ml-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-black uppercase tracking-wider transition-all">
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;