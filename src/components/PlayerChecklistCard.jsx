import { useState, useMemo } from 'react';
import { ListChecks, Check, ExternalLink, Upload, Clock, AlertTriangle, Loader2, FileText } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { useChecklist } from '../hooks/useChecklist';
import { documentService } from '../services/documentService';
import MedicalReleaseForm from './MedicalReleaseForm';
import {
  CHECKLIST_ITEM_TYPES,
  CHECKLIST_FORMS,
  computePlayerProgress,
  isItemSatisfied,
  isAwaitingVerification,
  isOverdue,
  isParentItem,
  isFormItem,
  formStatusForPlayer,
} from '../utils/checklist';
import { formControl } from './layout/formControl';
import Badge from './layout/Badge';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * PlayerChecklistCard — the parent-facing half of the season checklist.
 *
 * Shows only the items addressed to parents; `audience: 'admin'` tasks are the
 * staff's own tracking and never surface here. Each row writes its own response
 * row, so two guardians on the same player can work through the list at once
 * without clobbering each other's answers.
 */
export default function PlayerChecklistCard({
  player,
  teamId,
  seasonId,
  clubId,
  user,
  showToast,
  onRefresh,
  isReadOnly = false,
}) {
  const { t } = useT();
  const { checklist, responsesByPlayer, loading, saveResponse } = useChecklist({
    teamId,
    seasonId,
    playerId: player?.id,
  });

  const responses = useMemo(() => responsesByPlayer[player?.id] || {}, [responsesByPlayer, player?.id]);
  const parentItems = useMemo(() => (checklist?.items || []).filter(isParentItem), [checklist]);
  // Linked-form items read their completion from the form's own record rather
  // than a response row — see formStatusForPlayer.
  const forms = useMemo(() => formStatusForPlayer(player, seasonId), [player, seasonId]);
  const progress = useMemo(
    () => computePlayerProgress(parentItems, responses, { forms }),
    [parentItems, responses, forms],
  );

  // A linked form writes to its own tables, not checklist_responses, so the
  // item only re-reads as done once the player record is refetched.
  const onFormCompleted = () => onRefresh?.();

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-6 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  // Drafts are filtered out by RLS, so "no checklist" and "not published yet"
  // look the same from here — one message covers both.
  if (!checklist || parentItems.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        {t('checklist.noChecklistParentMsg')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <ListChecks size={18} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{checklist.title || t('checklist.parentTitle')}</p>
          <p className="text-xs text-muted-foreground">
            {t('checklist.progress', { done: progress.requiredDone, total: progress.requiredTotal })}
          </p>
        </div>
        <Badge tone={progress.complete ? 'success' : 'warning'}>{progress.pct}%</Badge>
      </div>

      <div
        className="h-1.5 w-full bg-muted"
        role="progressbar"
        aria-valuenow={progress.pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full transition-all ${progress.complete ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${progress.pct}%` }}
        />
      </div>

      {/* `complete` counts required items only, so claiming "nothing
          outstanding" while optional rows sit unticked below would read as a
          contradiction. Say which kind of done it is. */}
      {progress.complete && (
        <p className="flex items-center gap-2 border-b border-border bg-success/10 px-4 py-2 text-xs font-semibold text-success">
          <Check size={13} />
          {progress.outstanding.length === 0 ? t('checklist.parentAllDone') : t('checklist.parentRequiredDone')}
        </p>
      )}

      <ul className="divide-y divide-border">
        {parentItems.map((item) => (
          <ChecklistItemRow
            key={item.key}
            t={t}
            item={item}
            response={responses[item.key]}
            forms={forms}
            player={player}
            clubId={clubId}
            teamId={teamId}
            seasonId={seasonId}
            user={user}
            isReadOnly={isReadOnly}
            showToast={showToast}
            onSave={saveResponse}
            onFormCompleted={onFormCompleted}
          />
        ))}
      </ul>
    </div>
  );
}

function ChecklistItemRow({
  t,
  item,
  response,
  forms,
  player,
  clubId,
  teamId,
  seasonId,
  user,
  isReadOnly,
  showToast,
  onSave,
  onFormCompleted,
}) {
  const [busy, setBusy] = useState(false);
  const [draftValue, setDraftValue] = useState(response?.value ?? '');
  const [showMedicalForm, setShowMedicalForm] = useState(false);

  const satisfied = isItemSatisfied(item, response, forms);
  const awaiting = isAwaitingVerification(item, response, forms);
  const overdue = isOverdue(item, response, undefined, forms);
  const linkedForm = isFormItem(item);

  const persist = async (patch) => {
    if (isReadOnly || busy) return;
    setBusy(true);
    try {
      await onSave({
        playerId: player.id,
        itemKey: item.key,
        completed: response?.completed === true,
        value: response?.value ?? null,
        documentId: response?.documentId ?? null,
        userId: user?.id,
        ...patch,
      });
      showToast?.(t('checklist.responseSaved'));
    } catch (e) {
      showToast?.(t('checklist.saveFailed', { message: e.message }), true);
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast?.(t('checklist.saveFailed', { message: `${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB max` }), true);
      return;
    }
    setBusy(true);
    try {
      // Reuses the player-documents bucket so checklist uploads inherit the
      // storage RLS and show up alongside the player's other paperwork.
      const doc = await documentService.uploadDocument(file, player.id, {
        clubId,
        teamId,
        seasonId,
        docType: `checklist:${item.key}`,
        title: item.label,
      });
      await onSave({
        playerId: player.id,
        itemKey: item.key,
        completed: true,
        value: file.name,
        documentId: doc.id,
        userId: user?.id,
      });
      showToast?.(t('checklist.uploaded'));
    } catch (e) {
      showToast?.(t('checklist.saveFailed', { message: e.message }), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex gap-3 p-4">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          satisfied
            ? 'border-success bg-success text-success-foreground'
            : overdue
              ? 'border-destructive text-destructive'
              : 'border-border text-muted-foreground'
        }`}
      >
        {satisfied ? <Check size={13} /> : overdue ? <AlertTriangle size={12} /> : null}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`text-sm font-semibold ${satisfied ? 'text-muted-foreground line-through' : 'text-foreground'}`}
          >
            {item.label}
          </p>
          {!item.required && <Badge tone="secondary">{t('checklist.optional')}</Badge>}
          {overdue && <Badge tone="danger">{t('checklist.overdue')}</Badge>}
          {awaiting && (
            <Badge tone="warning">
              <Clock size={10} /> {t('checklist.awaitingVerification')}
            </Badge>
          )}
        </div>

        {item.description && <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>}
        {item.dueDate && !satisfied && (
          <p className="text-xs text-muted-foreground">{t('checklist.dueOn', { date: item.dueDate })}</p>
        )}

        {/* A linked-form item is completed by finishing the form itself, so it
            shows the launcher instead of any of the manual controls below. */}
        {linkedForm && (
          <>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => setShowMedicalForm(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                satisfied
                  ? 'border border-border bg-card text-foreground hover:bg-muted'
                  : 'bg-primary text-primary-foreground hover:opacity-90'
              }`}
            >
              <FileText size={12} />
              {satisfied ? t('checklist.viewForm') : t('checklist.openForm')}
            </button>
            {item.linkedForm === CHECKLIST_FORMS.MEDICAL_RELEASE && (
              <MedicalReleaseForm
                show={showMedicalForm}
                onClose={() => setShowMedicalForm(false)}
                player={player}
                clubId={clubId}
                seasonId={seasonId}
                onCompleted={onFormCompleted}
              />
            )}
          </>
        )}

        {!linkedForm && item.type === CHECKLIST_ITEM_TYPES.LINK && item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink size={12} /> {t('checklist.openLink')}
          </a>
        )}

        {!linkedForm && (item.type === CHECKLIST_ITEM_TYPES.TEXT || item.type === CHECKLIST_ITEM_TYPES.DATE) && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type={item.type === CHECKLIST_ITEM_TYPES.DATE ? 'date' : 'text'}
              value={draftValue}
              disabled={isReadOnly || busy}
              onChange={(e) => setDraftValue(e.target.value)}
              placeholder={t('checklist.answerPlaceholder')}
              aria-label={item.label}
              className={`${formControl} sm:max-w-xs`}
            />
            <button
              type="button"
              disabled={isReadOnly || busy || !draftValue.trim()}
              onClick={() => persist({ value: draftValue.trim(), completed: true })}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {t('checklist.save')}
            </button>
          </div>
        )}

        {!linkedForm && item.type === CHECKLIST_ITEM_TYPES.FILE && (
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted ${
                isReadOnly || busy ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <Upload size={12} />
              {response?.documentId ? t('checklist.replaceFile') : t('checklist.uploadFile')}
              <input
                type="file"
                className="hidden"
                disabled={isReadOnly || busy}
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
            </label>
            {response?.value && <span className="truncate text-xs text-muted-foreground">{response.value}</span>}
          </div>
        )}

        {!linkedForm &&
          item.type !== CHECKLIST_ITEM_TYPES.TEXT &&
          item.type !== CHECKLIST_ITEM_TYPES.DATE &&
          item.type !== CHECKLIST_ITEM_TYPES.FILE && (
            <button
              type="button"
              disabled={isReadOnly || busy}
              onClick={() => persist({ completed: !response?.completed })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                response?.completed
                  ? 'border border-border bg-card text-foreground hover:bg-muted'
                  : 'bg-primary text-primary-foreground hover:opacity-90'
              }`}
            >
              {response?.completed ? (
                t('checklist.markNotDone')
              ) : (
                <>
                  <Check size={12} />
                  {item.type === CHECKLIST_ITEM_TYPES.ACK
                    ? t('checklist.acknowledge')
                    : item.type === CHECKLIST_ITEM_TYPES.LINK
                      ? t('checklist.confirmVisited')
                      : t('checklist.markDone')}
                </>
              )}
            </button>
          )}
      </div>
    </li>
  );
}
