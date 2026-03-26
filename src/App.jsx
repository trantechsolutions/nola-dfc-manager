import { useEffect, useState, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import {
  LayoutDashboard,
  Users,
  Eye,
  Globe,
  Calendar,
  Plus,
  Settings,
  LogOut,
  Sparkles,
  ChevronDown,
  Building2,
  Shield,
  ListTree,
  DollarSign,
  SlidersHorizontal,
  FileSpreadsheet,
  ReceiptText,
  Handshake,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  GitCommit,
  ClipboardCheck,
} from 'lucide-react';
import { useT } from './i18n/I18nContext';
import { useTheme } from './theme/ThemeContext';

// Views
import LoginView from './views/general/LoginView';
import TeamOverviewView from './views/team/TeamOverviewView';
import InsightsView from './views/team/InsightsView';
import ScheduleView from './views/team/ScheduleView';
import ParentView from './views/team/ParentView';
import PublicCalendarView from './views/general/PublicCalendarView';
import ClubDashboard from './views/club/ClubDashboard';
import TeamList from './views/club/TeamList';
import TeamOnboarding from './views/club/TeamOnboarding';
import FinanceView from './views/team/FinanceView';
import PeopleView from './views/team/PeopleView';
import ClubAdminHub from './views/club/ClubAdminHub';
import TeamSettingsView from './views/team/TeamSettingsView';
import Changelog from './components/Changelog';
import SuperAdminView from './views/admin/SuperAdminView';
import EvaluationHub from './views/club/evaluations/EvaluationHub';
import ClubPlayersView from './views/club/ClubPlayersView';
import EvaluatorScoringView from './views/club/evaluations/EvaluatorScoringView';

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
import { useCategoryManager } from './hooks/useCategoryManager';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentView = location.pathname.replace('/', '') || 'dashboard';
  const currentSearch = location.search;
  const { t, locale, toggleLocale } = useT();
  const { theme, cycleTheme } = useTheme();
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  const [user, setUser] = useState(null);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);

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
  const [impersonatingAs, setImpersonatingAs] = useState(null); // player object when admin is viewing as parent
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false);

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
    navItems: roleNavItems,
    can,
    loading: contextLoading,
    refreshContext,
  } = useTeamContext(user);

  // When impersonating, act as parent regardless of actual role
  const viewingAsParent = !!impersonatingAs;
  const effectiveIsStaff = viewingAsParent ? false : isStaff;
  const role = effectiveIsStaff ? 'manager' : 'parent';

  // ── PARENT TEAM DETECTION ──
  // Parents have no roles so selectedTeamId is null. We derive their team
  // from the player roster so useSoccerYear can fetch the correct team_seasons
  // (and therefore the correct isFinalized status).
  const myPlayers = useMemo(() => {
    if (viewingAsParent) {
      // Show the impersonated player + any siblings sharing a guardian email
      const guardianEmails = new Set(
        (impersonatingAs.guardians || []).map((g) => g.email?.toLowerCase()).filter(Boolean),
      );
      if (guardianEmails.size === 0) return [impersonatingAs];
      return players.filter((p) => p.guardians?.some((g) => guardianEmails.has(g.email?.toLowerCase())));
    }
    if (!user || role === 'manager') return [];
    return players.filter((p) => p.guardians?.some((g) => g.email?.toLowerCase() === user.email.toLowerCase()));
  }, [players, user, role, viewingAsParent, impersonatingAs]);

  const parentTeamId = useMemo(() => {
    if (viewingAsParent) return impersonatingAs.teamId || null;
    if (isStaff || selectedTeamId) return null; // staff already has a team
    // Find first player whose guardian email matches this user
    const myPlayer = players.find(
      (p) => p.guardians?.some((g) => g.email?.toLowerCase() === user?.email?.toLowerCase()) && p.teamId,
    );
    return myPlayer?.teamId || null;
  }, [isStaff, selectedTeamId, players, user, viewingAsParent, impersonatingAs]);

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

  // ── SCHEDULE ──
  // For parents, fetch the team object directly since useTeamContext returns
  // an empty teams array for users with no roles.
  const [parentTeam, setParentTeam] = useState(null);
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

  const [teamEvents, setTeamEvents] = useState([]);

  // Collapse same-title tournament entries from the DB into one dropdown option,
  // matching the grouping logic applied during sync. Already sorted desc by DB.
  const collapsedTeamEvents = useMemo(() => {
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const tournaments = teamEvents.filter((e) => e.eventType === 'tournament');
    const others = teamEvents.filter((e) => e.eventType !== 'tournament');

    // Sort ascending for grouping (DB returns desc)
    const sorted = [...tournaments].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
    const used = new Set();
    const grouped = [];

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;
      const anchor = sorted[i];
      const anchorMs = new Date(anchor.eventDate).getTime();
      const group = [anchor];
      used.add(i);

      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue;
        const candidate = sorted[j];
        if (candidate.title === anchor.title && new Date(candidate.eventDate).getTime() - anchorMs <= THREE_DAYS_MS) {
          group.push(candidate);
          used.add(j);
        }
      }

      if (group.length === 1) {
        grouped.push(anchor);
      } else {
        const last = group[group.length - 1];
        grouped.push({
          ...anchor,
          description: `${group.length} games · ${anchor.eventDate} – ${last.eventDate}`,
        });
      }
    }

    // Merge back and sort descending by date
    return [...others, ...grouped].sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
  }, [teamEvents]);

  // ── DATA FETCHING ──
  const fetchData = async () => {
    try {
      let fetchTeamId = selectedTeamId || parentTeamId;

      // ── Step 1: Resolve players ──
      // For parents (no team context), start by matching email → guardian → player
      let pData = [];
      if (!fetchTeamId && user?.email) {
        try {
          pData = await supabaseService.getPlayersByGuardianEmail(user.email);
          if (pData.length > 0 && pData[0].teamId) {
            fetchTeamId = pData[0].teamId;
          }
        } catch (e) {
          console.warn('Guardian email lookup failed:', e.message);
        }
      }
      // For staff (or after parent resolved team), fetch full team roster
      if (fetchTeamId && pData.length === 0) {
        pData = await supabaseService.getPlayersByTeam(fetchTeamId);
      }

      console.log('Fetched', pData.length, 'players for teamId:', fetchTeamId, 'season:', selectedSeason);

      // ── Step 2: Resolve teamSeasonId ──
      let tsId = currentTeamSeason?.id || null;
      if (!tsId && fetchTeamId && selectedSeason) {
        const match = teamSeasons?.find((ts) => ts.seasonId === selectedSeason);
        tsId = match?.id || null;
      }
      if (!tsId && fetchTeamId && selectedSeason) {
        try {
          const ts = await supabaseService.getTeamSeason(fetchTeamId, selectedSeason);
          tsId = ts?.id || null;
        } catch {
          /* noop */
        }
      }

      // ── Step 3: Fetch transactions ──
      const tData = tsId ? await supabaseService.getTransactionsByTeamSeason(tsId) : [];

      let fData = {};
      try {
        fData = await supabaseService.getPlayerFinancials(selectedSeason, tsId);
      } catch (e) {
        console.warn('Could not fetch player_financials view:', e.message);
      }

      const evId = fetchTeamId || selectedTeamId || parentTeamId;
      if (evId) {
        try {
          const evData = await supabaseService.getTeamEvents(evId);
          setTeamEvents(evData);
        } catch (e) {
          console.warn('Could not fetch team events:', e.message);
        }
      }

      setPlayers(pData);
      setTransactions(tData);
      setPlayerFinancials(fData);
    } catch (e) {
      console.error('Data fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCalendar = async () => {
    const count = await syncCalendar();
    const evId = selectedTeamId || parentTeamId;
    if (evId) {
      const evData = await supabaseService.getTeamEvents(evId);
      setTeamEvents(evData);
    }
    showToast(t('toast.syncedEvents', { n: count }));
  };

  const handleTeamEventTypeChange = async (dbEventId, newType) => {
    await supabaseService.updateTeamEventType(dbEventId, newType);
    setTeamEvents((prev) => prev.map((e) => (e.id === dbEventId ? { ...e, eventType: newType, typeLocked: true } : e)));
  };

  // ── Event expense handlers (used by ScheduleView) ──
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

  const showToast = (msg, isError = false, action = null) => {
    setToast({ msg, isError, action });
    setTimeout(() => setToast(null), 4000);
  };

  const showConfirm = (message) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        onConfirm: () => {
          resolve(true);
          setConfirmDialog(null);
        },
        onCancel: () => {
          resolve(false);
          setConfirmDialog(null);
        },
      });
    });
  };

  // ── FILTERED DATA ──
  const seasonalPlayers = useMemo(() => {
    let filtered = players.filter((p) => p.seasonProfiles?.[selectedSeason] && p.status !== 'archived');
    if (selectedTeamId) {
      filtered = filtered.filter((p) => p.teamId === selectedTeamId);
    }
    return filtered;
  }, [players, selectedSeason, selectedTeamId]);

  const archivedPlayers = useMemo(() => players.filter((p) => p.status === 'archived'), [players]);

  const seasonalTransactions = useMemo(() => {
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

  // ── Custom Categories (club-scoped) ──
  const {
    customCategories,
    categoryLabels,
    categoryColors,
    categoryOptions,
    saveCategory,
    deleteCategory,
    isSaving: isCategorySaving,
  } = useCategoryManager(club?.id);

  // ── AUTH LISTENER ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        supabaseService.ensureUserProfile(currentUser);
        fetchData();
      } else {
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
        setUser((prev) => {
          if (prev?.id === incoming?.id) return prev; // same reference — no cascade
          if (incoming) {
            setLoading(true);
            supabaseService.ensureUserProfile(incoming);
            fetchData();
          }
          return incoming;
        });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      }
      // All other events (TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED,
      // PASSWORD_RECOVERY) are intentionally ignored here.
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-fetch when team changes (staff) or parent team resolves
  useEffect(() => {
    if (user && (selectedTeamId || parentTeamId)) {
      setLoading(true);
      fetchData();
    }
  }, [selectedTeamId, parentTeamId]);

  // Re-fetch financials when team season resolves or season changes
  useEffect(() => {
    if (user && selectedSeason) {
      const tsId = currentTeamSeason?.id || null;
      supabaseService
        .getPlayerFinancials(selectedSeason, tsId)
        .then((fData) => setPlayerFinancials(fData || {}))
        .catch((e) => {
          console.warn('Financials refresh failed:', e.message);
          setPlayerFinancials({});
        });
    }
  }, [currentTeamSeason?.id, selectedSeason]);

  // ── COMPUTED ──
  const teamBalance = seasonalTransactions.reduce(
    (acc, tx) => (tx.cleared && !tx.waterfallBatchId && tx.category !== 'TRF' ? acc + tx.amount : acc),
    0,
  );
  const totalExpenses = seasonalTransactions.reduce(
    (acc, tx) =>
      tx.cleared && !tx.waterfallBatchId && tx.category !== 'TRF' && tx.amount < 0 ? acc + Math.abs(tx.amount) : acc,
    0,
  );
  const formatMoney = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (loading || contextLoading)
    return (
      <div className="min-h-screen flex items-center justify-center font-black text-slate-300 animate-pulse">
        LOADING...
      </div>
    );

  // ── PUBLIC / UNAUTHENTICATED ──
  if (!user) {
    return (
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
    );
  }

  // ── NAV ──
  const appNavItems = isSuperAdmin ? [{ id: 'app-admin', label: 'App Admin', icon: Shield, section: 'app' }] : [];

  const clubNavItems =
    isClubAdmin || isSuperAdmin
      ? [
          { id: 'club-overview', label: t('nav.overview'), icon: Building2, section: 'club' },
          { id: 'club-teams', label: t('nav.teams'), icon: ListTree, section: 'club' },
          { id: 'club-players', label: t('nav.players', 'Players'), icon: Users, section: 'club' },
          { id: 'club-admin', label: t('nav.settings'), icon: Shield, section: 'club' },
          ...(can(PERMISSIONS.CLUB_VIEW_EVALUATIONS)
            ? [{ id: 'club-evaluations', label: 'Evaluations', icon: ClipboardCheck, section: 'club' }]
            : []),
        ]
      : [];

  // Season-scoped nav items (budget, ledger, fundraising)
  const seasonNavItems = effectiveIsStaff
    ? [
        { id: 'dashboard', label: t('nav.seasonOverview'), icon: LayoutDashboard },
        ...(can(PERMISSIONS.TEAM_VIEW_BUDGET)
          ? [{ id: 'finance?tab=budget', label: t('nav.budget'), icon: FileSpreadsheet }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_LEDGER)
          ? [{ id: 'finance?tab=ledger', label: t('nav.ledger'), icon: ReceiptText }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_SPONSORS)
          ? [{ id: 'finance?tab=fundraising', label: t('nav.fundraising'), icon: Handshake }]
          : []),
      ]
    : [{ id: 'dashboard', label: t('nav.myPlayer'), icon: Users }];

  // Team-wide nav items (no season dependency)
  const teamNavItems = effectiveIsStaff
    ? [
        { id: 'schedule', label: t('nav.schedule'), icon: Calendar },
        ...(can(PERMISSIONS.TEAM_VIEW_ROSTER) || can(PERMISSIONS.TEAM_MANAGE_USERS)
          ? [{ id: 'people', label: t('nav.players'), icon: Users }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_INSIGHTS) ? [{ id: 'insights', label: t('nav.insights'), icon: Sparkles }] : []),
        ...(can(PERMISSIONS.TEAM_EDIT_SCHEDULE)
          ? [{ id: 'team-admin', label: t('nav.settings'), icon: SlidersHorizontal }]
          : []),
      ]
    : [{ id: 'schedule', label: t('nav.schedule'), icon: Calendar }];

  const canEditSchedule = can(PERMISSIONS.TEAM_EDIT_SCHEDULE);
  const canEditLedger = can(PERMISSIONS.TEAM_EDIT_LEDGER);

  return (
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
        {/* ═══ DESKTOP SIDEBAR ═══ */}
        <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col sticky top-0 h-screen">
          <div className="p-6">
            <h1 className="text-xl font-black tracking-tighter uppercase">{club?.name || 'Team Manager'}</h1>

            {teams.length > 1 && (
              <div className="mt-3 relative">
                <button
                  onClick={() => setShowTeamPicker(!showTeamPicker)}
                  className="w-full p-2.5 bg-slate-800 rounded-xl text-left flex items-center justify-between hover:bg-slate-700 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('common.team')}</p>
                    <p className="text-sm font-bold text-blue-400 truncate">{selectedTeam?.name || t('common.team')}</p>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 transition-transform ${showTeamPicker ? 'rotate-180' : ''}`}
                  />
                </button>
                {showTeamPicker && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                    {teams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedTeamId(t.id);
                          setShowTeamPicker(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-700 transition-colors ${t.id === selectedTeamId ? 'bg-slate-700' : ''}`}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: t.colorPrimary || '#3b82f6' }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{t.name}</p>
                          <p className="text-[9px] text-slate-400">
                            {t.ageGroup} · {t.gender} · {t.tier}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {teams.length === 1 && (
              <div className="mt-3 p-2.5 bg-slate-800 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('common.team')}</p>
                <p className="text-sm font-bold text-blue-400">{selectedTeam?.name}</p>
              </div>
            )}
          </div>

          <nav className="flex-grow px-4 space-y-1 overflow-y-auto">
            {appNavItems.length > 0 && (
              <>
                <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest px-4 pt-2 pb-1">APP</p>
                {appNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/${item.id}`)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                      currentView === item.id
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </button>
                ))}
                <div className="border-t border-slate-800 my-2" />
              </>
            )}
            {clubNavItems.length > 0 && (
              <>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-4 pt-2 pb-1">
                  {t('common.club')}
                </p>
                {clubNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/${item.id}`)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                      currentView === item.id
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </button>
                ))}
                <div className="border-t border-slate-800 my-2" />
              </>
            )}

            {/* SEASON section */}
            {selectedTeam && (
              <div className="flex items-center justify-between px-4 pt-1 pb-1">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('common.season')}</p>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                  className="bg-transparent border-none text-blue-400 font-bold text-[10px] p-0 focus:ring-0 cursor-pointer text-right"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id} className="text-slate-900">
                      {s.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {seasonNavItems.map((item) => {
              const navId = item.id.split('?')[0];
              const itemTab = item.id.includes('?tab=') ? item.id.split('?tab=')[1] : null;
              const currentTab = currentSearch.includes('tab=') ? new URLSearchParams(currentSearch).get('tab') : null;
              const isActive = item.id.includes('?')
                ? currentView === 'finance' && currentTab === itemTab
                : currentView === navId;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`/${item.id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* TEAM section */}
            <div className="border-t border-slate-800 my-2" />
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-4 pt-1 pb-1">
              {selectedTeam?.name || t('common.team')}
            </p>
            {teamNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/${item.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                  currentView === item.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="border-t border-slate-800">
            <button
              onClick={() => setSidebarSettingsOpen(!sidebarSettingsOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-slate-400 hover:bg-slate-800 transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Settings size={14} />
                <p className="text-[10px] font-bold text-slate-500 truncate">{user.email}</p>
              </div>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 flex-shrink-0 ${sidebarSettingsOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {sidebarSettingsOpen && (
              <div className="px-4 pb-3 space-y-1">
                <button
                  onClick={toggleLocale}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition-all"
                >
                  <Globe size={16} />
                  <span className="text-sm">{locale === 'en' ? 'Español' : 'English'}</span>
                </button>
                <button
                  onClick={cycleTheme}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition-all"
                >
                  <ThemeIcon size={16} />
                  <span className="text-sm capitalize">{theme}</span>
                </button>
                <button
                  onClick={() => {
                    navigate('/changelog');
                    setSidebarSettingsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold transition-all ${
                    currentView === 'changelog' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <GitCommit size={16} />
                  <span className="text-sm">Update Log</span>
                </button>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-red-400 hover:bg-red-900/20 transition-all"
                >
                  <LogOut size={16} />
                  <span className="text-sm">{t('common.logout')}</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ═══ MOBILE HEADER ═══ */}
        <header className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 sticky top-0 z-40">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="text-slate-600 dark:text-slate-300"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
              <div>
                <h1 className="font-black text-slate-900 dark:text-white text-sm">{club?.name || 'Team Manager'}</h1>
                {selectedTeam && <p className="text-[10px] font-bold text-blue-600">{selectedTeam.name}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {teams.length > 1 && (
                <select
                  value={selectedTeamId || ''}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg border-none px-2 py-1 max-w-[120px]"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={toggleLocale}
                className="relative text-slate-500 dark:text-slate-400"
                title={locale === 'en' ? 'Español' : 'English'}
                aria-label="Toggle language"
              >
                <Globe size={16} />
                <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[7px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center uppercase">
                  {locale}
                </span>
              </button>
              <button
                onClick={cycleTheme}
                className="text-slate-500 dark:text-slate-400"
                title={`Theme: ${theme}`}
                aria-label="Toggle theme"
              >
                <ThemeIcon size={16} />
              </button>
              <button onClick={() => supabase.auth.signOut()} className="text-red-500" aria-label="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* ═══ MOBILE SLIDE-OUT MENU ═══ */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-900 p-5 overflow-y-auto animate-in slide-in-from-left duration-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-black text-white text-sm">{club?.name || 'Team Manager'}</h2>
                <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              {/* Season section */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('common.season')}</p>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                  className="bg-transparent border-none text-blue-400 font-bold text-[10px] p-0 focus:ring-0 cursor-pointer text-right"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id} className="text-slate-900">
                      {s.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 mb-4">
                {seasonNavItems.map((item) => {
                  const navId = item.id.split('?')[0];
                  const itemTab = item.id.includes('?tab=') ? item.id.split('?tab=')[1] : null;
                  const currentTab = currentSearch.includes('tab=')
                    ? new URLSearchParams(currentSearch).get('tab')
                    : null;
                  const isActive = item.id.includes('?')
                    ? currentView === 'finance' && currentTab === itemTab
                    : currentView === navId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigate(`/${item.id}`);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Team section */}
              <div className="border-t border-slate-800 my-3" />
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-4 mb-2">
                {selectedTeam?.name || t('common.team')}
              </p>
              <div className="space-y-1">
                {teamNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(`/${item.id}`);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                      currentView === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-slate-800 mt-4 pt-3 space-y-1">
                <p className="text-[10px] font-bold text-slate-500 truncate px-4">{user.email}</p>
                <p className="text-[9px] font-bold text-blue-400 uppercase px-4 mb-2">
                  {effectiveRole.replace('_', ' ')}
                </p>
                <button
                  onClick={() => {
                    navigate('/changelog');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                    currentView === 'changelog' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <GitCommit size={16} />
                  <span>Update Log</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ CONTENT ═══ */}
        <main className="flex-grow p-4 md:p-8 pb-32 md:pb-8 max-w-6xl mx-auto w-full dark:text-slate-100">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {isSuperAdmin && (
              <Route
                path="/app-admin"
                element={
                  <SuperAdminView
                    onSelectClub={(club) => {
                      refreshContext();
                      navigate('/club-overview');
                    }}
                    showToast={showToast}
                    showConfirm={showConfirm}
                  />
                }
              />
            )}

            {(isClubAdmin || isSuperAdmin) && (
              <>
                <Route
                  path="/club-overview"
                  element={
                    <ClubDashboard
                      club={club}
                      teams={teams}
                      seasons={seasons}
                      selectedSeason={selectedSeason}
                      onSelectTeam={(teamId) => {
                        setSelectedTeamId(teamId);
                        navigate('/dashboard');
                      }}
                    />
                  }
                />
                <Route
                  path="/club-teams"
                  element={
                    <TeamList
                      club={club}
                      teams={teams}
                      formatMoney={formatMoney}
                      onSelectTeam={(teamId) => {
                        setSelectedTeamId(teamId);
                        navigate('/dashboard');
                      }}
                      showToast={showToast}
                      showConfirm={showConfirm}
                      refreshContext={refreshContext}
                    />
                  }
                />
                <Route
                  path="/club-admin"
                  element={
                    <ClubAdminHub
                      settingsProps={{ club, teams, userRoles, showToast, showConfirm, refreshContext }}
                      usersProps={{ club, teams, showToast, showConfirm, refreshContext }}
                      categoriesProps={{
                        customCategories,
                        onSave: async (catData) => {
                          await saveCategory(catData);
                          showToast(catData.id ? t('toast.categoryUpdated') : t('toast.categoryCreated'));
                        },
                        onDelete: async (catId) => {
                          const ok = await showConfirm(
                            'Delete this custom category? Existing transactions will keep their category code but the label may not display correctly.',
                          );
                          if (ok) {
                            await deleteCategory(catId);
                            showToast(t('toast.categoryDeleted'));
                          }
                        },
                        isSaving: isCategorySaving,
                      }}
                    />
                  }
                />
                {/* Legacy redirects */}
                <Route path="/club-settings" element={<Navigate to="/club-admin" replace />} />
                <Route path="/club-calendar" element={<Navigate to="/club-overview" replace />} />
                <Route path="/club-users" element={<Navigate to="/club-admin" replace />} />
                <Route path="/club-categories" element={<Navigate to="/club-admin" replace />} />
                <Route
                  path="/club-onboard"
                  element={
                    <TeamOnboarding
                      club={club}
                      seasons={seasons}
                      showToast={showToast}
                      onComplete={(teamId) => {
                        refreshContext();
                        if (teamId) {
                          setSelectedTeamId(teamId);
                          navigate('/dashboard');
                        } else {
                          navigate('/club-teams');
                        }
                      }}
                      onCancel={() => navigate('/club-teams')}
                    />
                  }
                />
                <Route
                  path="/club-players"
                  element={
                    <ClubPlayersView
                      club={club}
                      teams={teams}
                      seasons={seasons}
                      selectedSeason={selectedSeason}
                      showToast={showToast}
                      showConfirm={showConfirm}
                    />
                  }
                />
                {can(PERMISSIONS.CLUB_VIEW_EVALUATIONS) && (
                  <Route
                    path="/club-evaluations"
                    element={
                      <EvaluationHub
                        club={club}
                        teams={teams}
                        seasons={seasons}
                        selectedSeason={selectedSeason}
                        showToast={showToast}
                        showConfirm={showConfirm}
                        user={user}
                      />
                    }
                  />
                )}
              </>
            )}

            {/* ── TEAM ROUTES ── */}
            <Route
              path="/dashboard"
              element={
                effectiveIsStaff ? (
                  <TeamOverviewView
                    players={seasonalPlayers}
                    archivedPlayers={archivedPlayers}
                    teamBalance={teamBalance}
                    totalExpenses={totalExpenses}
                    formatMoney={formatMoney}
                    selectedSeasonData={currentSeasonData}
                    transactions={seasonalTransactions}
                    calculatePlayerFinancials={calculatePlayerFinancials}
                    seasons={seasons}
                    selectedSeason={selectedSeason}
                    setSelectedSeason={setSelectedSeason}
                    onAddPlayer={() => {
                      setPlayerToEdit(null);
                      setShowPlayerForm(true);
                    }}
                    onEditPlayer={(p) => {
                      setPlayerToEdit(p);
                      setShowPlayerForm(true);
                    }}
                    onViewPlayer={(p) => {
                      setPlayerToView(p);
                      setShowPlayerModal(true);
                    }}
                    onToggleWaive={(pId, state) => handleToggleWaiveFee(pId, selectedSeason, state)}
                  />
                ) : (
                  <ParentView
                    players={myPlayers}
                    transactions={seasonalTransactions}
                    calculatePlayerFinancials={calculatePlayerFinancials}
                    formatMoney={formatMoney}
                    teams={teams}
                    seasons={seasons}
                    selectedSeason={selectedSeason}
                    setSelectedSeason={setSelectedSeason}
                    currentSeasonData={currentSeasonData}
                    clubId={club?.id}
                    onRefresh={fetchData}
                    showToast={showToast}
                    showConfirm={showConfirm}
                  />
                )
              }
            />

            <Route
              path="/schedule"
              element={
                <ScheduleView
                  events={events}
                  blackoutDates={blackoutDates}
                  onToggleBlackout={canEditSchedule ? toggleBlackout : null}
                  selectedTeam={effectiveTeam}
                  canEditSchedule={canEditSchedule}
                  onSyncCalendar={canEditSchedule ? handleSyncCalendar : null}
                  teamEvents={teamEvents}
                  onTypeChange={canEditSchedule ? handleTeamEventTypeChange : null}
                  transactions={seasonalTransactions}
                  onSaveExpense={canEditSchedule ? handleSaveExpense : null}
                  onToggleCleared={canEditSchedule ? handleToggleCleared : null}
                  onDeleteExpense={canEditSchedule ? handleDeleteExpense : null}
                  seasonIds={seasons.map((s) => s.id)}
                  selectedSeason={selectedSeason}
                />
              }
            />

            {canEditSchedule && (
              <Route
                path="/team-admin"
                element={
                  <TeamSettingsView selectedTeam={selectedTeam} refreshContext={refreshContext} showToast={showToast} />
                }
              />
            )}

            <Route path="/changelog" element={<Changelog />} />
            <Route path="/evaluate/:sessionId" element={<EvaluatorScoringView user={user} showToast={showToast} />} />

            {effectiveIsStaff && (
              <>
                {/* Finance hub: Ledger + Budget + Fundraising */}
                {(can(PERMISSIONS.TEAM_VIEW_LEDGER) ||
                  can(PERMISSIONS.TEAM_VIEW_BUDGET) ||
                  can(PERMISSIONS.TEAM_VIEW_SPONSORS)) && (
                  <Route
                    path="/finance"
                    element={
                      <FinanceView
                        visibleTabs={[
                          ...(can(PERMISSIONS.TEAM_VIEW_LEDGER) ? ['ledger'] : []),
                          ...(can(PERMISSIONS.TEAM_VIEW_BUDGET) ? ['budget'] : []),
                          ...(can(PERMISSIONS.TEAM_VIEW_SPONSORS) ? ['fundraising'] : []),
                        ]}
                        ledgerProps={
                          can(PERMISSIONS.TEAM_VIEW_LEDGER)
                            ? {
                                transactions: seasonalTransactions,
                                formatMoney,
                                onAddTx: canEditLedger
                                  ? () => {
                                      setTxToEdit(null);
                                      setShowTxForm(true);
                                    }
                                  : null,
                                onEditTx: canEditLedger
                                  ? (tx) => {
                                      setTxToEdit(tx);
                                      setShowTxForm(true);
                                    }
                                  : null,
                                onDeleteTx: canEditLedger
                                  ? async (id) => {
                                      const ok = await showConfirm(t('toast.deleteTxConfirm'));
                                      if (ok) {
                                        await handleDeleteTransaction(id);
                                        showToast(t('toast.txDeleted'));
                                      }
                                    }
                                  : null,
                                categoryLabels,
                                categoryColors,
                                categoryOptions,
                                players: seasonalPlayers,
                                onBulkUpload: canEditLedger
                                  ? async (txns) => {
                                      setIsBulkUploading(true);
                                      try {
                                        const result = await handleBulkUpload(txns);
                                        if (result.success) showToast(t('toast.importSuccess', { n: txns.length }));
                                        else showToast(result.error || t('toast.importFailed'), true);
                                        return result;
                                      } finally {
                                        setIsBulkUploading(false);
                                      }
                                    }
                                  : null,
                                isBulkUploading,
                              }
                            : null
                        }
                        budgetProps={
                          can(PERMISSIONS.TEAM_VIEW_BUDGET)
                            ? {
                                selectedSeason,
                                formatMoney,
                                seasons,
                                setSelectedSeason,
                                refreshSeasons,
                                showToast,
                                showConfirm,
                                onDataChange: fetchData,
                                selectedTeamId,
                                currentTeamSeason,
                                selectedTeam,
                                club,
                                teamSeasons,
                                categoryOptions,
                              }
                            : null
                        }
                        fundraisingProps={
                          can(PERMISSIONS.TEAM_VIEW_SPONSORS)
                            ? {
                                transactions: seasonalTransactions,
                                selectedSeason,
                                formatMoney,
                                currentSeasonData,
                                onDistribute:
                                  can(PERMISSIONS.TEAM_EDIT_SPONSORS) && currentSeasonData?.isFinalized
                                    ? async (amt, title, pId, originalId, category) => {
                                        try {
                                          await handleWaterfallCredit(amt, title, pId, originalId, category);
                                          await fetchData();
                                          showToast(t('toast.fundsDistributed'));
                                        } catch (error) {
                                          showToast(error.message, true);
                                        }
                                      }
                                    : null,
                                onReset:
                                  can(PERMISSIONS.TEAM_EDIT_SPONSORS) && currentSeasonData?.isFinalized
                                    ? async (batchId, originalTxId) => {
                                        await revertWaterfall(batchId, originalTxId);
                                        await fetchData();
                                        showToast(t('toast.distributionReverted'));
                                      }
                                    : null,
                                seasonalPlayers,
                                seasons,
                              }
                            : null
                        }
                      />
                    }
                  />
                )}

                {/* People hub: Roster + Documents + Permissions */}
                {(can(PERMISSIONS.TEAM_VIEW_ROSTER) || can(PERMISSIONS.TEAM_MANAGE_USERS)) && (
                  <Route
                    path="/people"
                    element={
                      <PeopleView
                        visibleTabs={[
                          ...(can(PERMISSIONS.TEAM_VIEW_ROSTER) ? ['roster', 'documents'] : []),
                          ...(can(PERMISSIONS.TEAM_MANAGE_USERS) ? ['permissions'] : []),
                        ]}
                        rosterProps={
                          can(PERMISSIONS.TEAM_VIEW_ROSTER)
                            ? {
                                players,
                                seasons,
                                selectedSeason,
                                selectedTeam,
                                club,
                                currentTeamSeason,
                                showToast,
                                showConfirm,
                                can,
                                PERMISSIONS,
                                onEditPlayer: (player) => {
                                  setPlayerToEdit(player);
                                  setShowPlayerForm(true);
                                },
                                onAddPlayer: () => {
                                  setPlayerToEdit(null);
                                  setShowPlayerForm(true);
                                },
                                onViewPlayer: (player) => {
                                  setPlayerToView(player);
                                  setShowPlayerModal(true);
                                },
                                onViewAsParent: (player) => {
                                  setImpersonatingAs(player);
                                  navigate('/dashboard');
                                },
                                refreshData: fetchData,
                              }
                            : null
                        }
                        documentsProps={
                          can(PERMISSIONS.TEAM_VIEW_ROSTER)
                            ? {
                                players: seasonalPlayers,
                                selectedSeason,
                                club,
                                selectedTeam,
                                showToast,
                                showConfirm,
                                can,
                                PERMISSIONS,
                                onPlayerUpdate: fetchData,
                              }
                            : null
                        }
                        permissionsProps={
                          can(PERMISSIONS.TEAM_MANAGE_USERS)
                            ? {
                                selectedTeam,
                                showToast,
                                showConfirm,
                              }
                            : null
                        }
                      />
                    }
                  />
                )}

                {can(PERMISSIONS.TEAM_VIEW_INSIGHTS) && (
                  <Route
                    path="/insights"
                    element={
                      <InsightsView
                        transactions={seasonalTransactions}
                        players={seasonalPlayers}
                        selectedSeason={selectedSeason}
                        currentSeasonData={currentSeasonData}
                        calculatePlayerFinancials={calculatePlayerFinancials}
                        formatMoney={formatMoney}
                        events={events}
                      />
                    }
                  />
                )}

                {/* Legacy redirects */}
                <Route path="/ledger" element={<Navigate to="/finance" replace />} />
                <Route path="/budget" element={<Navigate to="/finance" replace />} />
                <Route path="/sponsors" element={<Navigate to="/finance" replace />} />
                <Route path="/roster" element={<Navigate to="/people" replace />} />
                <Route path="/documents" element={<Navigate to="/people" replace />} />
                <Route path="/team-users" element={<Navigate to="/people" replace />} />
              </>
            )}

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>

        {/* ═══ MOBILE BOTTOM NAV ═══ */}

        {/* Club strip — only visible to club admins, sits above the team bar */}
        {isClubAdmin && clubNavItems.length > 0 && (
          <div className="md:hidden fixed bottom-20 left-0 right-0 bg-violet-950 border-t border-violet-800 h-11 flex items-center z-40">
            <span className="text-[8px] font-black text-violet-600 uppercase tracking-widest px-3 shrink-0">
              {t('common.club')}
            </span>
            <div className="flex items-center flex-1 justify-around pr-2">
              {clubNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/${item.id}`)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                    currentView === item.id
                      ? 'text-violet-200 bg-violet-800/60'
                      : 'text-violet-500 hover:text-violet-300'
                  }`}
                >
                  <item.icon size={13} strokeWidth={currentView === item.id ? 2.5 : 2} />
                  <span className="text-[9px] font-bold">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Team bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 h-20 flex items-center justify-around px-2 z-50">
          {isClubAdmin && clubNavItems.length > 0 && (
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-slate-300 uppercase tracking-widest pointer-events-none">
              Team
            </span>
          )}
          {(effectiveIsStaff
            ? [
                { id: 'dashboard', label: t('nav.seasonOverview'), icon: LayoutDashboard },
                { id: 'finance?tab=ledger', label: t('nav.ledger'), icon: ReceiptText },
                // Plus button goes here (rendered separately below)
                { id: 'people', label: t('nav.players'), icon: Users },
                { id: 'schedule', label: t('nav.schedule'), icon: Calendar },
              ]
            : [
                { id: 'dashboard', label: t('nav.myPlayer'), icon: Users },
                { id: 'schedule', label: t('nav.schedule'), icon: Calendar },
              ]
          ).map((item) => {
            const navId = item.id.split('?')[0];
            const itemTab = item.id.includes('?tab=') ? item.id.split('?tab=')[1] : null;
            const mobileCurrentTab = currentSearch.includes('tab=')
              ? new URLSearchParams(currentSearch).get('tab')
              : null;
            const isActive = item.id.includes('?')
              ? currentView === 'finance' && mobileCurrentTab === itemTab
              : currentView === navId;
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/${item.id}`)}
                className={`flex flex-col items-center gap-1 flex-1 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
              >
                <item.icon size={20} strokeWidth={isActive ? 3 : 2} />
                <span className="text-[9px] font-bold">{item.label}</span>
              </button>
            );
          })}
          {canEditLedger && (
            <button
              onClick={() => {
                setTxToEdit(null);
                setShowTxForm(true);
              }}
              className="mb-10 bg-slate-900 text-white p-4 rounded-full shadow-xl border-4 border-white active:scale-90 transition-transform"
              aria-label="Add transaction"
            >
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
            onClose={() => {
              setShowPlayerModal(false);
              setPlayerToView(null);
            }}
            onToggleCompliance={async (id, field, currentState) => {
              setPlayerToView((prev) => ({ ...prev, [field]: !currentState }));
              await supabaseService.updatePlayerField(id, field, !currentState);
              fetchData();
            }}
            formatMoney={formatMoney}
            clubId={club?.id}
            onRefresh={fetchData}
            onViewAsParent={(p) => {
              setImpersonatingAs(p);
              navigate('/dashboard');
            }}
            showToast={showToast}
            showConfirm={showConfirm}
          />
        )}

        <PlayerFormModal
          show={showPlayerForm}
          initialData={playerToEdit}
          selectedSeason={selectedSeason}
          onSubmit={async (data) => {
            await handleSavePlayer(data);
            setShowPlayerForm(false);
            showToast(playerToEdit ? t('toast.playerUpdated') : t('toast.playerAdded'));
          }}
          onArchive={async (id) => {
            const ok = await showConfirm(t('toast.archivePlayerConfirm'));
            if (ok) {
              await handleArchivePlayer(id);
              setShowPlayerForm(false);
              showToast(t('toast.playerArchived'));
            }
          }}
          onClose={() => setShowPlayerForm(false)}
        />

        <TransactionModal
          show={showTxForm}
          initialData={txToEdit}
          onSubmit={async (data) => {
            const r = await handleSaveTransaction(data);
            if (r && r.success === false) {
              showToast(r.error, true);
            } else {
              setShowTxForm(false);
              showToast(txToEdit ? t('toast.txUpdated') : t('toast.txAdded'));
            }
          }}
          onClose={() => setShowTxForm(false)}
          players={seasonalPlayers}
          categoryOptions={categoryOptions}
          teamEvents={collapsedTeamEvents}
        />

        {confirmDialog && (
          <ConfirmModal
            message={confirmDialog.message}
            onConfirm={confirmDialog.onConfirm}
            onCancel={confirmDialog.onCancel}
          />
        )}

        {toast && (
          <div
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 text-white px-6 py-4 rounded-2xl shadow-2xl font-black z-[200] border-2 flex items-center gap-3 ${toast.isError ? 'bg-red-600 border-red-400' : 'bg-slate-900 border-slate-700'}`}
          >
            {toast.isError && <Settings size={20} className="animate-spin" />}
            <span>{toast.msg}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action.onClick();
                  setToast(null);
                }}
                className="ml-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
