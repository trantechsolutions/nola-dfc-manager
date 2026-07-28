import { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2, RotateCcw, AlertTriangle, Copy } from 'lucide-react';
import { MATCHUP_STATUS_META, nextStatuses } from '../utils/matchupStatus';
import { useT } from '../i18n/I18nContext';

const UNSCHEDULED_KEY = '__unscheduled__';

function groupByWeek(matchups) {
  const groups = new Map();
  matchups.forEach((m) => {
    const key = m.weekLabel || UNSCHEDULED_KEY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  return Array.from(groups.entries());
}

const WeekHeader = ({ weekLabel, canEdit, onRename, t }) => {
  const isUnscheduled = weekLabel === UNSCHEDULED_KEY;
  const displayValue = isUnscheduled ? '' : weekLabel;

  if (!canEdit) {
    return (
      <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide">
        {isUnscheduled ? t('schedule.unscheduledWeek') : weekLabel}
      </h3>
    );
  }

  return (
    <input
      key={weekLabel}
      type="text"
      defaultValue={displayValue}
      placeholder={t('schedule.unscheduledWeek')}
      title={t('schedule.editWeekLabel')}
      onBlur={(e) => {
        const next = e.target.value.trim();
        if (next === displayValue) return;
        onRename(next || null);
      }}
      className="text-xs font-bold uppercase text-muted-foreground tracking-wide bg-transparent border-b border-transparent hover:border-border focus:border-ring outline-none px-0.5 -ml-0.5 w-56 max-w-full"
    />
  );
};

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

const MatchupRow = ({
  matchup,
  canEdit,
  isBlackedOut,
  onUpdate,
  onSetStatus,
  onConfirm,
  onReschedule,
  onDuplicate,
  onDelete,
}) => {
  const { t } = useT();
  const meta = MATCHUP_STATUS_META[matchup.status] || MATCHUP_STATUS_META.open;
  const editableTerminal = matchup.status === 'dns' || matchup.status === 'cancelled';
  const canConfirm = nextStatuses(matchup.status).includes('confirmed') && !!matchup.matchDate;

  const commit = (field, value) => {
    if (matchup[field] === value) return;
    onUpdate(matchup.id, { [field]: value });
  };

  return (
    <div
      className={`bg-card rounded-lg border p-3 flex flex-wrap items-center gap-2 ${
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

      <input
        type="text"
        defaultValue={matchup.opponentName || ''}
        disabled={!canEdit || editableTerminal}
        placeholder={t('schedule.opponentPlaceholder')}
        onBlur={(e) => commit('opponentName', e.target.value)}
        className="min-w-[9rem] flex-1 px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <input
        type="date"
        defaultValue={matchup.matchDate || ''}
        disabled={!canEdit || editableTerminal}
        onBlur={(e) => commit('matchDate', e.target.value || null)}
        className="px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <input
        type="time"
        defaultValue={matchup.matchTime || ''}
        disabled={!canEdit || editableTerminal}
        onBlur={(e) => commit('matchTime', e.target.value || null)}
        className="px-2 py-1 text-sm bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

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
}) {
  const { t } = useT();
  const [newWeekLabel, setNewWeekLabel] = useState('');

  const blackoutSet = useMemo(() => new Set(blackoutDates), [blackoutDates]);
  const groups = useMemo(() => groupByWeek(matchups), [matchups]);

  const handleAdd = () => {
    onCreate({ weekLabel: newWeekLabel.trim() || null });
    setNewWeekLabel('');
  };

  if (loading) {
    return <div className="text-center text-sm text-muted-foreground py-10">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex items-center gap-2">
          <input
            type="text"
            value={newWeekLabel}
            onChange={(e) => setNewWeekLabel(e.target.value)}
            placeholder={t('schedule.weekLabelPlaceholder')}
            className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus size={14} /> {t('schedule.addMatchup')}
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="bg-card rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground font-semibold italic text-sm">
          {t('schedule.noMatchups')}
        </div>
      ) : (
        groups.map(([weekLabel, rows]) => (
          <div key={weekLabel} className="space-y-2">
            <WeekHeader
              weekLabel={weekLabel}
              canEdit={canEdit}
              onRename={(newLabel) => rows.forEach((m) => onUpdate(m.id, { weekLabel: newLabel }))}
              t={t}
            />
            {rows.map((matchup) => (
              <MatchupRow
                key={matchup.id}
                matchup={matchup}
                canEdit={canEdit}
                isBlackedOut={!!matchup.matchDate && blackoutSet.has(matchup.matchDate)}
                onUpdate={onUpdate}
                onSetStatus={onSetStatus}
                onConfirm={onConfirm}
                onReschedule={onReschedule}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
