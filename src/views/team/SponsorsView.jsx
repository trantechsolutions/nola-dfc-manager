import React, { useState, useEffect } from 'react';
import {
  Award,
  UserCheck,
  TrendingUp,
  Share2,
  Undo2,
  Lock,
  ArrowDownNarrowWide,
  CheckCircle2,
  ChevronDown,
  Zap,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import { useT } from '../../i18n/I18nContext';

// Per-team distribution strategies. `usesSource` = whether a linked/primary
// player is meaningful for this method (drives the modal's source dropdown).
// `example` = how the shared worked scenario (see sponsors.method.scenario)
// splits under this method, used by the comparison guide. Labels and blurbs are
// resolved from i18n at render via `sponsors.methods.<value>`; chip labels via
// `sponsors.chip.<chipKey>`.
const DISTRIBUTION_METHODS = [
  {
    value: 'waterfall',
    usesSource: true,
    example: [
      { chipKey: 'playerA', value: '$200' },
      { chipKey: 'playerB', value: '$50' },
      { chipKey: 'playerC', value: '$50' },
      { chipKey: 'teamPot', value: '$0', muted: true },
    ],
  },
  {
    value: 'direct',
    usesSource: true,
    example: [
      { chipKey: 'playerA', value: '$200' },
      { chipKey: 'playerB', value: '$0', muted: true },
      { chipKey: 'playerC', value: '$0', muted: true },
      { chipKey: 'teamPot', value: '$100' },
    ],
  },
  {
    value: 'even_split',
    usesSource: false,
    example: [
      { chipKey: 'playerA', value: '$100' },
      { chipKey: 'playerB', value: '$100' },
      { chipKey: 'playerC', value: '$100' },
      { chipKey: 'teamPot', value: '$0', muted: true },
    ],
  },
  {
    value: 'team_pot',
    usesSource: false,
    example: [
      { chipKey: 'playerA', value: '$0', muted: true },
      { chipKey: 'playerB', value: '$0', muted: true },
      { chipKey: 'playerC', value: '$0', muted: true },
      { chipKey: 'teamPot', value: '$300' },
    ],
  },
];

export default function SponsorsView({
  transactions,
  selectedSeason,
  formatMoney,
  onDistribute,
  onReset,
  seasonalPlayers,
  seasons,
  currentSeasonData,
  distributionMethod = 'waterfall',
  onSetDistributionMethod,
}) {
  const { t, tp } = useT();

  // Method label/blurb live in i18n, keyed by the method's stable `value`.
  const methodLabel = (value) => t(`sponsors.methods.${value}.label`);
  const methodBlurb = (value) => t(`sponsors.methods.${value}.blurb`);

  const [showDistribute, setShowDistribute] = useState(false);
  const [distAmount, setDistAmount] = useState('');
  const [distTitle, setDistTitle] = useState('');
  const [sourcePlayerId, setSourcePlayerId] = useState('');
  const [originalTxId, setOriginalTxId] = useState(null);
  const [distCategory, setDistCategory] = useState('SPO');
  const [activeTab, setActiveTab] = useState('undistributed');
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [isDistributingAll, setIsDistributingAll] = useState(false);
  const [distributeAllProgress, setDistributeAllProgress] = useState({ current: 0, total: 0, currentTitle: '' });
  const [isSavingMethod, setIsSavingMethod] = useState(false);
  // Draft selection — the guide lets you switch methods without persisting.
  // Only "Save" commits. Re-syncs to the saved value once a save lands (or if
  // the persisted method changes elsewhere).
  const [draftMethod, setDraftMethod] = useState(distributionMethod);
  useEffect(() => {
    setDraftMethod(distributionMethod);
  }, [distributionMethod]);

  // activeMethod reflects the SAVED method — it drives the distribution modal and
  // the actual engine, which always uses the persisted value, not the draft.
  const activeMethod = DISTRIBUTION_METHODS.find((m) => m.value === distributionMethod) || DISTRIBUTION_METHODS[0];
  const methodUsesSource = activeMethod.usesSource;
  const isMethodDirty = draftMethod !== distributionMethod;

  const handleSaveMethod = async () => {
    if (!onSetDistributionMethod || !isMethodDirty) return;
    setIsSavingMethod(true);
    try {
      await onSetDistributionMethod(draftMethod);
    } finally {
      setIsSavingMethod(false);
    }
  };

  // FIX: Use the merged currentSeasonData (which includes team_season finalization)
  // instead of re-deriving from the global seasons array.
  // Falls back to global season lookup for backwards compatibility.
  const isBudgetLocked =
    currentSeasonData?.isFinalized ?? seasons.find((s) => s.id === selectedSeason)?.isFinalized ?? false;

  const isCleared = (tx) => tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';

  // Extract raw credits for the history tab
  const sponsorTxs = transactions.filter((tx) => tx.category === 'SPO' && isCleared(tx) && tx.waterfallBatchId);
  const fundraiserTxs = transactions.filter((tx) => tx.category === 'FUN' && isCleared(tx) && tx.waterfallBatchId);
  const allCredits = [...sponsorTxs, ...fundraiserTxs];

  // GROUP HISTORY BY BATCH ID
  const groupedHistoryMap = {};
  allCredits.forEach((tx) => {
    if (!groupedHistoryMap[tx.waterfallBatchId]) {
      groupedHistoryMap[tx.waterfallBatchId] = {
        batchId: tx.waterfallBatchId,
        originalTxId: tx.originalTxId,
        title: tx.title.replace(' (Team Pool Overflow)', ''),
        date: tx.date,
        totalAmount: 0,
        recipients: [],
        category: tx.category,
      };
    }
    groupedHistoryMap[tx.waterfallBatchId].totalAmount += Number(tx.amount || 0);
    groupedHistoryMap[tx.waterfallBatchId].recipients.push({
      name: tx.playerName || t('sponsors.history.teamPool'),
      amount: Number(tx.amount || 0),
    });
  });

  const historyList = Object.values(groupedHistoryMap).sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

  // UNDISTRIBUTED FUNDS (Combines SPO and FUN)
  const undistributedSponsors = transactions.filter(
    (tx) =>
      ['SPO', 'FUN'].includes(tx.category) && Number(tx.amount || 0) > 0 && !tx.distributed && !tx.waterfallBatchId,
  );

  // FUNDRAISING ROLLUP — only raw ledger deposits to avoid double-counting
  const rawFundraisingTxs = transactions.filter((tx) => tx.category === 'FUN' && isCleared(tx) && !tx.waterfallBatchId);

  const fundraisingByPlayer = seasonalPlayers
    .map((player) => {
      const fullName = `${player.firstName} ${player.lastName}`.trim().toLowerCase();
      const playerTxs = rawFundraisingTxs.filter((tx) => {
        if (tx.playerId === player.id) return true;
        const txName = (tx.playerName || tx.Name || '').trim().toLowerCase();
        return txName === fullName;
      });
      const total = playerTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      return { ...player, fundraisingTxs: playerTxs, fundraisingTotal: total };
    })
    .filter((p) => p.fundraisingTotal > 0 || p.fundraisingTxs.length > 0)
    .sort((a, b) => b.fundraisingTotal - a.fundraisingTotal);

  // Sort undistributed: SPO first, then FUN
  const sortedUndistributed = [...undistributedSponsors].sort((a, b) => {
    const order = { SPO: 0, FUN: 1 };
    return (order[a.category] ?? 2) - (order[b.category] ?? 2);
  });

  const handleDistributeAll = async () => {
    if (!isBudgetLocked) {
      alert(t('sponsors.alerts.finalizeRequired'));
      return;
    }
    if (sortedUndistributed.length === 0) return;

    const confirmed = window.confirm(
      t('sponsors.alerts.confirmAll', {
        n: sortedUndistributed.length,
        method: methodLabel(activeMethod.value),
        blurb: methodBlurb(activeMethod.value),
      }),
    );
    if (!confirmed) return;

    setIsDistributingAll(true);
    setDistributeAllProgress({ current: 0, total: sortedUndistributed.length, currentTitle: '' });

    try {
      for (let i = 0; i < sortedUndistributed.length; i++) {
        const tx = sortedUndistributed[i];
        setDistributeAllProgress({ current: i + 1, total: sortedUndistributed.length, currentTitle: tx.title });
        // Sequential await — each run recalculates balances before the next
        await onDistribute(tx.amount, tx.title, tx.playerId || '', tx.id, tx.category);
      }
    } catch (err) {
      console.error('Distribute All failed at item:', distributeAllProgress.current, err);
      alert(
        t('sponsors.alerts.stopped', {
          title: distributeAllProgress.currentTitle,
          error: err.message || t('sponsors.alerts.checkConsole'),
        }),
      );
    } finally {
      setIsDistributingAll(false);
      setDistributeAllProgress({ current: 0, total: 0, currentTitle: '' });
    }
  };

  return (
    <div className="space-y-6">
      {/* TABS HEADER */}
      <div className="flex flex-wrap gap-2 mb-6 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('undistributed')}
          className={`px-4 md:px-6 py-2 rounded-lg font-semibold text-sm transition-all ${
            activeTab === 'undistributed'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('sponsors.tabs.undistributed', { n: undistributedSponsors.length })}
        </button>
        <button
          onClick={() => setActiveTab('distributed')}
          className={`px-4 md:px-6 py-2 rounded-lg font-semibold text-sm transition-all ${
            activeTab === 'distributed'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('sponsors.tabs.history')}
        </button>
        <button
          onClick={() => setActiveTab('fundraising')}
          className={`px-4 md:px-6 py-2 rounded-lg font-semibold text-sm transition-all ${
            activeTab === 'fundraising'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('sponsors.tabs.fundraising')}
        </button>
      </div>

      {/* --- UNDISTRIBUTED VIEW --- */}
      {activeTab === 'undistributed' && (
        <div className="animate-in fade-in duration-300">
          {/* DISTRIBUTION METHOD GUIDE + SELECTOR */}
          <div className="bg-card p-5 rounded-lg border border-border shadow-sm mb-6">
            <div className="flex items-start gap-3 mb-1">
              <SlidersHorizontal size={18} className="text-blue-700 dark:text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-foreground text-sm">{t('sponsors.method.heading')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('sponsors.method.subtitle')}</p>
              </div>
            </div>

            {/* Worked-example scenario the cards below are calculated from */}
            <div className="mt-3 mb-4 bg-background border border-border rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400 mt-0.5">
                {t('sponsors.method.example')}
              </span>
              <span className="text-xs text-muted-foreground">{t('sponsors.method.scenario')}</span>
            </div>

            {/* Selectable comparison cards (draft only — nothing saves until "Save") */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DISTRIBUTION_METHODS.map((m) => {
                const isSelected = draftMethod === m.value;
                const isSaved = distributionMethod === m.value;
                const selectable = !!onSetDistributionMethod;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => selectable && setDraftMethod(m.value)}
                    disabled={!selectable || isSavingMethod}
                    className={`text-left p-4 rounded-lg border transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20 ring-1 ring-blue-500'
                        : 'border-border bg-card hover:border-blue-300 dark:hover:border-blue-700'
                    } ${!selectable ? 'cursor-default' : 'cursor-pointer'} ${isSavingMethod ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-blue-500' : 'border-muted-foreground/40'
                        }`}
                      >
                        {isSelected && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                      </span>
                      <span className="font-bold text-foreground text-sm">{methodLabel(m.value)}</span>
                      {isSaved && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                          {t('sponsors.method.current')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 ml-6">{methodBlurb(m.value)}</p>
                    <div className="flex flex-wrap gap-1.5 ml-6">
                      {m.example.map((chip) => (
                        <span
                          key={chip.chipKey}
                          className={`text-[11px] font-semibold px-2 py-1 rounded ${
                            chip.muted
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {t(`sponsors.chip.${chip.chipKey}`)} {chip.value}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer: note + explicit Save (nothing persists on switch) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">{t('sponsors.method.footnote')}</p>
              {onSetDistributionMethod && (
                <button
                  onClick={handleSaveMethod}
                  disabled={!isMethodDirty || isSavingMethod}
                  className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all shrink-0 ${
                    !isMethodDirty || isSavingMethod
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20'
                  }`}
                >
                  {isSavingMethod ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> {t('sponsors.method.saving')}
                    </>
                  ) : isMethodDirty ? (
                    t('sponsors.method.save')
                  ) : (
                    t('sponsors.method.saved')
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Lock size={18} className="text-amber-700 dark:text-amber-400" /> {t('sponsors.pending.heading')}
            </h3>
            {undistributedSponsors.length > 1 && (
              <button
                onClick={handleDistributeAll}
                disabled={isDistributingAll || !isBudgetLocked}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all shadow-md ${
                  !isBudgetLocked
                    ? 'bg-slate-300 text-muted-foreground cursor-not-allowed'
                    : isDistributingAll
                      ? 'bg-amber-500 text-white cursor-wait'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                }`}
                title={!isBudgetLocked ? t('sponsors.pending.finalizeFirst') : ''}
              >
                {isDistributingAll ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t('sponsors.pending.distributing', {
                      current: distributeAllProgress.current,
                      total: distributeAllProgress.total,
                    })}
                  </>
                ) : (
                  <>
                    <Zap size={16} /> {t('sponsors.pending.distributeAll', { n: undistributedSponsors.length })}
                  </>
                )}
              </button>
            )}
          </div>

          {/* Progress Bar (visible during Distribute All) */}
          {isDistributingAll && (
            <div className="mb-4 bg-card p-4 rounded-lg border border-amber-200 dark:border-amber-700 shadow-sm animate-in fade-in duration-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-muted-foreground">{t('sponsors.pending.processing')}</span>
                <span className="text-xs font-bold text-foreground">
                  {t('sponsors.pending.progress', {
                    current: distributeAllProgress.current,
                    total: distributeAllProgress.total,
                  })}
                </span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(distributeAllProgress.current / distributeAllProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm font-semibold text-foreground mt-2 truncate">
                {distributeAllProgress.currentTitle}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {undistributedSponsors.length === 0 ? (
              <div className="bg-background p-12 rounded-lg border border-border text-center text-muted-foreground font-semibold italic">
                {t('sponsors.pending.allDistributed')}
              </div>
            ) : (
              sortedUndistributed.map((tx) => (
                <div
                  key={tx.id}
                  className={`bg-card p-5 rounded-lg border flex justify-between items-center shadow-sm ${isDistributingAll ? 'opacity-60 pointer-events-none' : ''} ${tx.category === 'SPO' ? 'border-blue-200 dark:border-blue-700' : 'border-emerald-200 dark:border-emerald-700'}`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          tx.category === 'SPO'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {tx.category === 'SPO' ? t('sponsors.pending.sponsorship') : t('sponsors.pending.fundraising')}
                      </span>
                      {tx.playerName && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {t('sponsors.pending.via', { name: tx.playerName })}
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-foreground text-lg">{tx.title}</p>
                    <p className="text-sm font-semibold text-muted-foreground mt-1">
                      {t('sponsors.pending.amount')}{' '}
                      <span className="text-emerald-700 dark:text-emerald-400">{formatMoney(tx.amount)}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setDistAmount(tx.amount);
                      setDistTitle(tx.title);
                      setOriginalTxId(tx.id);
                      setDistCategory(tx.category);
                      setSourcePlayerId(tx.playerId || '');
                      setShowDistribute(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors shadow-md"
                  >
                    {t('sponsors.pending.distribute')}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- DISTRIBUTED VIEW (RECEIPT GROUPS) --- */}
      {activeTab === 'distributed' && (
        <div className="animate-in fade-in duration-300">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-700 dark:text-emerald-400" />{' '}
            {t('sponsors.history.heading')}
          </h3>
          <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-background border-b border-border">
                  <tr className="text-xs font-semibold text-muted-foreground">
                    <th className="px-6 py-4">{t('sponsors.history.colTitle')}</th>
                    <th className="px-6 py-4">{t('sponsors.history.colBreakdown')}</th>
                    <th className="px-6 py-4 text-right">{t('sponsors.history.colTotal')}</th>
                    <th className="px-6 py-4 text-center">{t('sponsors.history.colUndo')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyList.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-muted-foreground font-semibold italic">
                        {t('sponsors.history.empty')}
                      </td>
                    </tr>
                  ) : (
                    historyList.map((group) => (
                      <tr key={group.batchId} className="hover:bg-background transition-colors items-start">
                        <td className="px-6 py-4 align-top">
                          <p className="font-semibold text-foreground text-sm">{group.title}</p>
                          <p className="text-xs text-muted-foreground font-medium mt-1">
                            {group.date?.seconds
                              ? new Date(group.date.seconds * 1000).toLocaleDateString()
                              : t('sponsors.history.pending')}
                          </p>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 w-fit">
                              {group.recipients.length} {tp('sponsors.history.recipientWord', group.recipients.length)}
                            </span>
                            <div className="text-xs text-muted-foreground space-y-1">
                              {group.recipients.map((r, i) => (
                                <div
                                  key={i}
                                  className="flex justify-between max-w-[200px] border-b border-border last:border-0 pb-1 last:pb-0"
                                >
                                  <span className="font-medium text-foreground">{r.name}</span>
                                  <span className="font-semibold text-foreground">{formatMoney(r.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-700 dark:text-emerald-400 align-top">
                          {formatMoney(group.totalAmount)}
                        </td>
                        <td className="px-6 py-4 text-center align-top">
                          <button
                            onClick={() => onReset(group.batchId, group.originalTxId)}
                            className="text-muted-foreground hover:text-red-700 dark:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                            title={t('sponsors.history.undo')}
                          >
                            <Undo2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- FUNDRAISING ROLLUP VIEW --- */}
      {activeTab === 'fundraising' && (
        <div className="animate-in fade-in duration-300">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-700 dark:text-blue-400" /> {t('sponsors.rollup.heading')}
          </h3>
          <div className="space-y-3">
            {fundraisingByPlayer.length === 0 ? (
              <div className="bg-background p-12 rounded-lg border border-border text-center text-muted-foreground font-semibold italic">
                {t('sponsors.rollup.empty')}
              </div>
            ) : (
              fundraisingByPlayer.map((player) => (
                <div key={player.id} className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)}
                    className="w-full flex justify-between items-center p-5 hover:bg-background transition-colors"
                  >
                    <span className="font-bold text-foreground text-lg flex items-center gap-3">
                      <span className="flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold h-8 w-8 rounded-full text-sm">
                        {player.jerseyNumber || '-'}
                      </span>
                      {player.firstName} {player.lastName}
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">
                        {formatMoney(player.fundraisingTotal)}
                      </span>
                      <ChevronDown
                        size={20}
                        className={`text-muted-foreground transition-transform duration-200 ${expandedPlayerId === player.id ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  {expandedPlayerId === player.id && (
                    <div className="bg-background border-t border-border p-4">
                      <table className="w-full text-left text-sm">
                        <tbody>
                          {player.fundraisingTxs.map((tx) => (
                            <tr key={tx.id} className="border-b border-border/50 last:border-0">
                              <td className="py-3 px-2 font-semibold text-foreground">{tx.title}</td>
                              <td className="py-3 px-2 text-muted-foreground text-xs font-medium">
                                {tx.date?.seconds
                                  ? new Date(tx.date.seconds * 1000).toLocaleDateString()
                                  : t('sponsors.rollup.na')}
                              </td>
                              <td className="py-3 px-2 text-right font-bold text-emerald-700 dark:text-emerald-400">
                                {formatMoney(tx.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- WATERFALL MODAL --- */}
      {showDistribute && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-card rounded-lg p-8 w-full max-w-md shadow-md animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <ArrowDownNarrowWide className="text-emerald-700 dark:text-emerald-400" />{' '}
              {t('sponsors.modal.heading', { method: methodLabel(activeMethod.value) })}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  {t('sponsors.modal.source')}
                </label>
                <input
                  type="text"
                  value={distTitle}
                  onChange={(e) => setDistTitle(e.target.value)}
                  className="w-full border border-border rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  {t('sponsors.modal.total')}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-muted-foreground font-semibold">$</span>
                  <input
                    type="number"
                    value={distAmount}
                    onChange={(e) => setDistAmount(e.target.value)}
                    className="w-full border border-border rounded-lg p-3 pl-8 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              {methodUsesSource ? (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    {t('sponsors.modal.applyTo')}
                  </label>
                  <select
                    value={sourcePlayerId}
                    onChange={(e) => setSourcePlayerId(e.target.value)}
                    className="w-full border border-border rounded-lg p-3 font-semibold text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">{t('sponsors.modal.teamPool')}</option>
                    {seasonalPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    {activeMethod.value === 'waterfall'
                      ? t('sponsors.modal.waterfallHelp')
                      : t('sponsors.modal.directHelp')}
                  </p>
                </div>
              ) : (
                <div className="bg-background border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{methodLabel(activeMethod.value)}:</span>{' '}
                    {methodBlurb(activeMethod.value)}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => {
                    setShowDistribute(false);
                    setOriginalTxId(null);
                  }}
                  className="flex-1 py-3 font-semibold text-muted-foreground hover:bg-background rounded-lg transition-colors"
                >
                  {t('sponsors.modal.cancel')}
                </button>
                <button
                  onClick={() => {
                    onDistribute(distAmount, distTitle, sourcePlayerId, originalTxId, distCategory);
                    setShowDistribute(false);
                    setOriginalTxId(null);
                  }}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-all shadow-lg shadow-emerald-600/20"
                >
                  {t('sponsors.modal.apply', { method: methodLabel(activeMethod.value) })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
