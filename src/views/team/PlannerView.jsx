// The planner: where a season is shaped before any of it is scheduled or spent.
//
// It used to be a tab inside the schedule, which put it downstream of the very
// calendar it exists to fill. It is its own route now, and it sits above Budget
// in the nav because that is the order the work happens in — you plan the
// season, you budget what the plan will cost, and only then does the ledger
// have anything to record.
//
// A route-level shell only: the planner draws a card per club you play, with
// that club's contact on the card and its games underneath (see
// MatchupPlanner), wired to the same handlers the schedule tab used.

import MatchupPlanner from '../../components/MatchupPlanner';

export default function PlannerView({
  matchups = [],
  matchupsLoading = false,
  canEditSchedule = false,
  blackoutDates = [],
  onCreateMatchup = null,
  onUpdateMatchup = null,
  onDeleteMatchup = null,
  onDuplicateMatchup = null,
  onSetMatchupStatus = null,
  onConfirmMatchup = null,
  onRescheduleMatchup = null,
  opponentContacts = [],
  opponentContactsLoading = false,
  onCreateOpponentContact = null,
  onUpdateOpponentContact = null,
  onDeleteOpponentContact = null,
  // ── Expected costs (preseason budgeting) ──
  plannedCosts = null,
  plannedSummary = null,
  onAddPlannedCost = null,
  onUpdatePlannedCost = null,
  onDeletePlannedCost = null,
  onPushPlannedCosts = null,
  onFileAllCostsToLedger = null,
  ledgerReadyCount = 0,
  onSendCostToLedger = null,
  isCostBudgeted = () => false,
  // Ledger rows by id, so an estimate that was filed can show whether it is
  // still pending or has since been approved.
  ledgerTxById = {},
  budgetLocked = false,
  hasSeasonBudget = true,
  budgetRecalculatesFee = true,
}) {
  return (
    <div className="space-y-4">
      <MatchupPlanner
        matchups={matchups}
        loading={matchupsLoading}
        canEdit={canEditSchedule}
        blackoutDates={blackoutDates}
        onCreate={onCreateMatchup}
        onUpdate={onUpdateMatchup}
        onDelete={onDeleteMatchup}
        onDuplicate={onDuplicateMatchup}
        onSetStatus={onSetMatchupStatus}
        onConfirm={onConfirmMatchup}
        onReschedule={onRescheduleMatchup}
        contacts={opponentContacts}
        contactsLoading={opponentContactsLoading}
        onCreateContact={onCreateOpponentContact}
        onUpdateContact={onUpdateOpponentContact}
        onDeleteContact={onDeleteOpponentContact}
        plannedCosts={plannedCosts}
        plannedSummary={plannedSummary}
        onAddPlannedCost={onAddPlannedCost}
        onUpdatePlannedCost={onUpdatePlannedCost}
        onDeletePlannedCost={onDeletePlannedCost}
        onPushPlannedCosts={onPushPlannedCosts}
        onFileAllCostsToLedger={onFileAllCostsToLedger}
        ledgerReadyCount={ledgerReadyCount}
        onSendCostToLedger={onSendCostToLedger}
        isCostBudgeted={isCostBudgeted}
        ledgerTxById={ledgerTxById}
        budgetLocked={budgetLocked}
        budgetAvailable={hasSeasonBudget}
        budgetRecalculatesFee={budgetRecalculatesFee}
      />
    </div>
  );
}
