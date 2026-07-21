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

// Per-team distribution strategies. `usesSource` = whether a linked/primary
// player is meaningful for this method (drives the modal's source dropdown).
// `example` = how the shared worked scenario (see GUIDE_SCENARIO) splits under
// this method, used by the comparison guide.
const DISTRIBUTION_METHODS = [
  {
    value: 'waterfall',
    label: 'Waterfall',
    blurb:
      'Credit the linked player first, then overflow splits across teammates, with any remainder going to the team pot.',
    usesSource: true,
    example: [
      { label: 'Player A', value: '$200' },
      { label: 'Player B', value: '$50' },
      { label: 'Player C', value: '$50' },
      { label: 'Team Pot', value: '$0', muted: true },
    ],
  },
  {
    value: 'direct',
    label: 'Direct to Player',
    blurb: 'Only the linked player is credited. Anything above their remaining balance goes to the team pot.',
    usesSource: true,
    example: [
      { label: 'Player A', value: '$200' },
      { label: 'Player B', value: '$0', muted: true },
      { label: 'Player C', value: '$0', muted: true },
      { label: 'Team Pot', value: '$100' },
    ],
  },
  {
    value: 'even_split',
    label: 'Even Split',
    blurb: 'Split equally across all buy-in players, regardless of who brought the funds in.',
    usesSource: false,
    example: [
      { label: 'Player A', value: '$100' },
      { label: 'Player B', value: '$100' },
      { label: 'Player C', value: '$100' },
      { label: 'Team Pot', value: '$0', muted: true },
    ],
  },
  {
    value: 'team_pot',
    label: 'Team Pot',
    blurb: 'Everything goes straight to the team pot. No individual player is credited.',
    usesSource: false,
    example: [
      { label: 'Player A', value: '$0', muted: true },
      { label: 'Player B', value: '$0', muted: true },
      { label: 'Player C', value: '$0', muted: true },
      { label: 'Team Pot', value: '$300' },
    ],
  },
];

