import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import { supabase } from './supabase';
import {
  LayoutDashboard,
  Users,
  Eye,
  Calendar,
  Sparkles,
  Building2,
  Shield,
  ListTree,
  SlidersHorizontal,
  FileSpreadsheet,
  ReceiptText,
  Handshake,
  Sun,
  Moon,
  Monitor,
  ClipboardCheck,
} from 'lucide-react';
import { useT } from './i18n/I18nContext';
import { useTheme } from './theme/ThemeContext';

// Views
import LoginView from './views/general/LoginView';
import PublicCalendarView from './views/general/PublicCalendarView';

// Components
import DesktopSidebar from './components/DesktopSidebar';
import MobileHeader from './components/MobileHeader';
import MobileMenu from './components/MobileMenu';
import MobileBottomNav from './components/MobileBottomNav';
import ErrorBoundary from './components/ErrorBoundary';
import AppRoutes from './components/AppRoutes';
import NotificationPermissionBanner from './components/NotificationPermissionBanner';
import { NavigationContext } from './context/NavigationContext';
import { DataContext } from './context/DataContext';
import { FinanceContext } from './context/FinanceContext';
import { ScheduleContext } from './context/ScheduleContext';

// Services & Hooks
import { supabaseService } from './services/supabaseService';
import { useSoccerYear } from './hooks/useSoccerYear';
import { useFinance } from './hooks/useFinance';
import { useSchedule } from './hooks/useSchedule';
import { usePlayerManager } from './hooks/usePlayerManager';
import { useLedgerManager } from './hooks/useLedgerManager';
import { useTeamContext } from './hooks/useTeamContext';
import { useAppData } from './hooks/useAppData';
import { useModalState } from './hooks/useModalState';
import { PERMISSIONS } from './utils/roles';
import { useCategoryManager } from './hooks/useCategoryManager';
import { useAccounts } from './hooks/useAccounts';
import { isSingleTeamMode } from './utils/singleTeamMode';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentView = location.pathname.replace('/', '') || 'dashboard';
  const currentSearch = location.search;
  const { t, locale, toggleLocale } = useT();
  const { theme, cycleTheme } = useTheme();
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  const [user, setUser] = useState(null);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── TEAM CONTEXT ──
  const {
    userRoles,
    club,
    teams,
    selectedTeam,
    selectedTeamId,
    setSelectedTeamId,
    effectiveRole,
    isStaff,
    isClubAdmin,
    isSuperAdmin,
    can,
    loading: contextLoading,
    refreshContext,
  } = useTeamContext(user);

  const {
    showPlayerForm,
    setShowPlayerForm,
    playerToEdit,
    setPlayerToEdit,
    showPlayerModal,
    setShowPlayerModal,
    playerToView,
    setPlayerToView,
    showTxForm,
    setShowTxForm,
    txToEdit,
    setTxToEdit,
    confirmDialog,
    impersonatingAs,
    setImpersonatingAs,
    toast,
    setToast,
    mobileMenuOpen,
    setMobileMenuOpen,
    sidebarSettingsOpen,
    setSidebarSettingsOpen,
    showToast,
    showConfirm,
  } = useModalState();

  // When impersonating, act as parent regardless of actual role
  const viewingAsParent = !!impersonatingAs;
  const effectiveIsStaff = viewingAsParent ? false : isStaff;
  const role = effectiveIsStaff ? 'manager' : 'parent';

  // ── PARENT TEAM DETECTION ──
  // Parents have no roles so selectedTeamId is null. We derive their team
  // from the player roster so useSoccerYear can fetch the correct team_seasons
  // (and therefore the correct isFinalized status).
  // parentTeamId starts null, is updated after useAppData resolves players.
  const [parentTeamId, setParentTeamId] = useState(null);
  const [parentTeam, setParentTeam] = useState(null);

  // Use the staff's selected team OR the parent's derived team for season lookup
  const effectiveTeamId = selectedTeamId || parentTeamId;

  // ── SEASON CONTEXT (uses effectiveTeamId so parents get team_seasons too) ──
  const {
    seasons,
    teamSeasons,
    selectedSeason,
    setSelectedSeason,
    currentSeasonData,
    currentTeamSeason,
    refreshSeasons,
  } = useSoccerYear(user, effectiveTeamId);

  const {
    players,
    transactions,
    playerFinancials,
    teamEvents,
    collapsedTeamEvents,
    fetchData,
    updateTeamEvent,
    refreshTeamEvents,
  } = useAppData({
    userEmail: user?.email || null,
    selectedTeamId,
    parentTeamId,
    selectedSeason,
    setSelectedSeason,
    currentTeamSeason,
    teamSeasons,
  });

  // Update parentTeamId after players resolve (two-pass: null → resolved)
  useEffect(() => {
    if (viewingAsParent) {
      setParentTeamId(impersonatingAs.teamId || null);
      return;
    }
    if (isStaff || selectedTeamId) {
      setParentTeamId(null);
      return;
    }
    const myPlayer = players.find(
      (p) => p.guardians?.some((g) => g.email?.toLowerCase() === user?.email?.toLowerCase()) && p.teamId,
    );
    setParentTeamId(myPlayer?.teamId || null);
  }, [isStaff, selectedTeamId, players, user, viewingAsParent, impersonatingAs]);

  // For parents, fetch the team object directly since useTeamContext returns
  // an empty teams array for users with no roles.
  useEffect(() => {
    if (effectiveIsStaff || !parentTeamId) {
      setParentTeam(null);
      return;
    }
    supabaseService
      .getTeam(parentTeamId)
      .then(setParentTeam)
      .catch(() => setParentTeam(null));
  }, [effectiveIsStaff, parentTeamId]);

  const effectiveTeam = selectedTeam || parentTeam;
  const { events, blackoutDates, toggleBlackout, syncCalendar } = useSchedule(user, effectiveTeam);

  // ── FILTERED DATA ──
  const myPlayers = useMemo(() => {
    if (viewingAsParent) {
      const guardianEmails = new Set(
        (impersonatingAs.guardians || []).map((g) => g.email?.toLowerCase()).filter(Boolean),
      );
      if (guardianEmails.size === 0) return [impersonatingAs];
      return players.filter((p) => p.guardians?.some((g) => guardianEmails.has(g.email?.toLowerCase())));
    }
    if (!user || role === 'manager') return [];
    return players.filter((p) => p.guardians?.some((g) => g.email?.toLowerCase() === user.email.toLowerCase()));
  }, [players, user, role, viewingAsParent, impersonatingAs]);

  const seasonalPlayers = useMemo(() => {
    if (!selectedSeason) return players.filter((p) => p.status !== 'archived');
    let filtered = players.filter((p) => p.seasonProfiles?.[selectedSeason] && p.status !== 'archived');
    if (selectedTeamId) {
      filtered = filtered.filter((p) => p.teamId === selectedTeamId);
    }
    return filtered;
  }, [players, selectedSeason, selectedTeamId]);

  const archivedPlayers = useMemo(() => players.filter((p) => p.status === 'archived'), [players]);

  const seasonalTransactions = useMemo(() => {
    if (!selectedSeason) return transactions;
    let filtered = transactions.filter((tx) => tx.seasonId === selectedSeason);
    if (currentTeamSeason?.id) {
      filtered = filtered.filter((tx) => tx.teamSeasonId === currentTeamSeason.id || !tx.teamSeasonId);
    }
    return filtered;
  }, [transactions, selectedSeason, currentTeamSeason]);

  // ── HOOKS ──
  const teamSeasonId = currentTeamSeason?.id || currentSeasonData?.teamSeasonId || null;

  const { calculatePlayerFinancials, handleWaterfallCredit, revertWaterfall } = useFinance(
    selectedSeason,
    seasonalPlayers,
    currentSeasonData?.isFinalized,
    teamSeasonId,
    currentSeasonData,
    playerFinancials,
  );

  const { handleSavePlayer, handleArchivePlayer, handleToggleWaiveFee } = usePlayerManager(
    fetchData,
    club?.id || null,
    selectedTeamId,
  );

  const { handleSaveTransaction, handleDeleteTransaction, handleBulkUpload } = useLedgerManager(
    fetchData,
    selectedSeason,
    teamSeasonId,
  );

  const {
    customCategories,
    categoryLabels,
    categoryColors,
    categoryOptions,
    saveCategory,
    deleteCategory,
    isSaving: isCategorySaving,
  } = useCategoryManager(club?.id);

  const {
    accounts,
    activeAccounts,
    accountsByHolding,
    accountMap,
    saveAccount,
    deleteAccount,
    isSaving: isAccountSaving,
  } = useAccounts(selectedTeamId);

  // ── AUTH LISTENER ──
  const lastUserIdRef = useRef(null);
  useEffect(() => {
    const bootstrap = async (authUser) => {
      await supabaseService.ensureUserProfile(authUser);
      await supabaseService.claimMyInvitations();
      // setUser AFTER claim so useTeamContext's role fetch sees claimed rows.
      setUser(authUser);
      setLoading(false);
      fetchData();
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      if (currentUser) {
        lastUserIdRef.current = currentUser.id;
        bootstrap(currentUser);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Only react to actual sign-in / sign-out transitions.
      // TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED, etc. must NOT
      // trigger a loading state or data refetch — that causes the
      // "random reload" the user sees every ~60 minutes.
      if (event === 'SIGNED_IN') {
        const incoming = session?.user || null;
        // Skip if it's the same user (e.g. token refresh on tab refocus)
        if (!incoming || incoming.id === lastUserIdRef.current) return;
        lastUserIdRef.current = incoming.id;
        setLoading(true);
        bootstrap(incoming);
      } else if (event === 'SIGNED_OUT') {
        lastUserIdRef.current = null;
        setUser(null);
        setLoading(false);
      }
      // All other events (TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED,
      // PASSWORD_RECOVERY) are intentionally ignored here.
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-fetch when team or season context changes
  useEffect(() => {
    if (user && (selectedTeamId || parentTeamId)) {
      fetchData();
    }
  }, [selectedTeamId, parentTeamId, selectedSeason, currentTeamSeason?.id]);

  // ── COMPUTED ──
  const teamBalance = seasonalTransactions.reduce((acc, tx) => {
    if (!tx.cleared || tx.waterfallBatchId || tx.category === 'TRF') return acc;
    if (tx.accountId && accountMap[tx.accountId]?.holding === 'none') return acc;
    return acc + tx.amount;
  }, 0);
  const totalExpenses = seasonalTransactions.reduce((acc, tx) => {
    if (!tx.cleared || tx.waterfallBatchId || tx.category === 'TRF' || tx.amount >= 0) return acc;
    if (tx.accountId && accountMap[tx.accountId]?.holding === 'none') return acc;
    return acc + Math.abs(tx.amount);
  }, 0);
  const formatMoney = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  // ── SCHEDULE HANDLERS ──
  const handleSyncCalendar = async () => {
    const count = await syncCalendar();
    await refreshTeamEvents(selectedTeamId || parentTeamId);
    showToast(t('toast.syncedEvents', { n: count }));
  };

  const handleTeamEventTypeChange = async (dbEventId, newType) => {
    await supabaseService.updateTeamEventType(dbEventId, newType);
    updateTeamEvent(dbEventId, { eventType: newType, typeLocked: true });
  };

  const handleSaveExpense = async (txData) => {
    await handleSaveTransaction(txData);
  };

  const handleToggleCleared = async (txId, cleared) => {
    await supabaseService.updateTransaction(txId, { cleared });
    fetchData();
  };

  const handleDeleteExpense = async (txId) => {
    await handleDeleteTransaction(txId);
  };

  // ── LOADING STATES ──
  if (loading || contextLoading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-200 dark:border-blue-800 border-t-blue-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{t('common.loading')}</p>
        </div>
      </div>
    );

  // ── PUBLIC / UNAUTHENTICATED ──
  if (!user) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/calendar/:teamId?" element={<PublicCalendarView onBack={() => navigate('/')} />} />
          <Route
            path="*"
            element={
              <div className="relative">
                <LoginView />
                <button
                  onClick={() => navigate('/calendar')}
                  className="absolute top-4 right-4 bg-white/20 px-4 py-2 rounded-xl text-white font-bold"
                >
                  📅 Calendar
                </button>
              </div>
            }
          />
        </Routes>
      </ErrorBoundary>
    );
  }

  // ── NAV ──
  const singleTeam = isSingleTeamMode();

  const appNavItems =
    isSuperAdmin && !singleTeam ? [{ id: 'app-admin', label: 'App Admin', icon: Shield, section: 'app' }] : [];

  const clubNavItems =
    (isClubAdmin || isSuperAdmin) && !singleTeam
      ? [
          { id: 'club-overview', label: t('nav.overview'), icon: Building2, section: 'club' },
          { id: 'club-teams', label: t('nav.teams'), icon: ListTree, section: 'club' },
          { id: 'club-players', label: t('nav.players', 'Players'), icon: Users, section: 'club' },
          { id: 'club-admin', label: t('nav.settings'), icon: Shield, section: 'club' },
          // TODO: Re-enable when evaluations are ready for production
          // ...(can(PERMISSIONS.CLUB_VIEW_EVALUATIONS)
          //   ? [{ id: 'club-evaluations', label: 'Evaluations', icon: ClipboardCheck, section: 'club' }]
          //   : []),
        ]
      : [];

  const seasonNavItems = effectiveIsStaff
    ? [
        { id: 'dashboard', label: t('nav.seasonOverview'), icon: LayoutDashboard },
        ...(can(PERMISSIONS.TEAM_VIEW_BUDGET)
          ? [{ id: 'finance/budget', label: t('nav.budget'), icon: FileSpreadsheet }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_LEDGER)
          ? [{ id: 'finance/ledger', label: t('nav.ledger'), icon: ReceiptText }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_SPONSORS)
          ? [{ id: 'finance/fundraising', label: t('nav.fundraising'), icon: Handshake }]
          : []),
      ]
    : [{ id: 'dashboard', label: t('nav.myPlayer'), icon: Users }];

  const teamNavItems = effectiveIsStaff
    ? [
        { id: 'schedule', label: t('nav.schedule'), icon: Calendar },
        ...(can(PERMISSIONS.TEAM_VIEW_ROSTER) || can(PERMISSIONS.TEAM_MANAGE_USERS)
          ? [{ id: 'people', label: t('nav.players'), icon: Users }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_INSIGHTS) ? [{ id: 'insights', label: t('nav.insights'), icon: Sparkles }] : []),
        ...(can(PERMISSIONS.TEAM_VIEW_ROSTER)
          ? [{ id: 'season-evaluations', label: t('nav.evaluations', 'Evaluations'), icon: ClipboardCheck }]
          : []),
        ...(can(PERMISSIONS.TEAM_EDIT_SCHEDULE)
          ? [{ id: 'team-admin', label: t('nav.settings'), icon: SlidersHorizontal }]
          : []),
      ]
    : [{ id: 'schedule', label: t('nav.schedule'), icon: Calendar }];

  const canEditSchedule = can(PERMISSIONS.TEAM_EDIT_SCHEDULE);
  const canEditLedger = can(PERMISSIONS.TEAM_EDIT_LEDGER);

  const navContextValue = {
    club,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    selectedTeam,
    appNavItems,
    clubNavItems,
    seasonNavItems,
    teamNavItems,
    selectedSeason,
    setSelectedSeason,
    seasons,
    currentView,
    currentSearch,
    navigate,
    user,
    effectiveRole,
    toggleLocale,
    locale,
    cycleTheme,
    theme,
    ThemeIcon,
    sidebarSettingsOpen,
    setSidebarSettingsOpen,
    mobileMenuOpen,
    setMobileMenuOpen,
    supabase,
    effectiveIsStaff,
    isClubAdmin,
    canEditLedger,
    setTxToEdit,
    setShowTxForm,
  };

  const dataContextValue = {
    players,
    seasonalPlayers,
    archivedPlayers,
    myPlayers,
    transactions,
    seasonalTransactions,
    playerFinancials,
    teamEvents,
    collapsedTeamEvents,
    fetchData,
  };

  const financeContextValue = {
    teamBalance,
    totalExpenses,
    formatMoney,
    calculatePlayerFinancials,
    handleWaterfallCredit,
    revertWaterfall,
  };

  const scheduleContextValue = {
    events,
    blackoutDates,
    toggleBlackout,
    handleSyncCalendar,
    handleTeamEventTypeChange,
    handleSaveExpense,
    handleToggleCleared,
    handleDeleteExpense,
  };

  return (
    <NavigationContext.Provider value={navContextValue}>
      <DataContext.Provider value={dataContextValue}>
        <FinanceContext.Provider value={financeContextValue}>
          <ScheduleContext.Provider value={scheduleContextValue}>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors">
              {/* ═══ IMPERSONATION BANNER ═══ */}
              {viewingAsParent && (
                <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between z-[60] shrink-0">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Eye size={14} />
                    <span>
                      {t('impersonation.viewingAs')}{' '}
                      <span className="font-black">
                        {impersonatingAs.firstName} {impersonatingAs.lastName}
                      </span>
                      {impersonatingAs.guardians?.[0]?.name && (
                        <span className="opacity-80"> ({impersonatingAs.guardians[0].name})</span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setImpersonatingAs(null);
                      navigate('/dashboard');
                    }}
                    className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-black transition-colors"
                  >
                    {t('common.exit')}
                  </button>
                </div>
              )}

              <div className="flex flex-1 md:flex-row flex-col">
                <DesktopSidebar />
                <MobileHeader />
                <MobileMenu />

                <main className="flex-grow p-4 md:p-8 pb-32 md:pb-8 max-w-6xl mx-auto w-full dark:text-slate-100">
                  <AppRoutes
                    user={user}
                    club={club}
                    teams={teams}
                    selectedTeam={selectedTeam}
                    selectedTeamId={selectedTeamId}
                    setSelectedTeamId={setSelectedTeamId}
                    userRoles={userRoles}
                    effectiveRole={effectiveRole}
                    isClubAdmin={isClubAdmin}
                    isSuperAdmin={isSuperAdmin}
                    effectiveIsStaff={effectiveIsStaff}
                    can={can}
                    refreshContext={refreshContext}
                    seasons={seasons}
                    teamSeasons={teamSeasons}
                    selectedSeason={selectedSeason}
                    setSelectedSeason={setSelectedSeason}
                    currentSeasonData={currentSeasonData}
                    currentTeamSeason={currentTeamSeason}
                    teamSeasonId={teamSeasonId}
                    refreshSeasons={refreshSeasons}
                    formatMoney={formatMoney}
                    customCategories={customCategories}
                    categoryLabels={categoryLabels}
                    categoryColors={categoryColors}
                    categoryOptions={categoryOptions}
                    saveCategory={saveCategory}
                    deleteCategory={deleteCategory}
                    isCategorySaving={isCategorySaving}
                    accounts={accounts}
                    activeAccounts={activeAccounts}
                    accountsByHolding={accountsByHolding}
                    accountMap={accountMap}
                    saveAccount={saveAccount}
                    deleteAccount={deleteAccount}
                    isAccountSaving={isAccountSaving}
                    effectiveTeam={effectiveTeam}
                    canEditSchedule={canEditSchedule}
                    canEditLedger={canEditLedger}
                    handleSaveTransaction={handleSaveTransaction}
                    handleDeleteTransaction={handleDeleteTransaction}
                    handleBulkUpload={handleBulkUpload}
                    isBulkUploading={isBulkUploading}
                    setIsBulkUploading={setIsBulkUploading}
                    handleSavePlayer={handleSavePlayer}
                    handleArchivePlayer={handleArchivePlayer}
                    handleToggleWaiveFee={handleToggleWaiveFee}
                    showPlayerForm={showPlayerForm}
                    setShowPlayerForm={setShowPlayerForm}
                    playerToEdit={playerToEdit}
                    setPlayerToEdit={setPlayerToEdit}
                    showPlayerModal={showPlayerModal}
                    setShowPlayerModal={setShowPlayerModal}
                    playerToView={playerToView}
                    setPlayerToView={setPlayerToView}
                    showTxForm={showTxForm}
                    setShowTxForm={setShowTxForm}
                    txToEdit={txToEdit}
                    setTxToEdit={setTxToEdit}
                    confirmDialog={confirmDialog}
                    impersonatingAs={impersonatingAs}
                    setImpersonatingAs={setImpersonatingAs}
                    toast={toast}
                    setToast={setToast}
                    showToast={showToast}
                    showConfirm={showConfirm}
                    navigate={navigate}
                  />
                </main>

                <MobileBottomNav />
              </div>
              <NotificationPermissionBanner />
            </div>
          </ScheduleContext.Provider>
        </FinanceContext.Provider>
      </DataContext.Provider>
    </NavigationContext.Provider>
  );
}

export default App;
