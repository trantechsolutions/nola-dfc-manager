import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Settings } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { PERMISSIONS } from '../utils/roles';
import { isSingleTeamMode } from '../utils/singleTeamMode';
import { supabaseService } from '../services/supabaseService';
import { useData } from '../context/DataContext';
import { useFinanceContext } from '../context/FinanceContext';
import { useScheduleContext } from '../context/ScheduleContext';
import { useImpersonationGuard } from '../hooks/useImpersonationGuard';

import ErrorBoundary from './ErrorBoundary';
import TransactionModal from './TransactionModal';
import PlayerFormModal from './PlayerFormModal';
import PlayerModal from './PlayerModal';
import ConfirmModal from './ConfirmModal';

// Eagerly loaded: always needed on first render
import TeamOverviewView from '../views/team/TeamOverviewView';
import ParentView from '../views/team/ParentView';

// Lazy-loaded: heavy views deferred until navigated to
const InsightsView = lazy(() => import('../views/team/InsightsView'));
const ScheduleView = lazy(() => import('../views/team/ScheduleView'));
const ClubDashboard = lazy(() => import('../views/club/ClubDashboard'));
const TeamList = lazy(() => import('../views/club/TeamList'));
const TeamOnboarding = lazy(() => import('../views/club/TeamOnboarding'));
const FinanceView = lazy(() => import('../views/team/FinanceView'));
const PeopleView = lazy(() => import('../views/team/PeopleView'));
const ClubAdminHub = lazy(() => import('../views/club/ClubAdminHub'));
const TeamSettingsView = lazy(() => import('../views/team/TeamSettingsView'));
const Changelog = lazy(() => import('./Changelog'));
const SuperAdminView = lazy(() => import('../views/admin/SuperAdminView'));
const ClubPlayersView = lazy(() => import('../views/club/ClubPlayersView'));
const SeasonEvaluationView = lazy(() => import('../views/team/SeasonEvaluationView'));

// Inline route fallback — matches the app's existing loading spinner
function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-800 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

