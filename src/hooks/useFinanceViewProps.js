import { useT } from '../i18n/I18nContext';
import { PERMISSIONS } from '../utils/roles';
import { useData } from '../context/DataContext';
import { useFinanceContext } from '../context/FinanceContext';
import { PANELS } from '../utils/panelRoute';

/**
 * Builds everything FinanceView hands to its four tabs.
 *
 * This used to be ~200 lines of object literals inline in AppRoutes' JSX, which
 * made the route table unreadable and put four unrelated feature surfaces in one
 * place. Moving it here does not remove the prop drilling — the leaf views still
 * take what they take — but it gives each bag a name, a home and somewhere to
 * assert against, and it lets the values that already live in context be read
 * rather than passed down twice.
 *
 * Everything sourced from `useData`/`useFinanceContext` below is deliberately
 * absent from the argument list: passing it in as well would mean two paths to
 * the same value and one of them going stale.
 */
export function useFinanceViewProps({
  // Permissions and the impersonation guard
  can,
  canEditLedger,
  canPushPlannedCosts,
  isReadOnly,
  isSuperAdmin,
  guardedAction,

  // Season and team context
  selectedSeason,
  setSelectedSeason,
  seasons,
  refreshSeasons,
  teamSeasons,
  teamSeasonId,
  selectedTeam,
  selectedTeamId,
  currentTeamSeason,
  currentSeasonData,
  club,

  // Categories and accounts
  categoryLabels,
  categoryColors,
  categoryOptions,
  accounts,
  activeAccounts,
  accountsByHolding,
  accountMap,

  // Planner, book balance, sponsor directory
  plannedSummary,
  plannedEntries,
  planContributions,
  pushPlannedCosts,
  bookBalance,
  sponsorDirectory,

  // Write handlers
  handleDeleteTransaction,
  handleSaveTransaction,
  handleBulkUpload,
  isBulkUploading,
  setIsBulkUploading,

  // UI
  openPanel,
  showToast,
  showConfirm,
}) {
  const { t } = useT();
  const { seasonalTransactions, seasonalPlayers, fetchData } = useData();
  const {
    formatMoney,
    calculatePlayerFinancials,
    handleWaterfallCredit,
    revertWaterfall,
    handleSetDistributionMethod,
  } = useFinanceContext();

  const visibleTabs = [
    ...(can(PERMISSIONS.TEAM_VIEW_LEDGER) ? ['ledger'] : []),
    ...(can(PERMISSIONS.TEAM_VIEW_BUDGET) ? ['budget'] : []),
    ...(can(PERMISSIONS.TEAM_VIEW_SPONSORS) ? ['fundraising'] : []),
    ...(can(PERMISSIONS.TEAM_VIEW_LEDGER) ? ['book-balance'] : []),
  ];

  const ledgerProps = can(PERMISSIONS.TEAM_VIEW_LEDGER)
    ? {
        transactions: seasonalTransactions,
        formatMoney,
        onAddTx: canEditLedger ? () => openPanel(PANELS.TX) : null,
        onEditTx: canEditLedger ? (tx) => openPanel(PANELS.TX, { id: tx.id }) : null,
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
        onRefundTx: canEditLedger && !isReadOnly ? (tx) => openPanel(PANELS.REFUND, { id: tx.id }) : null,
        onRecordPayment: canEditLedger && !isReadOnly ? (tx) => openPanel(PANELS.PAYMENT, { id: tx.id }) : null,
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
    : null;

  const budgetProps = can(PERMISSIONS.TEAM_VIEW_BUDGET)
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
        plannedSummary,
        plannedEntries,
        planContributions,
        onPushPlannedCosts: canPushPlannedCosts
          ? guardedAction(pushPlannedCosts, { action: 'push_planned_costs', tableName: 'budget_items' })
          : null,
      }
    : null;

  const canEditSponsors = can(PERMISSIONS.TEAM_EDIT_SPONSORS);

  const fundraisingProps = can(PERMISSIONS.TEAM_VIEW_SPONSORS)
    ? {
        transactions: seasonalTransactions,
        selectedSeason,
        formatMoney,
        currentSeasonData,
        onDistribute:
          canEditSponsors && currentSeasonData?.isFinalized
            ? async (amt, title, pId, originalId, category, allocations) => {
                try {
                  await handleWaterfallCredit(amt, title, pId, originalId, category, allocations);
                  await fetchData();
                  showToast(t('toast.fundsDistributed'));
                } catch (error) {
                  showToast(error.message, true);
                }
              }
            : null,
        onReset:
          canEditSponsors && currentSeasonData?.isFinalized
            ? async (batchId, originalTxId) => {
                try {
                  await revertWaterfall(batchId, originalTxId);
                  showToast(t('toast.distributionReverted'));
                } catch (error) {
                  // A failed undo used to reject silently, so the credits stayed on
                  // the books with nothing on screen to say so.
                  showToast(error.message, true);
                } finally {
                  // Refresh either way: a partial undo still changed the ledger.
                  await fetchData();
                }
              }
            : null,
        distributionMethod: currentSeasonData?.distributionMethod || 'waterfall',
        onSetDistributionMethod: canEditSponsors
          ? async (method) => {
              try {
                await handleSetDistributionMethod(method);
                showToast(t('toast.distributionMethodSaved'));
              } catch (error) {
                showToast(error.message, true);
              }
            }
          : null,
        seasonalPlayers,
        seasons,
        calculatePlayerFinancials,
        activeAccounts,
        // Intake writes a real ledger entry, so it follows ledger-edit rights
        // rather than sponsor rights — a sponsor manager can distribute but not
        // book money.
        onAddFunds:
          canEditLedger && !isReadOnly
            ? async (data) => {
                const result = await handleSaveTransaction(data);
                if (!result || result.success !== false) {
                  showToast(t('toast.fundsRecorded'));
                }
                return result;
              }
            : null,
        // Linking writes to `transactions`, so every directory action that
        // touches the ledger refetches — otherwise a just-attached deposit keeps
        // showing up as an unlinked suggestion.
        sponsorDirectory: sponsorDirectory && {
          ...sponsorDirectory,
          linkTransactions: async (sponsorId, txIds) => {
            await sponsorDirectory.linkTransactions(sponsorId, txIds);
            await fetchData();
          },
          importFromLedger: async (group) => {
            const created = await sponsorDirectory.importFromLedger(group);
            await fetchData();
            return created;
          },
          deleteSponsor: async (id, logoPath) => {
            await sponsorDirectory.deleteSponsor(id, logoPath);
            await fetchData();
          },
        },
        showConfirm,
        canEditSponsorDirectory: canEditSponsors && !isReadOnly,
      }
    : null;

  const bookBalanceProps =
    can(PERMISSIONS.TEAM_VIEW_LEDGER) && bookBalance
      ? {
          ...bookBalance,
          accounts,
          transactions: seasonalTransactions,
          formatMoney,
          showConfirm,
          isSuperAdmin,
        }
      : null;

  return { visibleTabs, ledgerProps, budgetProps, fundraisingProps, bookBalanceProps };
}
