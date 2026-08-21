import { useState, useMemo, useEffect } from 'react';
import {
  ListChecks,
  Plus,
  Pencil,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Check,
  Clock,
  Minus,
  Download,
  SquarePen,
  CheckCheck,
  X,
} from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import AdminCard from '../../components/layout/AdminCard';
import Badge from '../../components/layout/Badge';
import ResponsiveModal from '../../components/layout/ResponsiveModal';
import PanelHost from '../../components/layout/PanelHost';
import { usePanelRoute } from '../../hooks/usePanelRoute';
import { formControl } from '../../components/layout/formControl';
import ChecklistEditor from './ChecklistEditor';
import { useChecklist } from '../../hooks/useChecklist';
import { checklistService } from '../../services/checklistService';
import { exportToCSV } from '../../utils/exportUtils';
import {
  computeChecklistSummary,
  isItemSatisfied,
  isAwaitingVerification,
  isOverdue,
  canStaffCycle,
  nextCellState,
  isFormItem,
  formStatusByPlayer,
  CHECKLIST_AUDIENCE,
} from '../../utils/checklist';
import { PANELS } from '../../utils/panelRoute';

const cellId = (playerId, itemKey) => `${playerId}:${itemKey}`;

/**
 * Save in small parallel batches. One request at a time is painfully slow across
 * a full roster; firing all of them at once buries the connection pool and makes
 * a partial failure impossible to report usefully.
 */
async function runInBatches(tasks, onProgress, size = 6) {
  for (let i = 0; i < tasks.length; i += size) {
    await Promise.all(
      tasks.slice(i, i + size).map(async (task) => {
        await task();
        onProgress?.();
      }),
    );
  }
}

/**
 * ChecklistManager — the staff side of the season checklist.
 *
 * One list per (team, season): the season picker above this view is what
 * chooses which list you are editing, and a season with no list shows the empty
 * state with "Create" and "Clone from another season" side by side.
 *
 * The matrix is players × items. A cell cycles not-done → done → confirmed →
 * not-done, so a manager can tick something off on a parent's behalf and sign
 * off a verified item without leaving the grid.
 */