export default function AppRoutes({
  // Auth / team context
  user,
  club,
  teams,
  selectedTeam,
  selectedTeamId,
  setSelectedTeamId,
  userRoles,
  effectiveRole,
  isClubAdmin,
  isSuperAdmin,
  effectiveIsStaff,
  can,
  refreshContext,

  // Season
  seasons,
  teamSeasons,
  selectedSeason,
  setSelectedSeason,
  currentSeasonData,
  currentTeamSeason,
  teamSeasonId,
  refreshSeasons,

  // Finance helpers (non-context)
  formatMoney,

  // Category / account
  customCategories,
  categoryLabels,
  categoryColors,
  categoryOptions,
  saveCategory,
  deleteCategory,
  isCategorySaving,
  accounts,
  activeAccounts,
  accountsByHolding,
  accountMap,
  saveAccount,
  deleteAccount,
  isAccountSaving,

  // Schedule permissions + team
  effectiveTeam,
  canEditSchedule,

  // Book balance
  bookBalance,

  // Transaction handlers
  canEditLedger,
  handleSaveTransaction,
  handleDeleteTransaction,
  handleBulkUpload,
  isBulkUploading,
  setIsBulkUploading,

  // Player handlers
  handleSavePlayer,
  handleArchivePlayer,
  handleToggleWaiveFee,

  // Modal state
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
  showToast,
  showConfirm,

  // Navigation
  navigate,
}) {
  const { t } = useT();
  const singleTeam = isSingleTeamMode();

  const {
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
    viewingAsParent,
  } = useData();

  const { isReadOnly, guardedAction } = useImpersonationGuard(user);

  const { teamBalance, totalExpenses, calculatePlayerFinancials, handleWaterfallCredit, revertWaterfall } =
    useFinanceContext();

  const {
    events,
    blackoutDates,
    toggleBlackout,
    handleSyncCalendar,
    handleTeamEventTypeChange,
    handleSaveExpense,
    handleToggleCleared,
    handleDeleteExpense,
  } = useScheduleContext();

  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {!singleTeam && isSuperAdmin && (
              <Route
                path="/app-admin"
                element={
                  <SuperAdminView
                    onSelectClub={() => {
                      refreshContext();
                      navigate('/club-overview');
                    }}
                    showToast={showToast}
                    showConfirm={showConfirm}
                  />
                }
              />
            )}

            {!singleTeam && (isClubAdmin || isSuperAdmin) && (
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
                    canViewFinancials={can(PERMISSIONS.TEAM_VIEW_BUDGET) || can(PERMISSIONS.TEAM_VIEW_LEDGER)}
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
                    onToggleWaive={guardedAction((pId, state) => handleToggleWaiveFee(pId, selectedSeason, state), {
                      action: 'toggle_waive_fee',
                      tableName: 'players',
                    })}
                    accountMap={accountMap}
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
                    user={user}
                    accounts={accounts}
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
                  activeAccounts={activeAccounts}
                  accountMap={accountMap}
                />
              }
            />

            {canEditSchedule && (
              <Route
                path="/team-admin"
                element={
                  <TeamSettingsView
                    selectedTeam={selectedTeam}
                    refreshContext={refreshContext}
                    showToast={showToast}
                    accounts={accounts}
                    onSaveAccount={saveAccount}
                    onDeleteAccount={deleteAccount}
                    isAccountSaving={isAccountSaving}
                  />
                }
              />
            )}

            {effectiveIsStaff && (
              <Route
                path="/season-evaluations"
                element={
                  <SeasonEvaluationView
                    players={seasonalPlayers}
                    selectedSeason={selectedSeason}
                    selectedTeamId={selectedTeamId}
                    teamSeasonId={teamSeasonId}
                    clubId={club?.id}
                    showToast={showToast}
                    user={user}
                    userRoles={userRoles}
                  />
                }
              />
            )}
            {/* Club evaluations (tryouts) - disabled for now
          <Route path="/evaluate/:sessionId" element={<EvaluatorScoringView user={user} showToast={showToast} />} />
          */}

            <Route path="/changelog" element={<Changelog />} />

            {effectiveIsStaff && (
              <>
                {/* Finance hub: Ledger + Budget + Fundraising */}
                {(can(PERMISSIONS.TEAM_VIEW_LEDGER) ||
                  can(PERMISSIONS.TEAM_VIEW_BUDGET) ||
                  can(PERMISSIONS.TEAM_VIEW_SPONSORS)) && (
                  <Route
                    path="/finance/*"
                    element={
                      <FinanceView
                        visibleTabs={[
                          ...(can(PERMISSIONS.TEAM_VIEW_LEDGER) ? ['ledger'] : []),
                          ...(can(PERMISSIONS.TEAM_VIEW_BUDGET) ? ['budget'] : []),
                          ...(can(PERMISSIONS.TEAM_VIEW_SPONSORS) ? ['fundraising'] : []),
                          ...(can(PERMISSIONS.TEAM_VIEW_LEDGER) ? ['book-balance'] : []),
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
                                onDeleteTx:
                                  canEditLedger && !isReadOnly
                                    ? guardedAction(
                                        async (id) => {
                                          const ok = await showConfirm(t('toast.deleteTxConfirm'));
                                          if (ok) {
                                            await handleDeleteTransaction(id);
                                            showToast(t('toast.txDeleted'));
                                          }
                                        },
                                        { action: 'delete_transaction', tableName: 'transactions' },
                                      )
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
                                selectedSeason,
                                teamSeasonId,
                                calculatePlayerFinancials,
                                accounts,
                                activeAccounts,
                                accountsByHolding,
                                accountMap,
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
                        bookBalanceProps={
                          can(PERMISSIONS.TEAM_VIEW_LEDGER) && bookBalance
                            ? {
                                ...bookBalance,
                                accounts,
                                transactions: seasonalTransactions,
                                formatMoney,
                                showConfirm,
                                isSuperAdmin,
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
                <Route path="/ledger" element={<Navigate to="/finance/ledger" replace />} />
                <Route path="/budget" element={<Navigate to="/finance/budget" replace />} />
                <Route path="/sponsors" element={<Navigate to="/finance/fundraising" replace />} />
                <Route path="/finance" element={<Navigate to="/finance/ledger" replace />} />
                <Route path="/roster" element={<Navigate to="/people" replace />} />
                <Route path="/documents" element={<Navigate to="/people" replace />} />
                <Route path="/team-users" element={<Navigate to="/people" replace />} />
              </>
            )}

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>

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
        isReadOnly={isReadOnly}
        onSubmit={guardedAction(
          async (data) => {
            await handleSavePlayer(data);
            setShowPlayerForm(false);
            showToast(playerToEdit ? t('toast.playerUpdated') : t('toast.playerAdded'));
          },
          { action: 'save_player', tableName: 'players' },
        )}
        onArchive={guardedAction(
          async (id) => {
            const ok = await showConfirm(t('toast.archivePlayerConfirm'));
            if (ok) {
              await handleArchivePlayer(id);
              setShowPlayerForm(false);
              showToast(t('toast.playerArchived'));
            }
          },
          { action: 'archive_player', tableName: 'players' },
        )}
        onClose={() => setShowPlayerForm(false)}
      />

      <TransactionModal
        show={showTxForm}
        initialData={txToEdit}
        isReadOnly={isReadOnly}
        onSubmit={guardedAction(
          async (data) => {
            const r = await handleSaveTransaction(data);
            if (r && r.success === false) {
              showToast(r.error, true);
            } else {
              setShowTxForm(false);
              showToast(txToEdit ? t('toast.txUpdated') : t('toast.txAdded'));
            }
          },
          { action: 'save_transaction', tableName: 'transactions' },
        )}
        onClose={() => setShowTxForm(false)}
        players={seasonalPlayers}
        categoryOptions={categoryOptions}
        teamEvents={collapsedTeamEvents}
        activeAccounts={activeAccounts}
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
    </>
  );
}