// The illustrative scenario the guide's per-method examples are computed from.
const GUIDE_SCENARIO = '$300 raised, linked to Player A (owes $200); teammates B & C each owe $200.';

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
      name: tx.playerName || 'Team Pool',
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
      alert('Budget must be finalized before distributing funds.');
      return;
    }
    if (sortedUndistributed.length === 0) return;

    const confirmed = window.confirm(
      `This will sequentially distribute ${sortedUndistributed.length} pending fund(s) using the "${activeMethod.label}" method (Sponsorships first, then Fundraising).\n\n${activeMethod.blurb}\n\nProceed?`,
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
        `Distribution stopped at "${distributeAllProgress.currentTitle}". ${err.message || 'Check the console for details.'}`,
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
          Undistributed ({undistributedSponsors.length})
        </button>
        <button
          onClick={() => setActiveTab('distributed')}
          className={`px-4 md:px-6 py-2 rounded-lg font-semibold text-sm transition-all ${
            activeTab === 'distributed'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Distribution History
        </button>
        <button
          onClick={() => setActiveTab('fundraising')}
          className={`px-4 md:px-6 py-2 rounded-lg font-semibold text-sm transition-all ${
            activeTab === 'fundraising'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Player Fundraising
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
                <p className="font-bold text-foreground text-sm">Distribution Method</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How each incoming sponsorship or fundraiser splits across the team.
                </p>
              </div>
            </div>

            {/* Worked-example scenario the cards below are calculated from */}
            <div className="mt-3 mb-4 bg-background border border-border rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400 mt-0.5">
                Example
              </span>
              <span className="text-xs text-muted-foreground">{GUIDE_SCENARIO}</span>
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
                      <span className="font-bold text-foreground text-sm">{m.label}</span>
                      {isSaved && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 ml-6">{m.blurb}</p>
                    <div className="flex flex-wrap gap-1.5 ml-6">
                      {m.example.map((chip) => (
                        <span
                          key={chip.label}
                          className={`text-[11px] font-semibold px-2 py-1 rounded ${
                            chip.muted
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {chip.label} {chip.value}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer: note + explicit Save (nothing persists on switch) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Applies to future distributions only — saving does not rewrite batches you've already distributed.
              </p>
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
                      <Loader2 size={16} className="animate-spin" /> Saving...
                    </>
                  ) : isMethodDirty ? (
                    'Save Method'
                  ) : (
                    'Saved'
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Lock size={18} className="text-amber-700 dark:text-amber-400" /> Pending Distributions
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
                title={!isBudgetLocked ? 'Finalize the budget first' : ''}
              >
                {isDistributingAll ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Distributing {distributeAllProgress.current}/{distributeAllProgress.total}...
                  </>
                ) : (
                  <>
                    <Zap size={16} /> Distribute All ({undistributedSponsors.length})
                  </>
                )}
              </button>
            )}
          </div>

          {/* Progress Bar (visible during Distribute All) */}
          {isDistributingAll && (
            <div className="mb-4 bg-card p-4 rounded-lg border border-amber-200 dark:border-amber-700 shadow-sm animate-in fade-in duration-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Processing</span>
                <span className="text-xs font-bold text-foreground">
                  {distributeAllProgress.current} of {distributeAllProgress.total}
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
                All sponsorship funds have been distributed.
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
                        {tx.category === 'SPO' ? 'Sponsorship' : 'Fundraising'}
                      </span>
                      {tx.playerName && (
                        <span className="text-xs font-semibold text-muted-foreground">via {tx.playerName}</span>
                      )}
                    </div>
                    <p className="font-bold text-foreground text-lg">{tx.title}</p>
                    <p className="text-sm font-semibold text-muted-foreground mt-1">
                      Amount: <span className="text-emerald-700 dark:text-emerald-400">{formatMoney(tx.amount)}</span>
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
                    Distribute Funds
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
            <CheckCircle2 size={18} className="text-emerald-700 dark:text-emerald-400" /> Distribution History
          </h3>
          <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-background border-b border-border">
                  <tr className="text-xs font-semibold text-muted-foreground">
                    <th className="px-6 py-4">Title / Source</th>
                    <th className="px-6 py-4">Waterfall Breakdown</th>
                    <th className="px-6 py-4 text-right">Total Applied</th>
                    <th className="px-6 py-4 text-center">Undo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyList.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-muted-foreground font-semibold italic">
                        No distributed sponsorships or fundraising found.
                      </td>
                    </tr>
                  ) : (
                    historyList.map((group) => (
                      <tr key={group.batchId} className="hover:bg-background transition-colors items-start">
                        <td className="px-6 py-4 align-top">
                          <p className="font-semibold text-foreground text-sm">{group.title}</p>
                          <p className="text-xs text-muted-foreground font-medium mt-1">
                            {group.date?.seconds ? new Date(group.date.seconds * 1000).toLocaleDateString() : 'Pending'}
                          </p>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 w-fit">
                              {group.recipients.length} Recipient{group.recipients.length !== 1 && 's'}
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
                            title="Undo this distribution"
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
            <TrendingUp size={18} className="text-blue-700 dark:text-blue-400" /> Player Fundraising Totals
          </h3>
          <div className="space-y-3">
            {fundraisingByPlayer.length === 0 ? (
              <div className="bg-background p-12 rounded-lg border border-border text-center text-muted-foreground font-semibold italic">
                No fundraising activity recorded for this season yet.
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
                                {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : 'N/A'}
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
              <ArrowDownNarrowWide className="text-emerald-700 dark:text-emerald-400" /> {activeMethod.label}{' '}
              Distribution
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Sponsor / Source</label>
                <input
                  type="text"
                  value={distTitle}
                  onChange={(e) => setDistTitle(e.target.value)}
                  className="w-full border border-border rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Total Amount</label>
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
                    Apply Primary Credit To
                  </label>
                  <select
                    value={sourcePlayerId}
                    onChange={(e) => setSourcePlayerId(e.target.value)}
                    className="w-full border border-border rounded-lg p-3 font-semibold text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">Team Pool (Split Evenly)</option>
                    {seasonalPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    {activeMethod.value === 'waterfall'
                      ? "Any funds exceeding a player's remaining fee will automatically waterfall to the rest of the team."
                      : "Any funds exceeding the player's remaining fee will go to the team pot."}
                  </p>
                </div>
              ) : (
                <div className="bg-background border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{activeMethod.label}:</span> {activeMethod.blurb}
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
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDistribute(distAmount, distTitle, sourcePlayerId, originalTxId, distCategory);
                    setShowDistribute(false);
                    setOriginalTxId(null);
                  }}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-all shadow-lg shadow-emerald-600/20"
                >
                  Apply {activeMethod.label}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