export default function ChecklistManager({
  players = [],
  teamId,
  seasonId,
  seasonLabel,
  teamName,
  user,
  showToast,
  showConfirm,
  canManage = false,
}) {
  const { t } = useT();
  const {
    checklist,
    setChecklist,
    responses,
    responsesByPlayer,
    loading,
    refresh,
    runBatch,
    saveResponse,
    setVerification,
  } = useChecklist({ teamId, seasonId });

  const { panel, openPanel, closePanel } = usePanelRoute();
  const showEditor = panel === PANELS.CHECKLIST_EDITOR;
  const showClone = panel === PANELS.CHECKLIST_CLONE;
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [busyCell, setBusyCell] = useState(null);

  // ── BULK EDIT ──
  // Staged cell states keyed `playerId:itemKey`, each `{ completed, verified }`.
  // Nothing is written until Save, so a manager can work down a column at speed
  // and still back out of the whole thing.
  const [bulkMode, setBulkMode] = useState(false);
  const [staged, setStaged] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const roster = useMemo(
    () =>
      [...players].sort((a, b) =>
        `${a.lastName || ''}${a.firstName || ''}`.localeCompare(`${b.lastName || ''}${b.firstName || ''}`),
      ),
    [players],
  );

  // Linked-form items (the medical release) read their completion from the
  // player's season profile, not from checklist_responses.
  const formsByPlayer = useMemo(() => formStatusByPlayer(roster, seasonId), [roster, seasonId]);

  const summary = useMemo(
    () => computeChecklistSummary(checklist?.items || [], roster, responses, { formsByPlayer }),
    [checklist, roster, responses, formsByPlayer],
  );

  const visibleRoster = incompleteOnly ? roster.filter((p) => !summary.progressByPlayer[p.id]?.complete) : roster;

  const handleTogglePublished = async () => {
    try {
      const saved = await checklistService.saveChecklist({
        teamId,
        seasonId,
        title: checklist.title,
        items: checklist.items,
        isPublished: !checklist.isPublished,
        updatedBy: user?.id,
      });
      setChecklist(saved);
      showToast?.(saved.isPublished ? t('checklist.publishedToast') : t('checklist.unpublishedToast'));
    } catch (e) {
      showToast?.(t('checklist.saveFailed', { message: e.message }), true);
    }
  };

  // showConfirm resolves to the user's answer; it takes no callback.
  const handleDelete = async () => {
    const ok = await showConfirm?.(t('checklist.deleteConfirm'));
    if (!ok) return;
    try {
      await checklistService.deleteChecklist(checklist.id);
      showToast?.(t('checklist.deleted'));
      await refresh();
    } catch (e) {
      showToast?.(t('checklist.saveFailed', { message: e.message }), true);
    }
  };

  /**
   * What a cell shows right now: the server row with any staged edit laid over
   * it, so bulk mode previews its own result rather than the stale truth.
   */
  const resolveCell = (playerId, item) => {
    const response = responsesByPlayer[playerId]?.[item.key];
    const pending = staged[cellId(playerId, item.key)];
    return pending ? { ...response, ...pending } : response;
  };

  const formsFor = (playerId) => formsByPlayer[playerId] || {};

  /**
   * Push one cell's target state to the server. Sequencing lives in
   * checklistService.applyCellState so the per-player admin panel writes it the
   * same way. Optimistic rows still come back through saveResponse/setVerification
   * on the next silent refetch.
   */
  const writeCell = async (playerId, item, next) => {
    await checklistService.applyCellState({
      checklistId: checklist?.id,
      playerId,
      itemKey: item.key,
      next,
      current: responsesByPlayer[playerId]?.[item.key],
      userId: user?.id,
    });
  };

  /** Stage a cell in bulk mode, or write it straight through outside of it. */
  const cycleCell = async (player, item) => {
    if (!canManage) return;
    const current = resolveCell(player.id, item);
    if (!canStaffCycle(item, current, formsFor(player.id))) return;
    const next = nextCellState(item, current);

    if (bulkMode) {
      stageCells([{ playerId: player.id, item, next }]);
      return;
    }

    const id = cellId(player.id, item.key);
    setBusyCell(id);
    try {
      await writeCell(player.id, item, next);
    } catch (e) {
      showToast?.(t('checklist.saveFailed', { message: e.message }), true);
    } finally {
      setBusyCell(null);
    }
  };

  /**
   * Record staged states, dropping any that match the server again — toggling a
   * cell back to where it started should leave nothing to save, not a no-op write.
   */
  const stageCells = (changes) => {
    setStaged((prev) => {
      const draft = { ...prev };
      for (const { playerId, item, next } of changes) {
        const id = cellId(playerId, item.key);
        const server = responsesByPlayer[playerId]?.[item.key];
        const unchanged =
          (server?.completed === true) === next.completed && (server?.verified === true) === next.verified;
        if (unchanged) delete draft[id];
        else draft[id] = next;
      }
      return draft;
    });
  };

  /**
   * Sweep a whole column or row. Marks every cell staff can act on; if they are
   * all done already the same click clears them, so one control covers both ways.
   */
  const sweep = (cells) => {
    const actionable = cells.filter(({ playerId, item }) =>
      canStaffCycle(item, resolveCell(playerId, item), formsFor(playerId)),
    );
    if (actionable.length === 0) return;

    const allDone = actionable.every(({ playerId, item }) =>
      isItemSatisfied(item, resolveCell(playerId, item), formsFor(playerId)),
    );
    stageCells(
      actionable.map(({ playerId, item }) => ({
        playerId,
        item,
        // Sweeping to done means confirmed too, where the item asks for it —
        // otherwise "mark all" would leave a column of half-finished cells.
        next: allDone
          ? { completed: false, verified: false }
          : { completed: true, verified: !!item.requiresVerification },
      })),
    );
  };

  const stagedCount = Object.keys(staged).length;

  const exitBulkMode = () => {
    setBulkMode(false);
    setStaged({});
  };

  const handleBulkSave = async () => {
    const entries = Object.entries(staged);
    if (entries.length === 0) {
      showToast?.(t('checklist.bulkNoChanges'));
      return;
    }

    const itemsByKey = new Map(summary.items.map((item) => [item.key, item]));
    const tasks = [];
    for (const [id, next] of entries) {
      const [playerId, itemKey] = id.split(':');
      const item = itemsByKey.get(itemKey);
      // An item deleted from the list while edits were staged has nothing to
      // write to; skip rather than fail the whole save.
      if (item) tasks.push(() => writeCell(playerId, item, next));
    }

    setBulkSaving(true);
    let saved = 0;
    try {
      // runBatch mutes the realtime echo so N writes don't trigger N refetches.
      await runBatch(() => runInBatches(tasks, () => (saved += 1)));
      setStaged({});
      setBulkMode(false);
      showToast?.(t('checklist.bulkSaved', { count: tasks.length }));
    } catch (e) {
      // Partial success is the honest report: the rows that landed are already
      // committed, and the refetch in runBatch has reconciled the grid.
      setStaged({});
      showToast?.(t('checklist.bulkSaveFailed', { done: saved, total: tasks.length, message: e.message }), true);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleExport = () => {
    const columns = [
      { key: 'player', label: t('checklist.player') },
      { key: 'progress', label: t('checklist.matrixTitle') },
      ...summary.items.map((item) => ({ key: item.key, label: item.label })),
    ];
    const rows = roster.map((player) => {
      const progress = summary.progressByPlayer[player.id];
      const row = {
        player: `${player.firstName} ${player.lastName}`,
        progress: `${progress.requiredDone}/${progress.requiredTotal}`,
      };
      for (const item of summary.items) {
        const response = responsesByPlayer[player.id]?.[item.key];
        const forms = formsFor(player.id);
        row[item.key] = isItemSatisfied(item, response, forms)
          ? t('checklist.complete')
          : isAwaitingVerification(item, response, forms)
            ? t('checklist.awaitingVerification')
            : t('checklist.incomplete');
      }
      return row;
    });
    exportToCSV(rows, `checklist-${seasonId}`, columns);
  };

  if (loading) {
    return (
      <AdminCard title={t('checklist.title')} icon={ListChecks}>
        {t('common.loading')}
      </AdminCard>
    );
  }

  // ── Empty state: this season has no list yet ──
  if (!checklist) {
    return (
      <>
        <AdminCard title={t('checklist.title')} subtitle={seasonLabel || seasonId} icon={ListChecks}>
          <p className="mb-4 text-sm text-muted-foreground">
            {canManage ? t('checklist.noChecklistAdminMsg') : t('checklist.noChecklist')}
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <PrimaryButton icon={Plus} onClick={() => openPanel(PANELS.CHECKLIST_EDITOR)}>
                {t('checklist.create')}
              </PrimaryButton>
              <SecondaryButton icon={Copy} onClick={() => openPanel(PANELS.CHECKLIST_CLONE)}>
                {t('checklist.clone')}
              </SecondaryButton>
            </div>
          )}
        </AdminCard>

        <PanelHost>
          <ChecklistEditor
            open={showEditor}
            onClose={closePanel}
            teamId={teamId}
            seasonId={seasonId}
            seasonLabel={seasonLabel}
            checklist={null}
            user={user}
            showToast={showToast}
            onSaved={(saved) => setChecklist(saved)}
          />
          <CloneModal
            open={showClone}
            onClose={closePanel}
            teamId={teamId}
            seasonId={seasonId}
            seasonLabel={seasonLabel}
            user={user}
            showToast={showToast}
            onCloned={(saved) => setChecklist(saved)}
          />
        </PanelHost>
      </>
    );
  }

  return (
    <>
      <AdminCard
        title={checklist.title || t('checklist.title')}
        subtitle={t('checklist.subtitle', { season: seasonLabel || seasonId, team: teamName || '' })}
        icon={ListChecks}
        variant={checklist.isPublished ? 'success' : 'warning'}
        tools={
          canManage && (
            <div className="flex flex-wrap items-center gap-1.5">
              <SecondaryButton icon={Pencil} onClick={() => openPanel(PANELS.CHECKLIST_EDITOR)}>
                {t('checklist.edit')}
              </SecondaryButton>
              <SecondaryButton icon={Copy} onClick={() => openPanel(PANELS.CHECKLIST_CLONE)}>
                {t('checklist.clone')}
              </SecondaryButton>
              <SecondaryButton icon={checklist.isPublished ? EyeOff : Eye} onClick={handleTogglePublished}>
                {checklist.isPublished ? t('checklist.unpublish') : t('checklist.publish')}
              </SecondaryButton>
              <SecondaryButton icon={Trash2} destructive onClick={handleDelete}>
                {t('checklist.deleteChecklist')}
              </SecondaryButton>
            </div>
          )
        }
      >
        {!checklist.isPublished && (
          <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-semibold text-foreground">
            {t('checklist.draftNotice')}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge tone={checklist.isPublished ? 'success' : 'warning'}>
            {checklist.isPublished ? t('checklist.published') : t('checklist.draft')}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t('checklist.itemsCount', { count: checklist.items.length })}
          </span>
          <span className="text-xs font-semibold text-foreground">
            {t('checklist.rosterProgress', { done: summary.playersComplete, total: summary.playerCount })}
          </span>
        </div>

        {/* Per-item roll-up: the "who still owes me what" read at a glance. */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {summary.perItem.map(({ item, completed, awaiting, pct }) => (
            <div key={item.key} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground" title={item.label}>
                  {item.label}
                </p>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">{pct}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${pct === 100 ? 'bg-success' : 'bg-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 flex flex-wrap gap-2 text-[0.7rem] text-muted-foreground">
                <span>
                  {completed}/{summary.playerCount}
                </span>
                {awaiting > 0 && (
                  <span className="font-semibold text-warning">
                    {awaiting} {t('checklist.awaitingVerification')}
                  </span>
                )}
                {item.audience === CHECKLIST_AUDIENCE.ADMIN && (
                  <Badge tone="secondary">{t('checklist.staffOnly')}</Badge>
                )}
              </p>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard
        title={t('checklist.matrixTitle')}
        icon={ListChecks}
        tools={
          <div className="flex flex-wrap items-center gap-1.5">
            {canManage && (
              <SecondaryButton
                icon={bulkMode ? X : SquarePen}
                onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
              >
                {bulkMode ? t('checklist.bulkExit') : t('checklist.bulkEdit')}
              </SecondaryButton>
            )}
            <SecondaryButton onClick={() => setIncompleteOnly((v) => !v)}>
              {incompleteOnly ? t('checklist.showAll') : t('checklist.showIncomplete')}
            </SecondaryButton>
            <SecondaryButton icon={Download} onClick={handleExport}>
              {t('checklist.exportCsv')}
            </SecondaryButton>
          </div>
        }
        bodyClassName="p-0"
      >
        {bulkMode && (
          // Sticky so the Save button stays reachable while working down a long
          // roster — the whole point of staging is that you don't stop to save.
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-accent/10 px-4 py-2.5">
            <span className="text-xs font-semibold text-foreground">
              {stagedCount > 0 ? t('checklist.bulkPending', { count: stagedCount }) : t('checklist.bulkHint')}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <SecondaryButton onClick={exitBulkMode} disabled={bulkSaving}>
                {t('checklist.bulkDiscard')}
              </SecondaryButton>
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={bulkSaving || stagedCount === 0}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <CheckCheck size={12} /> {t('checklist.bulkSave')}
              </button>
            </div>
          </div>
        )}

        {roster.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t('checklist.noPlayers')}</p>
        ) : (
          // The matrix is as wide as the checklist is long, so it scrolls inside
          // its own container rather than pushing the page sideways.
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                    {t('checklist.player')}
                  </th>
                  {summary.items.map((item) => (
                    <th
                      key={item.key}
                      className="max-w-[9rem] px-3 py-3 text-left text-xs font-semibold text-muted-foreground"
                    >
                      <span className="line-clamp-2" title={item.label}>
                        {item.label}
                      </span>
                      {bulkMode && (
                        <SweepButton
                          label={t('checklist.markAllPlayers')}
                          onClick={() => sweep(visibleRoster.map((player) => ({ playerId: player.id, item })))}
                        />
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">%</th>
                </tr>
              </thead>
              <tbody>
                {visibleRoster.map((player) => {
                  const progress = summary.progressByPlayer[player.id];
                  return (
                    <tr key={player.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2 font-medium text-foreground">
                        <span className="flex items-center gap-2">
                          <span>
                            {player.firstName} {player.lastName}
                          </span>
                          {bulkMode && (
                            <SweepButton
                              label={t('checklist.markAllItems')}
                              onClick={() => sweep(summary.items.map((item) => ({ playerId: player.id, item })))}
                            />
                          )}
                        </span>
                      </td>
                      {summary.items.map((item) => (
                        <td key={item.key} className="px-3 py-2">
                          <MatrixCell
                            t={t}
                            item={item}
                            response={resolveCell(player.id, item)}
                            forms={formsFor(player.id)}
                            staged={Boolean(staged[cellId(player.id, item.key)])}
                            busy={busyCell === cellId(player.id, item.key)}
                            canManage={canManage}
                            onClick={() => cycleCell(player, item)}
                          />
                        </td>
                      ))}
                      <td
                        className={`px-4 py-2 text-right text-xs font-bold ${
                          progress.complete ? 'text-success' : 'text-muted-foreground'
                        }`}
                      >
                        {progress.pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <PanelHost>
        <ChecklistEditor
          open={showEditor}
          onClose={closePanel}
          teamId={teamId}
          seasonId={seasonId}
          seasonLabel={seasonLabel}
          checklist={checklist}
          user={user}
          showToast={showToast}
          onSaved={(saved) => setChecklist(saved)}
        />
        <CloneModal
          open={showClone}
          onClose={closePanel}
          teamId={teamId}
          seasonId={seasonId}
          seasonLabel={seasonLabel}
          user={user}
          showToast={showToast}
          onCloned={(saved) => setChecklist(saved)}
        />
      </PanelHost>
    </>
  );
}

function MatrixCell({ t, item, response, forms, busy, canManage, staged, onClick }) {
  const satisfied = isItemSatisfied(item, response, forms);
  const awaiting = isAwaitingVerification(item, response, forms);
  const overdue = isOverdue(item, response, undefined, forms);
  // A cell staff cannot act on stays visibly inert rather than swallowing clicks.
  const actionable = canManage && canStaffCycle(item, response, forms);

  const status = satisfied
    ? t('checklist.complete')
    : awaiting
      ? t('checklist.awaitingVerification')
      : overdue
        ? t('checklist.overdue')
        : t('checklist.incomplete');

  const hint = isFormItem(item) ? t('checklist.formDrivesThis') : t('checklist.parentAnswersThis');
  const label = `${item.label} — ${status}${!actionable && canManage ? ` · ${hint}` : ''}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actionable || busy}
      title={label}
      aria-label={`${item.label}: ${status}`}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors disabled:cursor-default ${
        satisfied
          ? 'border-success bg-success text-success-foreground'
          : awaiting
            ? 'border-warning bg-warning/20 text-warning'
            : overdue
              ? 'border-destructive text-destructive'
              : 'border-border text-muted-foreground'
      } ${actionable && !busy ? 'hover:opacity-80' : ''} ${busy ? 'opacity-50' : ''} ${
        // Staged edits get a ring so unsaved work is distinguishable from saved
        // at a glance — otherwise bulk mode looks identical to having saved.
        staged ? 'ring-2 ring-accent ring-offset-1 ring-offset-card' : ''
      }`}
    >
      {satisfied ? <Check size={13} /> : awaiting ? <Clock size={12} /> : <Minus size={12} />}
    </button>
  );
}

/** Column/row "mark all" control — only rendered in bulk mode. */
function SweepButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="mt-1 flex items-center gap-1 rounded px-1 py-0.5 text-[0.65rem] font-semibold text-accent transition-colors hover:bg-accent/10"
    >
      <CheckCheck size={11} />
    </button>
  );
}

/**
 * CloneModal — copies another checklist's items into this season.
 *
 * Sources are every checklist the caller can read, which for a club admin spans
 * teams; the label carries the team name so two teams' lists are distinguishable.
 */
function CloneModal({ open, onClose, teamId, seasonId, seasonLabel, user, showToast, onCloned }) {
  const { t } = useT();
  const [sources, setSources] = useState(null);
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);

  // Loaded on open rather than on mount — the list is only ever needed once the
  // admin reaches for it, and it changes as other seasons get lists.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setBusy(true);
    checklistService
      .listChecklistSources({ excludeTeamId: teamId, excludeSeasonId: seasonId })
      .then((rows) => {
        if (cancelled) return;
        setSources(rows);
        setSourceId(rows[0]?.id || '');
      })
      .catch((e) => {
        if (cancelled) return;
        setSources([]);
        showToast?.(t('checklist.saveFailed', { message: e.message }), true);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // showToast/t are stable enough in practice; re-running on them would refetch
    // the source list on every locale-provider render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId, seasonId]);

  const handleClose = () => {
    setSources(null);
    setSourceId('');
    onClose?.();
  };

  const handleClone = async () => {
    if (!sourceId) return;
    setBusy(true);
    try {
      const saved = await checklistService.cloneChecklist({
        sourceChecklistId: sourceId,
        teamId,
        seasonId,
        updatedBy: user?.id,
      });
      showToast?.(t('checklist.cloned'));
      onCloned?.(saved);
      handleClose();
    } catch (e) {
      showToast?.(t('checklist.saveFailed', { message: e.message }), true);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <ResponsiveModal open={open} onClose={handleClose} size="md">
      <ResponsiveModal.Header>
        <h3 className="text-lg font-bold text-foreground">{t('checklist.cloneTitle')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('checklist.cloneHelp', { season: seasonLabel || seasonId })}
        </p>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body>
        {sources !== null && sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('checklist.cloneNoSources')}</p>
        ) : (
          <label className="block text-sm font-medium text-foreground">
            {t('checklist.cloneSource')}
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              disabled={busy || !sources}
              className={`${formControl} mt-1.5`}
            >
              {(sources || []).map((source) => (
                <option key={source.id} value={source.id}>
                  {t('checklist.cloneSourceLabel', {
                    team: source.teamName,
                    season: source.seasonId,
                    count: source.itemCount,
                  })}
                </option>
              ))}
            </select>
          </label>
        )}
      </ResponsiveModal.Body>

      <ResponsiveModal.Footer>
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleClone}
          disabled={busy || !sourceId}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Copy size={12} /> {t('checklist.cloneConfirm')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}

function PrimaryButton({ icon: Icon, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
    >
      {Icon && <Icon size={13} />} {children}
    </button>
  );
}

function SecondaryButton({ icon: Icon, onClick, destructive, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        destructive
          ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
          : 'border-border bg-card text-foreground hover:bg-muted'
      }`}
    >
      {Icon && <Icon size={12} />} {children}
    </button>
  );
}
