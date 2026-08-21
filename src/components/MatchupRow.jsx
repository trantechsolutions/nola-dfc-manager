// One game against one opponent, as it sits inside that team's card.
//
// Lifted out of MatchupPlanner when the planner stopped being a flat list
// grouped by week and became a card per club. The opponent name is no longer a
// field here — the card is the opponent — and the week label moved onto the row
// in its place, since there is no week header to carry it any more.

import { useState } from 'react';
import { Trash2, CheckCircle2, RotateCcw, AlertTriangle, Copy, PiggyBank } from 'lucide-react';
import { MATCHUP_STATUS_META, nextStatuses } from '../utils/matchupStatus';
import { matchupPlannedTotal, FORECAST_STATUSES, halfForMatchup } from '../utils/plannedCostBudget';
import MatchupCostEditor from './MatchupCostEditor';
import { useT } from '../i18n/I18nContext';

const HomeAwayToggle = ({ value, onChange, disabled, t }) => (
  <div className="flex rounded-md border border-border overflow-hidden text-xs font-semibold shrink-0">
    {[
      { key: true, label: t('schedule.home') },
      { key: false, label: t('schedule.away') },
    ].map((opt) => (
      <button
        key={String(opt.key)}
        type="button"
        disabled={disabled}
        onClick={() => onChange(opt.key)}
        className={`px-2 py-1 transition-colors ${
          value === opt.key
            ? 'bg-blue-500 text-white'
            : 'bg-muted text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export default function MatchupRow({
  matchup,
  canEdit,
  isBlackedOut,
  // Only the "no opponent yet" card renders this: everywhere else the card the
  // row sits in already is the opponent, and a second place to type the name
  // would just be a way to move a game onto the wrong card by accident.
  showOpponentField = false,
  onUpdate,
  onSetStatus,
  onConfirm,
  onReschedule,
  onDuplicate,
  onDelete,
  costs = [],
  showCosts = false,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
  onSendCostToLedger,
  isCostBudgeted,
  ledgerTxById,
}) {
  const { t } = useT();
  const [costsOpen, setCostsOpen] = useState(false);
  const meta = MATCHUP_STATUS_META[matchup.status] || MATCHUP_STATUS_META.open;
  const editableTerminal = matchup.status === 'dns' || matchup.status === 'cancelled';
  const canConfirm = nextStatuses(matchup.status).includes('confirmed') && !!matchup.matchDate;
  const plannedTotal = matchupPlannedTotal(matchup.id, costs);
  // A cancelled or never-scheduled game keeps its numbers on screen for the
  // record, but they are struck from the forecast — see plannedCostBudget.
  const countsTowardBudget = FORECAST_STATUSES.has(matchup.status);
  // What Auto would pick, shown in the option so the default is never a guess.
  const derivedHalf = halfForMatchup({ matchDate: matchup.matchDate });

  const commit = (field, value) => {
    if (matchup[field] === value) return;
    onUpdate(matchup.id, { [field]: value });
  };

  return (
    <div
      className={`bg-card rounded-lg border p-3 flex flex-wrap items-center gap-2 shadow-sm ${
        isBlackedOut ? 'border-amber-300 dark:border-amber-700' : 'border-border'
      }`}
    >
      <select
        value={matchup.status}
        disabled={!canEdit || editableTerminal}
        onChange={(e) => onSetStatus(matchup, e.target.value)}
        className={`text-xs font-bold uppercase px-2 py-1 rounded outline-none cursor-pointer disabled:cursor-default ${meta.colorLight}`}
      >
        {[matchup.status, ...nextStatuses(matchup.status)].map((s) => (
          <option key={s} value={s}>
            {MATCHUP_STATUS_META[s]?.label || s}
          </option>
        ))}
      </select>

      <HomeAwayToggle
        value={matchup.isHome}
        disabled={!canEdit || editableTerminal}
        onChange={(v) => commit('isHome', v)}
        t={t}
      />

      {showOpponentField && (
        <input
          type="text"
          defaultValue={matchup.opponentName || ''}
          disabled={!canEdit || editableTerminal}
          placeholder={t('schedule.opponentPlaceholder')}
          aria-label={t('schedule.opponentPlaceholder')}
          onBlur={(e) => commit('opponentName', e.target.value.trim())}
          className="min-w-[9rem] flex-1 px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        />
      )}

      <input
        type="date"
        defaultValue={matchup.matchDate || ''}
        disabled={!canEdit || editableTerminal}
        aria-label={t('schedule.matchDate')}
        onBlur={(e) => commit('matchDate', e.target.value || null)}
        className="px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <input
        type="time"
        defaultValue={matchup.matchTime || ''}
        disabled={!canEdit || editableTerminal}
        aria-label={t('schedule.matchTime')}
        onBlur={(e) => commit('matchTime', e.target.value || null)}
        className="px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <input
        type="text"
        defaultValue={matchup.weekLabel || ''}
        disabled={!canEdit || editableTerminal}
        placeholder={t('schedule.weekPlaceholder')}
        title={t('schedule.editWeekLabel')}
        onBlur={(e) => commit('weekLabel', e.target.value.trim() || null)}
        className="w-28 px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      {/* Which half of the season this game's cost belongs to. Left on Auto it
          follows the date, which is all the schedule ever needed — but a game
          that has no date yet would otherwise land in fall by default, and in
          preseason that is most of them. */}
      <select
        value={matchup.seasonHalf || ''}
        disabled={!canEdit || editableTerminal}
        title={t('schedule.halfHint')}
        aria-label={t('schedule.half')}
        onChange={(e) => commit('seasonHalf', e.target.value || null)}
        className="w-28 px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      >
        <option value="">
          {t('schedule.halfAuto', { half: t(`schedule.half${derivedHalf === 'spring' ? 'Spring' : 'Fall'}`) })}
        </option>
        <option value="fall">{t('schedule.halfFall')}</option>
        <option value="spring">{t('schedule.halfSpring')}</option>
      </select>

      <input
        type="text"
        defaultValue={matchup.leagueMatchId || ''}
        disabled={!canEdit || editableTerminal}
        placeholder={t('schedule.matchIdPlaceholder')}
        onBlur={(e) => commit('leagueMatchId', e.target.value)}
        className="w-24 px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <input
        type="text"
        defaultValue={matchup.location || ''}
        disabled={!canEdit || editableTerminal}
        placeholder={t('schedule.locationPlaceholder')}
        onBlur={(e) => commit('location', e.target.value)}
        className="min-w-[8rem] flex-1 px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <input
        type="text"
        defaultValue={matchup.field || ''}
        disabled={!canEdit || editableTerminal}
        placeholder={t('schedule.fieldPlaceholder')}
        onBlur={(e) => commit('field', e.target.value)}
        className="w-24 px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <input
        type="text"
        defaultValue={matchup.notes || ''}
        disabled={!canEdit || editableTerminal}
        placeholder={t('schedule.notesPlaceholder')}
        onBlur={(e) => commit('notes', e.target.value)}
        className="min-w-[10rem] flex-[2] px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      {isBlackedOut && (
        <span
          className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400"
          title={t('schedule.blackoutWarning')}
        >
          <AlertTriangle size={13} />
        </span>
      )}

      {showCosts && (
        <button
          type="button"
          onClick={() => setCostsOpen((v) => !v)}
          title={t('planCosts.toggle')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border transition-colors ${
            plannedTotal > 0
              ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
              : 'border-border text-muted-foreground hover:text-foreground'
          } ${countsTowardBudget ? '' : 'line-through opacity-60'}`}
        >
          <PiggyBank size={13} />
          {plannedTotal > 0 ? `$${plannedTotal.toFixed(2)}` : t('planCosts.addShort')}
        </button>
      )}

      {canEdit && (
        <div className="flex items-center gap-1 ml-auto">
          {canConfirm && (
            <button
              onClick={() => onConfirm(matchup)}
              title={t('schedule.confirmMatchup')}
              className="p-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 size={15} />
            </button>
          )}
          {matchup.status === 'confirmed' && (
            <button
              onClick={() => onReschedule(matchup)}
              title={t('schedule.reschedule')}
              className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            >
              <RotateCcw size={15} />
            </button>
          )}
          <button
            onClick={() => onDuplicate(matchup)}
            title={t('schedule.duplicateMatchup')}
            className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          >
            <Copy size={15} />
          </button>
          <button
            onClick={() => onDelete(matchup.id)}
            title={t('common.delete')}
            className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}

      {showCosts && costsOpen && (
        <MatchupCostEditor
          costs={costs.filter((c) => c.matchupId === matchup.id)}
          canEdit={canEdit && !editableTerminal}
          onAdd={(cost) => onAddCost(matchup.id, cost)}
          onUpdate={onUpdateCost}
          onDelete={onDeleteCost}
          onSendToLedger={onSendCostToLedger ? (cost) => onSendCostToLedger(cost, matchup) : null}
          isBudgeted={(cost) => isCostBudgeted(cost, matchup)}
          ledgerTxById={ledgerTxById}
        />
      )}
    </div>
  );
}
