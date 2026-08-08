import { useState } from 'react';
import { Check, Clock, Minus, FileText, Loader2 } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { checklistService } from '../services/checklistService';
import { canStaffCycle, nextCellState, isFormItem, CHECKLIST_FORMS } from '../utils/checklist';
import { itemStatusFor, responseFor, formsFor, ITEM_STATUS, EMPTY_COMPLIANCE } from '../utils/compliance';
import Badge from './layout/Badge';

/**
 * PlayerCompliancePanel — one player's season compliance, on the admin side.
 *
 * This replaced the fixed medical / ReePlayer / club-registration switches. Those
 * three were hardcoded; compliance is the team's checklist now, so the panel
 * renders whatever the team actually authored and stays in step when they change
 * it. It is the staff-side mirror of what the parent sees in PlayerChecklistCard.
 *
 * Rows follow the same rules as the admin matrix: a value-bearing or form-linked
 * item is the parent's to answer, so staff can only sign it off, and only once
 * the answer is in (canStaffCycle). The medical release row opens the form rather
 * than offering a tick, which is why `onOpenMedicalForm` is a callback — both
 * hosts already own that modal.
 */
export default function PlayerCompliancePanel({
  player,
  compliance = EMPTY_COMPLIANCE,
  checklistId,
  canManage = false,
  user,
  showToast,
  onChanged,
  onOpenMedicalForm,
}) {
  const { t } = useT();
  const [busyKey, setBusyKey] = useState(null);

  const items = compliance.items || [];

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('checklist.noChecklist')}</p>;
  }

  const cycle = async (item) => {
    const current = responseFor(compliance, player.id, item.key);
    if (!canManage || !canStaffCycle(item, current, formsFor(compliance, player.id))) return;
    setBusyKey(item.key);
    try {
      await checklistService.applyCellState({
        checklistId,
        playerId: player.id,
        itemKey: item.key,
        next: nextCellState(item, current),
        current,
        userId: user?.id,
      });
      await onChanged?.();
    } catch (e) {
      showToast?.(t('checklist.saveFailed', { message: e.message }), true);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const status = itemStatusFor(compliance, player.id, item);
        const current = responseFor(compliance, player.id, item.key);
        const actionable = canManage && canStaffCycle(item, current, formsFor(compliance, player.id));
        const isMedical = item.linkedForm === CHECKLIST_FORMS.MEDICAL_RELEASE;
        const busy = busyKey === item.key;

        return (
          <div key={item.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              {!item.required && (
                <Badge tone="secondary" className="ml-2">
                  {t('checklist.optional')}
                </Badge>
              )}
              {item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
              {/* Says why the row is not clickable, rather than leaving a dead control. */}
              {canManage && !actionable && status !== ITEM_STATUS.COMPLETE && !isMedical && (
                <p className="mt-0.5 text-xs text-muted-foreground">{t('checklist.parentAnswersThis')}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {isMedical && onOpenMedicalForm && (
                <button
                  type="button"
                  onClick={onOpenMedicalForm}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                    status === ITEM_STATUS.COMPLETE
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:text-emerald-300'
                      : 'bg-red-100 text-red-700 hover:bg-red-200 dark:text-red-400'
                  }`}
                >
                  <FileText size={11} />
                  {status === ITEM_STATUS.COMPLETE ? t('checklist.viewForm') : t('checklist.openForm')}
                </button>
              )}

              <StatusPill t={t} status={status} actionable={actionable} busy={busy} onClick={() => cycle(item)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ t, status, actionable, busy, onClick }) {
  const label =
    status === ITEM_STATUS.COMPLETE
      ? t('checklist.complete')
      : status === ITEM_STATUS.AWAITING
        ? t('checklist.awaitingVerification')
        : t('checklist.incomplete');

  const tone =
    status === ITEM_STATUS.COMPLETE
      ? 'border-success bg-success text-success-foreground'
      : status === ITEM_STATUS.AWAITING
        ? 'border-warning bg-warning/20 text-warning'
        : 'border-border text-muted-foreground';

  const Icon = status === ITEM_STATUS.COMPLETE ? Check : status === ITEM_STATUS.AWAITING ? Clock : Minus;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actionable || busy}
      title={label}
      aria-label={label}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors disabled:cursor-default ${tone} ${
        actionable && !busy ? 'hover:opacity-80' : ''
      } ${busy ? 'opacity-50' : ''}`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={13} />}
    </button>
  );
}
