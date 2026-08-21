// The planner: one card per club you play, each holding that club's contact and
// every game against them.
//
// It used to be a contact directory stacked on top of a flat list of games
// grouped by week, which is the shape a league schedule arrives in but not the
// shape the work takes — you deal with one club at a time, and the week a game
// lands in is an outcome of that conversation, not the frame around it. The
// week label survives as a field on each game row.
//
// Everything downstream is untouched: the forecast bar, the per-game cost
// editor and the ledger filing all work exactly as they did.

import { useState, useMemo } from 'react';
import { Plus, BookPlus } from 'lucide-react';
import { buildOpponentCards, clubKey } from '../utils/opponentCards';
import OpponentTeamCard from './OpponentTeamCard';
import PlannedCostsBudgetBar from './PlannedCostsBudgetBar';
import { useT } from '../i18n/I18nContext';

/**
 * Files every budgeted estimate the ledger has not seen yet, in one go.
 *
 * Two clicks, because it writes one pending expense per estimate and there is
 * no single undo for that — the second click is the receipt for meaning it.
 */
const LedgerBulkBar = ({ count, onFileAll, t }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await onFileAll();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm p-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <BookPlus size={13} /> {t('planCosts.bulkTitle')}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {count === 0 ? t('planCosts.bulkNone') : t('planCosts.bulkHint', { n: count })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t('common.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={handle}
          disabled={count === 0 || busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-default flex items-center gap-1"
        >
          <BookPlus size={12} />
          {busy
            ? t('common.saving')
            : confirming
              ? t('planCosts.bulkConfirm', { n: count })
              : t('planCosts.bulkFile', { n: count })}
        </button>
      </div>
    </div>
  );
};

export default function MatchupPlanner({
  matchups = [],
  loading = false,
  canEdit = false,
  blackoutDates = [],
  onCreate,
  onUpdate,
  onDelete,
  onDuplicate,
  onSetStatus,
  onConfirm,
  onReschedule,
  // ── Opponent clubs (the cards themselves) ──
  contacts = [],
  contactsLoading = false,
  onCreateContact = null,
  onUpdateContact = null,
  onDeleteContact = null,
  // ── Expected costs (preseason budgeting) ──
  plannedCosts = null,
  plannedSummary = null,
  onAddPlannedCost = null,
  onUpdatePlannedCost = null,
  onDeletePlannedCost = null,
  onPushPlannedCosts = null,
  onSendCostToLedger = null,
  onFileAllCostsToLedger = null,
  ledgerReadyCount = 0,
  isCostBudgeted = () => false,
  ledgerTxById = {},
  budgetLocked = false,
  budgetAvailable = true,
  budgetRecalculatesFee = true,
}) {
  const { t } = useT();
  const [newClubName, setNewClubName] = useState('');

  const blackoutSet = useMemo(() => new Set(blackoutDates), [blackoutDates]);
  const cards = useMemo(() => buildOpponentCards(contacts, matchups), [contacts, matchups]);

  // Costs are opt-in: a caller that does not pass them (a read-only embed, a
  // parent-facing view) gets exactly the planner it had before.
  const showCosts = Array.isArray(plannedCosts);

  const handleAddTeam = () => {
    const clubName = newClubName.trim();
    if (!clubName || !onCreateContact) return;
    onCreateContact({ clubName });
    setNewClubName('');
  };

  const handleScheduleGame = (card) => {
    onCreate({ opponentName: card.clubName });
  };

  // The club name is the only thing tying a contact to its games, so a rename
  // has to carry both or the card splits in two on the next render.
  const handleRenameClub = (card, nextName) => {
    if (card.contact && onUpdateContact) onUpdateContact(card.contact.id, { clubName: nextName });
    matchups
      .filter((m) => clubKey(m.opponentName) === card.key)
      .forEach((m) => onUpdate(m.id, { opponentName: nextName }));
  };

  const handleSaveContact = (card) => {
    if (!onCreateContact) return;
    onCreateContact({ clubName: card.clubName });
  };

  if (loading || contactsLoading) {
    return <div className="text-center text-sm text-muted-foreground py-10">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      {showCosts && plannedSummary && (
        <PlannedCostsBudgetBar
          summary={plannedSummary}
          locked={budgetLocked}
          available={budgetAvailable}
          recalculatesFee={budgetRecalculatesFee}
          onPush={onPushPlannedCosts}
        />
      )}

      {/* Only for someone who can file in the ledger; hidden entirely when
          nothing has ever been budgeted, so it does not sit there inert. */}
      {showCosts && onFileAllCostsToLedger && (
        <LedgerBulkBar count={ledgerReadyCount} onFileAll={onFileAllCostsToLedger} t={t} />
      )}

      {canEdit && onCreateContact && (
        <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex items-center gap-2">
          <input
            type="text"
            value={newClubName}
            onChange={(e) => setNewClubName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
            placeholder={t('schedule.newTeamPlaceholder')}
            className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleAddTeam}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus size={14} /> {t('schedule.addTeam')}
          </button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="bg-card rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground font-semibold italic text-sm">
          {t('schedule.noTeams')}
        </div>
      ) : (
        cards.map((card) => (
          <OpponentTeamCard
            key={card.key}
            card={card}
            canEdit={canEdit}
            blackoutDates={blackoutSet}
            onScheduleGame={handleScheduleGame}
            onRenameClub={handleRenameClub}
            onSaveContact={handleSaveContact}
            onUpdateContact={onUpdateContact}
            onDeleteContact={onDeleteContact}
            onUpdateMatchup={onUpdate}
            onSetMatchupStatus={onSetStatus}
            onConfirmMatchup={onConfirm}
            onRescheduleMatchup={onReschedule}
            onDuplicateMatchup={onDuplicate}
            onDeleteMatchup={onDelete}
            costs={showCosts ? plannedCosts : []}
            showCosts={showCosts}
            onAddCost={onAddPlannedCost}
            onUpdateCost={onUpdatePlannedCost}
            onDeleteCost={onDeletePlannedCost}
            onSendCostToLedger={onSendCostToLedger}
            isCostBudgeted={isCostBudgeted}
            ledgerTxById={ledgerTxById}
          />
        ))
      )}
    </div>
  );
}
