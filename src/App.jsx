import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
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
  ClipboardList,
  BookOpen,
  ListChecks,
  MapPin,
  Clapperboard,
} from 'lucide-react';
import { useT } from './i18n/I18nContext';
import { useTheme } from './theme/ThemeContext';

// Views
import LoginView from './views/general/LoginView';
import ResetPasswordView from './views/general/ResetPasswordView';
import PublicCalendarView from './views/general/PublicCalendarView';

// Marketing origin. Set in Vercel for the app hosts so the sign-in screen can
// offer a way back to canteramanager.com; unset locally, where the link is
// simply not rendered rather than pointing somewhere that does not exist.
const LANDING_URL = (import.meta.env.VITE_LANDING_URL || '').replace(/\/$/, '');

// Components
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import AppRoutes from './components/AppRoutes';
import NotificationPermissionBanner from './components/NotificationPermissionBanner';
import OfflineBanner from './components/OfflineBanner';
import OutboxIndicator from './components/OutboxIndicator';
import { NavigationContext } from './context/NavigationContext';
import { DataContext } from './context/DataContext';
import { FinanceContext } from './context/FinanceContext';
import { ScheduleContext } from './context/ScheduleContext';
import { ChatProvider } from './context/ChatContext';

// Services & Hooks
import { supabaseService } from './services/supabaseService';
import { useEventRsvps } from './hooks/useEventRsvps';
import { useSoccerYear } from './hooks/useSoccerYear';
import { useFinance } from './hooks/useFinance';
import { useSchedule } from './hooks/useSchedule';
import { useMatchups } from './hooks/useMatchups';
import { useOpponentContacts } from './hooks/useOpponentContacts';
import { usePlayerManager } from './hooks/usePlayerManager';
import { useLedgerManager } from './hooks/useLedgerManager';
import { useTeamContext } from './hooks/useTeamContext';
import { useAppData } from './hooks/useAppData';
import { useModalState } from './hooks/useModalState';
import { expectedParentTeamId, isParentSeasonSettled, isParentSeasonPending } from './utils/parentSeason';
import { PERMISSIONS, PARENT_ROLE } from './utils/roles';
import { useCategoryManager } from './hooks/useCategoryManager';
import { useAccounts } from './hooks/useAccounts';
import { useSponsors } from './hooks/useSponsors';
import { useBookBalance } from './hooks/useBookBalance';
import { useAppSettings } from './hooks/useAppSettings';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { useViewScope } from './hooks/useViewScope';
import { resolveSingleTeamMode, setAdminOverride } from './utils/singleTeamMode';
import { isClubUiHidden } from './utils/viewScope';
import { todayStr } from './utils/txDates';
import { swCacheService } from './services/swCacheService';

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
  // A password-reset email link lands here with #access_token=...&type=recovery.
  // supabase-js auto-establishes a session from that hash, but we must NOT
  // treat it as a normal sign-in (see the AUTH LISTENER effect below) —
  // otherwise the user gets dropped into the full app on a throwaway
  // recovery session instead of being asked to set a new password.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('type=recovery'),
  );

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
    scorekeeperTeamIds,
    isClubAdmin,
    isSuperAdmin,
    can,
    loading: contextLoading,
    refreshContext,
  } = useTeamContext(user);

  // ── APP-WIDE SETTINGS (single-team mode, etc.) ──
  const { settings: appSettings, settingsLoading, saveSetting } = useAppSettings(user);
  const singleTeamEnabled = appSettings?.single_team_mode === true;

  // Toggle single-team mode app-wide. Also sets a local browser override so the
  // admin flipping it on keeps full mode (and access to this admin panel).
  const handleToggleSingleTeam = useCallback(
    async (next) => {
      await saveSetting('single_team_mode', next);
      setAdminOverride(next);
    },
    [saveSetting],
  );

  // Hide the Evaluations tab app-wide.
  const evaluationsHidden = appSettings?.hide_evaluations === true;
  const handleToggleHideEvaluations = useCallback(
    async (next) => {
      await saveSetting('hide_evaluations', next);
    },
    [saveSetting],
  );

  // Hide the Insights tab app-wide.
  const insightsHidden = appSettings?.hide_insights === true;
  const handleToggleHideInsights = useCallback(
    async (next) => {
      await saveSetting('hide_insights', next);
    },
    [saveSetting],
  );

  // Hide the club field schedule app-wide. Clubs that do not run their own
  // home field have nothing to book, and the board is noise on their nav.
  const fieldScheduleHidden = appSettings?.hide_field_schedule === true;
  const handleToggleHideFieldSchedule = useCallback(
    async (next) => {
      await saveSetting('hide_field_schedule', next);
    },
    [saveSetting],
  );

  // ── PER-USER VIEW SCOPE ──
  // A club admin can narrow their own view to team level. Local preference
  // only — it hides club chrome, it does not change what they're allowed to do.
  const { viewScope, setViewScope } = useViewScope(user?.id);

  const { confirmDialog, impersonatingAs, setImpersonatingAs, toast, setToast, showToast, showConfirm } =
    useModalState();

  // When impersonating, act as parent regardless of actual role
  const viewingAsParent = !!impersonatingAs;
  const effectiveIsStaff = viewingAsParent ? false : isStaff;
  const role = effectiveIsStaff ? 'manager' : PARENT_ROLE;

  // ── PLAYER SIGN-IN ──
  // A player can sign in themselves with the email or phone on their own roster entry
  // (sql/player_login_migration.sql). my_player_links says which of the players this account sees are its own
  // ('self') rather than a guardian's. An account that is only a player gets the team side of the app.
  const [playerLinks, setPlayerLinks] = useState([]);
  useEffect(() => {
    let live = true;
    if (!user?.id) {
      setPlayerLinks([]);
      return undefined;
    }
    supabaseService.getMyPlayerLinks().then(
      (links) => live && setPlayerLinks(links),
      () => live && setPlayerLinks([]),
    );
    return () => {
      live = false;
    };
  }, [user?.id]);
  const selfPlayerIds = useMemo(
    () => new Set(playerLinks.filter((l) => l.relation === 'self').map((l) => l.playerId)),
    [playerLinks],
  );
  const ownPlayerIdList = useMemo(() => [...selfPlayerIds], [selfPlayerIds]);
  const isPlayerAccount =
    !effectiveIsStaff && !viewingAsParent && selfPlayerIds.size > 0 && playerLinks.every((l) => l.relation === 'self');

  // ── PARENT TEAM DETECTION ──
  // Parents have no roles so selectedTeamId is null. We derive their team
  // from the player roster so useSoccerYear can fetch the correct team_seasons
  // (and therefore the correct isFinalized status).
  // parentTeamId starts null, is updated after useAppData resolves players.
  const [parentTeamId, setParentTeamId] = useState(null);
  const [parentTeam, setParentTeam] = useState(null);
  // Which parent team the fetch below has finished for (found or not), and which one's season is settled.
  const [parentTeamLoadedFor, setParentTeamLoadedFor] = useState(null);
  const [parentSeasonReadyFor, setParentSeasonReadyFor] = useState(null);

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
    teamSeasonsFor,
  } = useSoccerYear(
    user,
    effectiveTeamId,
    // The team's active season (set by its team manager) for everyone; else the club default for staff.
    (selectedTeam || parentTeam)?.activeSeasonId || (effectiveIsStaff ? club?.settings?.defaultSeason || null : null),
  );

  const {
    players,
    setPlayers,
    transactions,
    setTransactions,
    playerFinancials,
    teamEvents,
    collapsedTeamEvents,
    fetchData,
    updateTeamEvent,
    refreshTeamEvents,
    checklist,
    compliance,
    refreshChecklist,
    dataLoadedFor,
    checklistLoadedFor,
  } = useAppData({
    userEmail: user?.email || null,
    ownPlayerIds: ownPlayerIdList,
    selectedTeamId,
    parentTeamId,
    selectedSeason,
    setSelectedSeason,
    currentTeamSeason,
    teamSeasons,
  });

  // Update parentTeamId after players resolve (two-pass: null → resolved).
  //
  // This is derived state and useMemo would satisfy the linter, but the
  // deliberate two-pass timing is what lets the guardian-email lookup resolve
  // against a populated `players` array. Collapsing it to render-time
  // derivation risks the parent-team regression fixed in 8d0b224, so it stays
  // an effect until App.jsx has coverage to refactor against.
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
      (p) =>
        (selfPlayerIds.has(p.id) ||
          (user?.email && p.guardians?.some((g) => g.email?.toLowerCase() === user.email.toLowerCase()))) &&
        p.teamId,
    );
    setParentTeamId(myPlayer?.teamId || null);
  }, [isStaff, selectedTeamId, players, user, viewingAsParent, impersonatingAs, selfPlayerIds]);

  // For parents, fetch the team object directly since useTeamContext returns
  // an empty teams array for users with no roles.
  // The setState here is a reset guarding an async fetch, not derived state —
  // there is no non-effect form of "clear the previous team while the next one
  // loads".
  useEffect(() => {
    if (effectiveIsStaff || !parentTeamId) {
      setParentTeam(null);
      return;
    }
    supabaseService
      .getTeam(parentTeamId)
      .then(setParentTeam)
      .catch(() => setParentTeam(null))
      .finally(() => setParentTeamLoadedFor(parentTeamId));
  }, [effectiveIsStaff, parentTeamId]);

  const effectiveTeam = selectedTeam || parentTeam;

  // Guardian-only accounts have zero user_roles, so useTeamContext's `teams`
  // comes back empty and any view that resolves a player's team by id (the
  // team name, colors and payment_info on ParentView) finds nothing. Fold the
  // separately-fetched parentTeam in so those lookups still resolve.
  const contextTeams = useMemo(() => {
    if (teams.length > 0) return teams;
    return parentTeam ? [parentTeam] : [];
  }, [teams, parentTeam]);

  // Tab title tracks the team in context — for parents that is the team derived
  // from their player, not a staff team selection.
  useDocumentTitle(effectiveTeam?.name, club?.name);

  const {
    events,
    blackoutDates,
    toggleBlackout,
    syncCalendar,
    importFeed,
    refreshSchedule,
    loadedFor: scheduleLoadedFor,
  } = useSchedule(user, effectiveTeam);
  // Every RSVP for the team's events, shared by Home, the schedule and the calendar.
  const { rsvpsByEvent, dbEventOf, setRsvp } = useEventRsvps({ events, teamEvents });
  // Until the feed for the team on screen has landed, "no upcoming events" is
  // unknown rather than true — Home shows a placeholder instead of saying so.
  const scheduleLoading = scheduleLoadedFor !== (effectiveTeam?.id || '');

  // ── PARENT SEASON ──
  // Hold the parent page on the loading screen until their team's active season is the one shown and its
  // data is in (utils/parentSeason.js). Once settled it stays settled, so picking another season isn't held up.
  const expectedTeamId = expectedParentTeamId({
    viewingAsParent,
    impersonatingAs,
    isStaff,
    selectedTeamId,
    players,
    email: user?.email,
    selfIds: selfPlayerIds,
  });
  useEffect(() => {
    if (effectiveIsStaff) return;
    const loaded = {
      data: dataLoadedFor,
      checklist: checklistLoadedFor,
      teamSeasons: teamSeasonsFor,
      schedule: scheduleLoadedFor,
    };
    if (isParentSeasonSettled({ parentTeamId, loadedFor: parentTeamLoadedFor, parentTeam, selectedSeason, loaded })) {
      setParentSeasonReadyFor(parentTeamId);
    }
  }, [
    effectiveIsStaff,
    parentTeamId,
    parentTeamLoadedFor,
    parentTeam,
    selectedSeason,
    dataLoadedFor,
    checklistLoadedFor,
    teamSeasonsFor,
    scheduleLoadedFor,
  ]);
  const parentSeasonPending = isParentSeasonPending({
    signedIn: !!user,
    isStaff: effectiveIsStaff,
    firstLoadDone: dataLoadedFor !== null,
    parentTeamId,
    expectedTeamId,
    readyFor: parentSeasonReadyFor,
  });
  const {
    matchups,
    loading: matchupsLoading,
    createMatchup,
    updateMatchup,
    deleteMatchup,
    duplicateMatchup,
    setMatchupStatus,
    confirmMatchup,
    rescheduleMatchup,
  } = useMatchups(effectiveTeam, selectedSeason);
  const {
    contacts: opponentContacts,
    loading: opponentContactsLoading,
    createContact: createOpponentContact,
    updateContact: updateOpponentContact,
    deleteContact: deleteOpponentContact,
  } = useOpponentContacts(effectiveTeam);

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
    const email = user.email?.toLowerCase();
    // A guardian's children, and the player's own roster entry when they signed in themselves (marked isSelf,
    // so the schedule doesn't say "For Maya" to Maya).
    return players
      .filter((p) => selfPlayerIds.has(p.id) || (email && p.guardians?.some((g) => g.email?.toLowerCase() === email)))
      .map((p) => (selfPlayerIds.has(p.id) ? { ...p, isSelf: true } : p));
  }, [players, user, role, viewingAsParent, impersonatingAs, selfPlayerIds]);

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

  // Persist a new per-team distribution method, then refresh so currentSeasonData
  // (and therefore the distribution engine) picks it up.
  const handleSetDistributionMethod = async (method) => {
    if (!teamSeasonId) return;
    await supabaseService.setDistributionMethod(teamSeasonId, method);
    await refreshSeasons();
  };

  const { handleSavePlayer, handleArchivePlayer, handleToggleWaiveFee } = usePlayerManager(
    fetchData,
    club?.id || null,
    selectedTeamId,
    setPlayers,
  );

  const {
    handleSaveTransaction,
    handleRefundTransaction,
    handleRecordPayment,
    handleDeleteTransaction,
    handleBulkUpload,
  } = useLedgerManager(
    fetchData,
    selectedSeason,
    teamSeasonId,
    setTransactions,
    // teamId lets the ledger create the team_seasons row on demand when the
    // team has no budget yet for this season; refreshSeasons then picks it up.
    // selectedTeamId, not effectiveTeamId — the ledger is staff-only, and a
    // parent's derived team must never provision a team season.
    { teamId: selectedTeamId, onTeamSeasonCreated: refreshSeasons },
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

  // effectiveTeamId, not selectedTeamId: parents never make a team selection,
  // and accounts carry the payment handles ParentView renders in "How to Pay".
  const {
    accounts,
    activeAccounts,
    accountsByHolding,
    accountMap,
    saveAccount,
    deleteAccount,
    isSaving: isAccountSaving,
  } = useAccounts(effectiveTeamId);

  const bookBalance = useBookBalance(selectedTeamId, transactions, accounts);

  // Sponsor directory — contact details, pledges, and logos. Team-scoped, so it
  // survives the season selector.
  const sponsorDirectory = useSponsors(effectiveTeamId);

  // ── AUTH LISTENER ──
  const lastUserIdRef = useRef(null);
  useEffect(() => {
    // Computed once per mount from the URL, not from isPasswordRecovery state
    // — this effect has a `[]` dep array, so reading the state var here would
    // capture its mount-time value and never see a later setIsPasswordRecovery.
    const isRecovery = typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

    const bootstrap = async (authUser) => {
      await supabaseService.ensureUserProfile(authUser);
      await supabaseService.claimMyInvitations();
      // setUser AFTER claim so useTeamContext's role fetch sees claimed rows.
      // Don't call fetchData() here — this effect has a `[]` dep array, so it
      // would always call the mount-time fetchData closure (userEmail always
      // null). The effect below re-fires fetchData() once `user` is actually
      // set, with a fresh, correctly-scoped closure.
      setUser(authUser);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      // A recovery link auto-establishes a session via the URL hash — don't
      // bootstrap into the full app on it; ResetPasswordView owns this session.
      if (isRecovery) {
        setLoading(false);
        return;
      }
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
      if (event === 'PASSWORD_RECOVERY') {
        // Backup signal alongside the hash check above (in case of timing
        // races) — never bootstrap on this session either.
        setIsPasswordRecovery(true);
        setLoading(false);
      } else if (event === 'SIGNED_IN') {
        if (isRecovery) return;
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
        // Drop this user's cached Supabase rows so they aren't left on disk for
        // whoever uses the device next. Fire-and-forget — the service worker
        // may be absent (dev, unsupported browser) and sign-out must not block.
        swCacheService.purgeDataCaches();
      }
      // All other events (TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED)
      // are intentionally ignored here.
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-fetch when the user, team, or season context changes. `user` is in the
  // trigger set (not just selectedTeamId/parentTeamId) so parents — who never
  // get a selectedTeamId and whose parentTeamId is itself derived from this
  // fetch's own guardian-email lookup — get an initial fetchData() call at
  // all; without it there is no path that ever populates their team.
  //
  // The dependency list is curated on purpose. `fetchData` is recreated every
  // render, so adding it — as exhaustive-deps wants — would refetch in a loop
  // until it is wrapped in useCallback with its own correct deps. That is a
  // real change to the path commit 8d0b224 fixed for a stale-closure bug, and
  // App.jsx has no test coverage, so the rule is silenced rather than guessed at.
  useEffect(() => {
    if (user) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedTeamId, parentTeamId, selectedSeason, currentTeamSeason?.id]);

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
  const handleSyncCalendar = async (urlOverride) => {
    const count = await syncCalendar(urlOverride);
    await refreshTeamEvents(selectedTeamId || parentTeamId);
    showToast(t('toast.syncedEvents', { n: count }));
  };

  // After an event is added, moved or cancelled in the app: the list and the saved rows both reload.
  const handleScheduleChanged = async () => {
    await Promise.all([refreshSchedule(), refreshTeamEvents(selectedTeamId || parentTeamId)]);
  };

  // Who runs the team's schedule. Moving to the app copies the feed in first, practices included, so nothing
  // drops off the calendar; moving back to the feed lets the next sync take over again; feed + app syncs the
  // whole feed in alongside the events added here, which it leaves alone.
  const handleSetScheduleSource = async (source) => {
    const teamId = selectedTeamId || parentTeamId;
    if (!teamId) return;
    let imported = 0;
    if (source === 'app') imported = await importFeed();
    await supabaseService.setScheduleSource(teamId, source);
    if (refreshContext) await refreshContext();
    await refreshTeamEvents(teamId);
    if (source === 'feed' && effectiveTeam?.icalUrl) await syncCalendar(effectiveTeam.icalUrl).catch(() => {});
    if (source === 'hybrid' && effectiveTeam?.icalUrl) {
      // The team in context still has the old source until it reloads, so the sync is told which mode to use.
      imported = await syncCalendar(effectiveTeam.icalUrl, { source: 'hybrid' }).catch(() => 0);
    }
    showToast(
      source === 'app'
        ? t('toast.scheduleNowApp', { n: imported })
        : source === 'hybrid'
          ? t('toast.scheduleNowHybrid', { n: imported })
          : t('toast.scheduleNowFeed'),
    );
  };

  const handleTeamEventTypeChange = async (dbEventId, newType) => {
    await supabaseService.updateTeamEventType(dbEventId, newType);
    updateTeamEvent(dbEventId, { eventType: newType, typeLocked: true });
  };

  // A blank field clears the score, so a mistyped result can be taken back.
  const handleTeamEventScore = async (dbEventId, scoreFor, scoreAgainst) => {
    await supabaseService.updateTeamEventScore(dbEventId, scoreFor, scoreAgainst);
    updateTeamEvent(dbEventId, { scoreFor, scoreAgainst });
  };

  // Returns the in-band result so the expense form can surface a save failure
  // instead of silently closing.
  const handleSaveExpense = async (txData) => await handleSaveTransaction(txData);

  // The cleared date defaults to today rather than the row's event date: money
  // marked cleared moved now, and reconciliation counts it in this month.
  const handleToggleCleared = async (txId, cleared, clearedDate = null) => {
    await supabaseService.updateTransaction(txId, {
      cleared,
      clearedDate: cleared ? clearedDate || todayStr() : null,
    });
    fetchData();
  };

  const handleDeleteExpense = async (txId) => {
    await handleDeleteTransaction(txId);
  };

  // One insert and one refetch for the whole batch — going through
  // handleSaveExpense per row would refetch the world dozens of times.
  const handleBulkAddExpenses = async (rows) => await handleBulkUpload(rows);

  // ── PASSWORD RECOVERY ── (short-circuits before team-context loading,
  // which never resolves here since `user` is intentionally never set)
  if (isPasswordRecovery) {
    return (
      <ErrorBoundary>
        <ResetPasswordView />
      </ErrorBoundary>
    );
  }

  // ── LOADING STATES ──
  if (loading || contextLoading || settingsLoading || parentSeasonPending)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-200 dark:border-blue-800 border-t-blue-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );

  // ── PUBLIC / UNAUTHENTICATED ──
  // This bundle only ever serves the app host (app.canteramanager.com and the
  // club's portal.* domain), so `/` is the sign-in form, not the landing page —
  // that is a separate entry mapped to the apex in vercel.json. Every unmatched
  // path falls through to the form as well, so a deep link or bookmark (say
  // /finance/ledger) lands on auth and resolves to the requested route once the
  // session is established — see the routing fix in 01927cb.
  const signInScreen = (
    <div className="relative">
      <LoginView />
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {LANDING_URL && (
          <a
            href={LANDING_URL}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            {t('common.home')}
          </a>
        )}
        <button
          onClick={() => navigate('/calendar')}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          {t('common.calendar')}
        </button>
      </div>
    </div>
  );

  if (!user) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/calendar/:teamId?" element={<PublicCalendarView onBack={() => navigate('/')} />} />
          <Route path="/login" element={signInScreen} />
          <Route path="*" element={signInScreen} />
        </Routes>
      </ErrorBoundary>
    );
  }

  // ── NAV ──
  const singleTeam = resolveSingleTeamMode(appSettings);
  // App-wide single-team mode and the personal team-only scope hide the same
  // surfaces — collapse them into one flag so nav and routes can't drift.
  const clubUiHidden = isClubUiHidden({ singleTeam, viewScope });
  // The scope picker is pointless under single-team mode (club UI is already
  // gone for everyone) and meaningless for users with no club-level role.
  const canSetViewScope = (isClubAdmin || isSuperAdmin) && !singleTeam;

  const appNavItems =
    isSuperAdmin && !clubUiHidden ? [{ id: 'app-admin', label: 'App Admin', icon: Shield, section: 'app' }] : [];

  const clubNavItems = [
    ...((isClubAdmin || isSuperAdmin) && !clubUiHidden
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
      : []),
    // The one club surface every team needs: the shared home field. It sits in
    // the club group for everyone on staff, not just admins, because booking a
    // slot is a team's job and approving it is the admin's.
    ...(effectiveIsStaff && !clubUiHidden && !fieldScheduleHidden
      ? [{ id: 'field-schedule', label: t('nav.fieldSchedule'), icon: MapPin, section: 'club' }]
      : []),
  ];

  // `section` drives the sidebar group header and the breadcrumb trail
  // (see utils/pageMeta.js) — keep it set on every nav item.
  const seasonNavItems = effectiveIsStaff
    ? [
        { id: 'dashboard', label: t('nav.seasonOverview'), icon: LayoutDashboard, section: 'season' },
        // Ahead of Budget and Ledger on purpose: the season is planned first,
        // budgeted from that plan, and only then recorded as it is spent.
        ...(can(PERMISSIONS.TEAM_EDIT_SCHEDULE)
          ? [{ id: 'planner', label: t('nav.planner'), icon: ClipboardList, section: 'season' }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_BUDGET)
          ? [{ id: 'finance/budget', label: t('nav.budget'), icon: FileSpreadsheet, section: 'season' }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_LEDGER)
          ? [{ id: 'finance/ledger', label: t('nav.ledger'), icon: ReceiptText, section: 'season' }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_SPONSORS)
          ? [{ id: 'finance/fundraising', label: t('nav.fundraising'), icon: Handshake, section: 'season' }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_LEDGER)
          ? [{ id: 'finance/book-balance', label: t('nav.bookBalance'), icon: BookOpen, section: 'season' }]
          : []),
      ]
    : isPlayerAccount
      ? [{ id: 'dashboard', label: t('nav.home'), icon: Users, section: 'season' }]
      : [{ id: 'dashboard', label: t('nav.myPlayer'), icon: Users, section: 'season' }];

  // The Stats tab's pages (utils/navDestinations.js): game film, for everyone on a team.
  const statsNavItems = effectiveTeamId
    ? [{ id: 'film', label: t('nav.gameFilm'), icon: Clapperboard, section: 'team' }]
    : [];

  const teamNavItems = effectiveIsStaff
    ? [
        { id: 'schedule', label: t('nav.schedule'), icon: Calendar, section: 'team' },
        ...(can(PERMISSIONS.TEAM_VIEW_ROSTER)
          ? [{ id: 'people', label: t('nav.players'), icon: Users, section: 'team' }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_CHECKLIST)
          ? [{ id: 'checklist', label: t('nav.checklist'), icon: ListChecks, section: 'team' }]
          : []),
        ...(can(PERMISSIONS.TEAM_MANAGE_USERS)
          ? [{ id: 'team-users', label: t('nav.users', 'Users'), icon: Shield, section: 'team' }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_INSIGHTS) && !insightsHidden
          ? [{ id: 'insights', label: t('nav.insights'), icon: Sparkles, section: 'team' }]
          : []),
        ...(can(PERMISSIONS.TEAM_VIEW_ROSTER) && !evaluationsHidden
          ? [
              {
                id: 'season-evaluations',
                label: t('nav.evaluations', 'Evaluations'),
                icon: ClipboardCheck,
                section: 'team',
              },
            ]
          : []),
        ...(can(PERMISSIONS.TEAM_EDIT_SCHEDULE)
          ? [{ id: 'team-admin', label: t('nav.settings'), icon: SlidersHorizontal, section: 'team' }]
          : []),
      ]
    : // Parents get the checklist first: it is the only surface here that asks
      // something of them, and burying it cost them a tab dive to find it.
      [
        // A player signed in as themselves has no paperwork: the checklist is their guardian's.
        ...(isPlayerAccount ? [] : [{ id: 'checklist', label: t('nav.checklist'), icon: ListChecks, section: 'team' }]),
        { id: 'schedule', label: t('nav.schedule'), icon: Calendar, section: 'team' },
      ];
  teamNavItems.push(...statsNavItems);

  const canEditSchedule = can(PERMISSIONS.TEAM_EDIT_SCHEDULE);
  // A team manager books the home field outright; everyone else with schedule
  // access files a request for a club admin to settle.
  const canBookField = can(PERMISSIONS.TEAM_BOOK_FIELD);
  const canEditLedger = can(PERMISSIONS.TEAM_EDIT_LEDGER);

  const navContextValue = {
    isPlayerAccount,
    canEditSchedule,
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
    supabase,
    effectiveIsStaff,
    isClubAdmin,
    canEditLedger,
    singleTeam,
  };

  const dataContextValue = {
    players,
    setPlayers,
    seasonalPlayers,
    archivedPlayers,
    myPlayers,
    transactions,
    setTransactions,
    seasonalTransactions,
    playerFinancials,
    teamEvents,
    collapsedTeamEvents,
    fetchData,
    viewingAsParent,
    impersonatingAs,
    // Season compliance, derived from the team's checklist — see utils/compliance.js.
    checklist,
    compliance,
    refreshChecklist,
  };

  const financeContextValue = {
    teamBalance,
    totalExpenses,
    formatMoney,
    calculatePlayerFinancials,
    handleWaterfallCredit,
    revertWaterfall,
    handleSetDistributionMethod,
  };

  const scheduleContextValue = {
    events,
    rsvpsByEvent,
    dbEventOf,
    setRsvp,
    scheduleLoading,
    blackoutDates,
    toggleBlackout,
    handleSyncCalendar,
    handleScheduleChanged,
    handleSetScheduleSource,
    handleTeamEventTypeChange,
    handleTeamEventScore,
    handleSaveExpense,
    handleToggleCleared,
    handleDeleteExpense,
    handleBulkAddExpenses,
    matchups,
    matchupsLoading,
    createMatchup,
    updateMatchup,
    deleteMatchup,
    duplicateMatchup,
    setMatchupStatus,
    confirmMatchup,
    rescheduleMatchup,
    opponentContacts,
    opponentContactsLoading,
    createOpponentContact,
    updateOpponentContact,
    deleteOpponentContact,
  };

  // The public calendar is a page of its own (own header, no app chrome), and it has to open for a signed-in
  // visitor too: the marketing page and shared links send everyone to /calendar.
  if (location.pathname === '/calendar' || location.pathname.startsWith('/calendar/')) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route
            path="/calendar/:teamId?"
            element={<PublicCalendarView signedIn onBack={() => navigate('/dashboard')} />}
          />
        </Routes>
      </ErrorBoundary>
    );
  }

  return (
    <NavigationContext.Provider value={navContextValue}>
      <DataContext.Provider value={dataContextValue}>
        <FinanceContext.Provider value={financeContextValue}>
          <ScheduleContext.Provider value={scheduleContextValue}>
            <ChatProvider userId={user?.id}>
              <AppShell
                banner={
                  viewingAsParent ? (
                    /* Sticks directly beneath the app header (3.5rem) and below
                       it in the stack, so the "who am I acting as" answer stays
                       on screen no matter how far the page scrolls. */
                    <div className="sticky top-14 z-[1029] flex items-center justify-between gap-3 border-b border-black/10 bg-warning px-4 py-2 text-warning-foreground shadow-sm">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Eye size={14} />
                        <span>
                          {t('impersonation.viewingAs')}{' '}
                          <span className="font-bold">
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
                        className="rounded-md bg-black/15 px-3 py-1 text-xs font-bold transition-colors hover:bg-black/25"
                      >
                        {t('common.exit')}
                      </button>
                    </div>
                  ) : null
                }
              >
                <AppRoutes
                  user={user}
                  club={club}
                  teams={contextTeams}
                  selectedTeam={selectedTeam}
                  selectedTeamId={selectedTeamId}
                  effectiveTeamId={effectiveTeamId}
                  setSelectedTeamId={setSelectedTeamId}
                  userRoles={userRoles}
                  effectiveRole={effectiveRole}
                  isClubAdmin={isClubAdmin}
                  isSuperAdmin={isSuperAdmin}
                  effectiveIsStaff={effectiveIsStaff}
                  scorekeeperTeamIds={scorekeeperTeamIds}
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
                  sponsorDirectory={sponsorDirectory}
                  accounts={accounts}
                  activeAccounts={activeAccounts}
                  accountsByHolding={accountsByHolding}
                  accountMap={accountMap}
                  saveAccount={saveAccount}
                  deleteAccount={deleteAccount}
                  isAccountSaving={isAccountSaving}
                  effectiveTeam={effectiveTeam}
                  canEditSchedule={canEditSchedule}
                  canBookField={canBookField}
                  canEditLedger={canEditLedger}
                  handleSaveTransaction={handleSaveTransaction}
                  handleRefundTransaction={handleRefundTransaction}
                  handleRecordPayment={handleRecordPayment}
                  handleDeleteTransaction={handleDeleteTransaction}
                  handleBulkUpload={handleBulkUpload}
                  isBulkUploading={isBulkUploading}
                  setIsBulkUploading={setIsBulkUploading}
                  handleSavePlayer={handleSavePlayer}
                  handleArchivePlayer={handleArchivePlayer}
                  handleToggleWaiveFee={handleToggleWaiveFee}
                  confirmDialog={confirmDialog}
                  impersonatingAs={impersonatingAs}
                  setImpersonatingAs={setImpersonatingAs}
                  toast={toast}
                  setToast={setToast}
                  showToast={showToast}
                  showConfirm={showConfirm}
                  navigate={navigate}
                  bookBalance={bookBalance}
                  clubUiHidden={clubUiHidden}
                  viewScope={viewScope}
                  onChangeViewScope={setViewScope}
                  canSetViewScope={canSetViewScope}
                  singleTeamEnabled={singleTeamEnabled}
                  onToggleSingleTeam={handleToggleSingleTeam}
                  evaluationsHidden={evaluationsHidden}
                  onToggleHideEvaluations={handleToggleHideEvaluations}
                  insightsHidden={insightsHidden}
                  onToggleHideInsights={handleToggleHideInsights}
                  fieldScheduleHidden={fieldScheduleHidden}
                  onToggleHideFieldSchedule={handleToggleHideFieldSchedule}
                />
              </AppShell>
              <NotificationPermissionBanner />
              <OutboxIndicator />
              <OfflineBanner />
            </ChatProvider>
          </ScheduleContext.Provider>
        </FinanceContext.Provider>
      </DataContext.Provider>
    </NavigationContext.Provider>
  );
}

export default App;
