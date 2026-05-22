import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SeasonPicker from '../../components/SeasonPicker';
import OnboardingChecklist from '../../components/OnboardingChecklist';
import {
  Users,
  Archive,
  Edit,
  Search,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  Camera,
  LayoutDashboard,
  UsersRound,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup } from '../../utils/ageGroup';
import JerseyBadge from '../../components/JerseyBadge';
import { TRACKED_HOLDINGS, HOLDING_LABELS, HOLDING_ICONS } from '../../utils/holdings';

// Small flat KPI tile. status.tone: 'good' | 'warn' | 'bad' | 'muted'.
function KpiTile({ label, value, valueTone = 'default', status }) {
  const valueColor =
    valueTone === 'bad' ? 'text-destructive' : valueTone === 'good' ? 'text-success' : 'text-foreground';
  const toneClass = {
    good: 'text-success',
    warn: 'text-warning',
    bad: 'text-destructive',
    muted: 'text-muted-foreground',
  }[status?.tone || 'muted'];
  const Icon = status?.tone === 'good' ? ArrowUp : status?.tone === 'bad' ? ArrowDown : Minus;
  return (
    <div className="bg-card border border-border rounded-lg p-4 md:p-5 flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tracking-tight tabular-nums ${valueColor}`}>{value}</p>
      {status?.text && (
        <p className={`text-xs font-medium flex items-center gap-1 ${toneClass}`}>
          <Icon size={12} strokeWidth={2.5} />
          <span>{status.text}</span>
        </p>
      )}
    </div>
  );
}

export default function TeamOverviewView({
  selectedTeam,
  players,
  archivedPlayers = [],
  teamBalance,
  totalExpenses = 0,
  formatMoney,
  onAddPlayer,
  onEditPlayer,
  onViewPlayer,
  selectedSeasonData,
  transactions = [],
  calculatePlayerFinancials,
  seasons = [],
  selectedSeason,
  setSelectedSeason,
  canViewFinancials = true,
  accountMap = {},
}) {
  const { t, tp } = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [viewArchived, setViewArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isFinalized = selectedSeasonData?.isFinalized;
  const baseFee = selectedSeasonData?.calculatedBaseFee || 0;
  const projectedSpend = selectedSeasonData?.totalProjectedExpenses || 0;
  const spendPercentage = projectedSpend > 0 ? (totalExpenses / projectedSpend) * 100 : 0;
  const remainingBudget = projectedSpend - totalExpenses;

  // Per-player financials
  const playerFinancials = useMemo(() => {
    if (!calculatePlayerFinancials) return {};
    const map = {};
    players.forEach((p) => {
      map[p.id] = calculatePlayerFinancials(p, transactions);
    });
    return map;
  }, [players, transactions, calculatePlayerFinancials]);

  // Payment breakdown
  const paymentStats = useMemo(() => {
    const waived = players.filter((p) => p.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived);
    const nonWaived = players.filter((p) => !p.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived);
    const paid = nonWaived.filter((p) => {
      const fin = playerFinancials[p.id];
      return fin && fin.remainingBalance <= 0;
    });
    const outstanding = nonWaived.filter((p) => {
      const fin = playerFinancials[p.id];
      return fin && fin.remainingBalance > 0;
    });
    const totalOwed = nonWaived.reduce((s, p) => s + (playerFinancials[p.id]?.baseFee || 0), 0);
    const totalCollected = nonWaived.reduce((s, p) => {
      const fin = playerFinancials[p.id];
      return s + Math.max(0, (fin?.baseFee || 0) - (fin?.remainingBalance || 0));
    }, 0);
    const collectionRate = totalOwed > 0 ? Math.round((totalCollected / totalOwed) * 100) : 0;
    const totalOutstanding = outstanding.reduce((s, p) => s + (playerFinancials[p.id]?.remainingBalance || 0), 0);
    return { waived, paid, outstanding, nonWaived, totalOwed, totalCollected, collectionRate, totalOutstanding };
  }, [players, playerFinancials, selectedSeasonData]);

  // Outstanding players for roster tab callout
  const outstandingPlayers = useMemo(
    () =>
      players
        .map((p) => ({ ...p, fin: playerFinancials[p.id] }))
        .filter((p) => p.fin && p.fin.remainingBalance > 0 && !p.fin.isWaived)
        .sort((a, b) => b.fin.remainingBalance - a.fin.remainingBalance),
    [players, playerFinancials],
  );

  // Compliance
  const complianceStats = useMemo(
    () => ({
      total: players.length,
      medical: players.filter((p) => p.medicalRelease).length,
      reeplayer: players.filter((p) => p.reePlayerWaiver).length,
      waived: players.filter((p) => p.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived).length,
      fullyCompliant: players.filter((p) => p.medicalRelease && p.reePlayerWaiver).length,
    }),
    [players, selectedSeasonData],
  );

  // Holding balances — group cleared transactions by account, then roll up
  // to the three tracked holding buckets (digital, bank, cash). Accounts with
  // holding='none' (e.g. the Uncategorized bucket used for credits) are
  // excluded from money-holdings math entirely.
  const holdingBalances = useMemo(() => {
    const perAccount = {};
    transactions.forEach((tx) => {
      if (!tx.cleared || tx.waterfallBatchId) return;
      if (tx.category === 'TRF') {
        const amt = Math.abs(tx.amount);
        if (tx.transferFromAccountId) {
          perAccount[tx.transferFromAccountId] = (perAccount[tx.transferFromAccountId] || 0) - amt;
        }
        if (tx.transferToAccountId) {
          perAccount[tx.transferToAccountId] = (perAccount[tx.transferToAccountId] || 0) + amt;
        }
      } else if (tx.accountId) {
        perAccount[tx.accountId] = (perAccount[tx.accountId] || 0) + tx.amount;
      }
    });

    const holdingTotals = {};
    const accountsInHolding = {};
    TRACKED_HOLDINGS.forEach((h) => {
      holdingTotals[h] = 0;
      accountsInHolding[h] = [];
    });
    Object.entries(perAccount).forEach(([accountId, amount]) => {
      const acc = accountMap[accountId];
      if (!acc || !TRACKED_HOLDINGS.includes(acc.holding)) return;
      holdingTotals[acc.holding] += amount;
      if (Math.abs(amount) >= 0.01) {
        accountsInHolding[acc.holding].push({ id: accountId, name: acc.name, amount });
      }
    });

    return TRACKED_HOLDINGS.map((h) => ({
      holding: h,
      total: holdingTotals[h],
      accounts: accountsInHolding[h].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    })).filter((b) => Math.abs(b.total) >= 0.01 || b.accounts.length > 0);
  }, [transactions, accountMap]);

  // Pending (uncleared) balances — same logic as holdingBalances but for !cleared transactions
  const pendingBalances = useMemo(() => {
    const perAccount = {};
    transactions.forEach((tx) => {
      if (tx.cleared || tx.waterfallBatchId) return;
      if (tx.category === 'TRF') {
        const amt = Math.abs(tx.amount);
        if (tx.transferFromAccountId) {
          perAccount[tx.transferFromAccountId] = (perAccount[tx.transferFromAccountId] ?? 0) - amt;
        }
        if (tx.transferToAccountId) {
          perAccount[tx.transferToAccountId] = (perAccount[tx.transferToAccountId] ?? 0) + amt;
        }
      } else if (tx.accountId) {
        perAccount[tx.accountId] = (perAccount[tx.accountId] ?? 0) + tx.amount;
      }
    });
    const totals = { digital: 0, bank: 0, cash: 0 };
    Object.entries(perAccount).forEach(([id, amt]) => {
      const acc = accountMap[id];
      if (acc && TRACKED_HOLDINGS.includes(acc.holding)) totals[acc.holding] += amt;
    });
    return totals;
  }, [transactions, accountMap]);

  const overallBalance = holdingBalances.reduce((s, b) => s + b.total, 0);
  const pendingDelta = Object.values(pendingBalances).reduce((s, v) => s + v, 0);
  const projectedBalance = overallBalance + pendingDelta;

  // Roster filtering
  const displayedPlayers = viewArchived ? archivedPlayers : players;
  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return displayedPlayers;
    const q = searchTerm.toLowerCase();
    return displayedPlayers.filter(
      (p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || String(p.jerseyNumber).includes(q),
    );
  }, [displayedPlayers, searchTerm]);

  const TABS = [
    { id: 'overview', label: t('overview.overview'), icon: LayoutDashboard },
    { id: 'roster', label: t('overview.roster'), icon: UsersRound },
  ];

  // Health summary line — one terse status string for the page header.
  const healthSummary = useMemo(() => {
    const bits = [];
    bits.push(`${players.length} ${tp('common.player', players.length)}`);
    if (canViewFinancials && baseFee > 0 && players.length > 0) {
      bits.push(`${paymentStats.collectionRate}% collected`);
      if (paymentStats.totalOutstanding > 0) {
        bits.push(`${formatMoney(paymentStats.totalOutstanding)} outstanding`);
      }
    }
    const docsMissing = complianceStats.total - complianceStats.fullyCompliant;
    if (docsMissing > 0) bits.push(`${docsMissing} docs missing`);
    return bits.join(' · ');
  }, [players.length, canViewFinancials, baseFee, paymentStats, complianceStats, formatMoney, tp]);

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-border">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground tracking-tight truncate">
            {selectedTeam?.name || t('common.team')}
          </h1>
          {healthSummary && <p className="text-sm text-muted-foreground mt-1">{healthSummary}</p>}
        </div>
        <div className="shrink-0">
          <SeasonPicker seasons={seasons} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} compact />
        </div>
      </div>

      {/* ── Draft budget notice ── */}
      {!isFinalized &&
        baseFee > 0 &&
        (() => {
          const projIncome = selectedSeasonData?.totalProjectedIncome || 0;
          const rosterCount = selectedSeasonData?.expectedRosterSize || 0;
          const buffer = selectedSeasonData?.bufferPercent ?? 0;
          const gap = projectedSpend - projIncome;
          return (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-300 dark:border-amber-700 border-dashed rounded-lg p-4 md:p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg shrink-0 mt-0.5">
                  <AlertCircle size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                      {t('overview.budgetDraftAlert')}
                    </p>
                    <span className="text-xs font-bold bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full animate-pulse">
                      {t('overview.notFinalized')}
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5 leading-relaxed">
                    {t('overview.estimatedFee')}{' '}
                    <span className="font-bold text-amber-900 dark:text-amber-100">{formatMoney(baseFee)}</span>
                    {rosterCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {' '}
                        · {rosterCount} {tp('common.player', rosterCount)}
                      </span>
                    )}
                    {buffer > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {' '}
                        · {buffer}% {t('overview.buffer')}
                      </span>
                    )}
                  </p>
                  {projectedSpend > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-semibold">
                      <span className="text-red-600 dark:text-red-400">
                        {t('overview.projSpend')} {formatMoney(projectedSpend)}
                      </span>
                      {projIncome > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {t('overview.projIncome')} {formatMoney(projIncome)}
                        </span>
                      )}
                      {gap > 0 && (
                        <span className="text-amber-700 dark:text-amber-300">
                          {t('overview.gap')} {formatMoney(gap)}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-amber-500 dark:text-amber-400 mt-2">{t('overview.draftHelp')}</p>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════ OVERVIEW TAB ════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* ── Onboarding checklist (shows when setup is incomplete) ── */}
          <OnboardingChecklist
            hasSeason={!!selectedSeasonData?.teamSeasonId}
            hasBudget={projectedSpend > 0}
            hasPlayers={players.length > 0}
            hasPlayersEnrolled={players.length > 0}
            navigate={navigate}
          />

          {/* ── KPI strip: flat, status-aware ── */}
          {canViewFinancials && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {/* Available Cash — overall holdings; pending shown as inline delta */}
              <KpiTile
                label={t('overview.availableCash')}
                value={formatMoney(teamBalance)}
                status={
                  pendingDelta !== 0
                    ? {
                        tone: pendingDelta < 0 ? 'warn' : 'good',
                        text: `${pendingDelta < 0 ? '−' : '+'}${formatMoney(Math.abs(pendingDelta))} pending`,
                      }
                    : { tone: teamBalance >= 0 ? 'good' : 'bad', text: teamBalance >= 0 ? 'healthy' : 'overdrawn' }
                }
              />

              {/* Budget Left — burn % becomes the status indicator */}
              <KpiTile
                label={`${t('overview.remainingBudget')}${!isFinalized ? ' (est.)' : ''}`}
                value={formatMoney(remainingBudget)}
                valueTone={remainingBudget < 0 ? 'bad' : 'default'}
                status={
                  projectedSpend > 0
                    ? {
                        tone: spendPercentage > 90 ? 'bad' : spendPercentage > 60 ? 'warn' : 'good',
                        text: `${Math.round(spendPercentage)}% spent`,
                      }
                    : { tone: 'muted', text: !isFinalized ? 'draft' : '—' }
                }
              />

              {/* Season Fee — locked / draft as status */}
              <KpiTile
                label={t('overview.seasonFeePlayer')}
                value={formatMoney(baseFee)}
                status={{
                  tone: isFinalized ? 'good' : 'warn',
                  text: isFinalized ? 'locked' : 'draft',
                }}
              />

              {/* Collection rate */}
              <KpiTile
                label={t('overview.collectionRate')}
                value={`${paymentStats.collectionRate}%`}
                status={{
                  tone: paymentStats.collectionRate >= 90 ? 'good' : paymentStats.collectionRate >= 60 ? 'warn' : 'bad',
                  text: `${paymentStats.paid.length}/${paymentStats.nonWaived.length} paid`,
                }}
              />
            </div>
          )}

          {/* ── Payment status bar ── */}
          {canViewFinancials && baseFee > 0 && players.length > 0 && (
            <div className="bg-card rounded-lg border border-border shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground text-sm">{t('overview.feeCollection')}</h3>
                <span className="text-xs font-medium text-muted-foreground">
                  {players.length} {tp('common.player', players.length)} · {formatMoney(paymentStats.totalCollected)}{' '}
                  {t('overview.collected')}
                </span>
              </div>

              {/* Stacked progress bar */}
              <div className="h-3 bg-muted rounded-full overflow-hidden flex mb-3">
                {paymentStats.paid.length > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${(paymentStats.paid.length / players.length) * 100}%` }}
                    title={`${paymentStats.paid.length} paid`}
                  />
                )}
                {paymentStats.outstanding.length > 0 && (
                  <div
                    className="h-full bg-amber-400 transition-all duration-700"
                    style={{ width: `${(paymentStats.outstanding.length / players.length) * 100}%` }}
                    title={`${paymentStats.outstanding.length} outstanding`}
                  />
                )}
                {paymentStats.waived.length > 0 && (
                  <div
                    className="h-full bg-slate-300 transition-all duration-700"
                    style={{ width: `${(paymentStats.waived.length / players.length) * 100}%` }}
                    title={`${paymentStats.waived.length} waived`}
                  />
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-lg font-bold text-success tabular-nums">{paymentStats.paid.length}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">{t('overview.paid')}</p>
                  {paymentStats.totalCollected > 0 && (
                    <p className="text-xs font-medium text-muted-foreground tabular-nums mt-0.5">
                      {formatMoney(paymentStats.totalCollected)}
                    </p>
                  )}
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-lg font-bold text-warning tabular-nums">{paymentStats.outstanding.length}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">{t('overview.outstanding')}</p>
                  {paymentStats.totalOutstanding > 0 && (
                    <p className="text-xs font-medium text-muted-foreground tabular-nums mt-0.5">
                      {formatMoney(paymentStats.totalOutstanding)}
                    </p>
                  )}
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-lg font-bold text-foreground tabular-nums">{paymentStats.waived.length}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">{t('overview.waived')}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Account holdings ── */}
          {canViewFinancials && holdingBalances.length > 0 && (
            <div className="bg-card p-5 md:p-6 rounded-lg border border-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground text-sm">{t('overview.moneyHoldings')}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {holdingBalances.map(({ holding, total, accounts: holdingAccounts }) => {
                  const IconComp = HOLDING_ICONS[holding];
                  return (
                    <div key={holding} className="bg-muted rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-card text-muted-foreground">
                          <IconComp size={18} />
                        </div>
                        <div className="flex-grow min-w-0">
                          <p className="text-xs font-medium text-muted-foreground truncate">
                            {HOLDING_LABELS[holding]}
                          </p>
                          <p
                            className={`text-lg font-bold tracking-tight tabular-nums ${total < 0 ? 'text-destructive' : 'text-foreground'}`}
                          >
                            {formatMoney(total)}
                          </p>
                        </div>
                      </div>
                      {holdingAccounts.length > 0 && (
                        <ul className="space-y-0.5 pt-2 border-t border-border/60">
                          {holdingAccounts.map((a) => (
                            <li
                              key={a.id}
                              className="flex justify-between items-center text-xs font-medium text-muted-foreground"
                            >
                              <span className="truncate">{a.name}</span>
                              <span className={`tabular-nums ${a.amount < 0 ? 'text-destructive' : ''}`}>
                                {formatMoney(a.amount)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">{t('overview.totalHoldings')}</span>
                <span
                  className={`text-sm font-bold tabular-nums ${teamBalance >= 0 ? 'text-foreground' : 'text-destructive'}`}
                >
                  {formatMoney(holdingBalances.reduce((s, b) => s + b.total, 0))}
                </span>
              </div>
            </div>
          )}

          {/* ── Doc compliance (burn + outlook merged into KPI tiles above) ── */}
          <div className="bg-card p-5 md:p-6 rounded-lg border border-border shadow-sm">
            <h3 className="font-semibold text-foreground text-sm mb-4">{t('overview.docCompliance')}</h3>
            <div className="space-y-3">
              {[
                { label: t('medical.medicalRelease'), count: complianceStats.medical },
                { label: t('medical.reeplayerWaiver'), count: complianceStats.reeplayer },
                { label: t('overview.fullyCompliant'), count: complianceStats.fullyCompliant },
              ].map(({ label, count }) => {
                const pct = complianceStats.total > 0 ? Math.round((count / complianceStats.total) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs font-medium text-foreground mb-1">
                      <span>{label}</span>
                      <span className="tabular-nums">
                        {count} / {complianceStats.total} <span className="text-muted-foreground">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-foreground/70 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ ROSTER TAB ════════════════ */}
      {tab === 'roster' && (
        <div className="space-y-5">
          {/* Outstanding fees callout */}
          {canViewFinancials && outstandingPlayers.length > 0 && (
            <div className="bg-gradient-to-r from-red-50 to-amber-50 dark:from-red-900/30 dark:to-amber-900/30 border border-red-200 dark:border-red-700 rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-red-800 dark:text-red-200 text-sm flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-500 dark:text-red-400" /> {t('overview.outstandingFees')}
                </h3>
                <span className="text-lg font-bold text-red-600 dark:text-red-400">
                  {formatMoney(paymentStats.totalOutstanding)}
                </span>
              </div>
              <p className="text-xs font-semibold text-red-600/70 dark:text-red-400/70 mb-3">
                {outstandingPlayers.length} {tp('common.player', outstandingPlayers.length)}{' '}
                {t('overview.unpaidBalances')}
              </p>
              <div className="space-y-1.5">
                {outstandingPlayers.map((p) => {
                  const pct =
                    p.fin.baseFee > 0
                      ? Math.round(((p.fin.baseFee - p.fin.remainingBalance) / p.fin.baseFee) * 100)
                      : 0;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 bg-red-100 dark:bg-red-950/70 border border-red-200 dark:border-red-900 rounded-lg p-2.5"
                    >
                      <JerseyBadge number={p.jerseyNumber} size={32} color="red" />
                      <div className="flex-grow min-w-0">
                        <p className="text-xs font-semibold text-red-900 dark:text-red-100 truncate">
                          {p.firstName} {p.lastName}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-grow h-1.5 bg-red-200 dark:bg-red-900/60 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500 dark:bg-red-400 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-red-700 dark:text-red-300 shrink-0">{pct}%</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-red-700 dark:text-red-200">
                          {formatMoney(p.fin.remainingBalance)}
                        </p>
                        <p className="text-xs text-red-600/80 dark:text-red-300/80">of {formatMoney(p.fin.baseFee)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Player grid */}
          <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
            <div className="p-4 md:p-6 border-b border-border">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <Users size={16} className="text-muted-foreground" />
                  {viewArchived
                    ? `${t('common.archived')} (${archivedPlayers.length})`
                    : `${t('overview.activeRoster')} (${players.length})`}
                </h3>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <button
                    onClick={() => setViewArchived(!viewArchived)}
                    className="text-muted-foreground hover:text-foreground px-3 py-2 text-xs font-semibold flex items-center gap-1 transition-all rounded-lg hover:bg-background"
                  >
                    <Archive size={14} /> {viewArchived ? t('common.active') : t('common.archived')}
                  </button>
                  <button
                    onClick={onAddPlayer}
                    className="bg-accent text-accent-foreground px-4 py-2 rounded-lg font-semibold text-xs hover:bg-accent/90 transition-all"
                  >
                    {t('overview.addPlayer')}
                  </button>
                </div>
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
                <input
                  type="text"
                  placeholder={t('overview.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 md:p-6">
              {filteredPlayers.length === 0 ? (
                <div className="col-span-full py-10 text-center text-muted-foreground font-semibold italic border-2 border-dashed border-border rounded-lg">
                  {searchTerm ? t('overview.noPlayersMatch') : t('overview.noPlayers')}
                </div>
              ) : (
                filteredPlayers.map((player) => {
                  const isWaived = player.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived;
                  const hasMedical = player.medicalRelease;
                  const hasReeplayer = player.reePlayerWaiver;
                  const fin = playerFinancials[player.id];
                  const hasBalance = canViewFinancials && fin && fin.remainingBalance > 0 && !isWaived;
                  const paidPct =
                    fin && fin.baseFee > 0
                      ? Math.round(((fin.baseFee - fin.remainingBalance) / fin.baseFee) * 100)
                      : 100;
                  const jerseyColor = viewArchived ? 'slate' : hasBalance ? 'amber' : 'slate';

                  return (
                    <div
                      key={player.id}
                      onClick={() => onViewPlayer(player)}
                      className={`group p-4 rounded-lg border cursor-pointer transition-all ${
                        viewArchived
                          ? 'bg-background border-border opacity-60'
                          : hasBalance
                            ? 'border-amber-200 dark:border-amber-700 hover:border-amber-400 hover:shadow-md dark:hover:shadow-none bg-amber-50/30 dark:bg-amber-900/20 active:scale-[0.98]'
                            : 'border-border hover:border-blue-300 hover:shadow-md dark:hover:shadow-none bg-card active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <JerseyBadge
                          number={player.jerseyNumber}
                          size={40}
                          color={jerseyColor}
                          className="group-hover:scale-105 transition-transform"
                        />
                        <div className="flex-grow min-w-0">
                          <p className="font-bold text-foreground text-sm truncate flex items-center gap-2">
                            {player.firstName} {player.lastName}
                            {player.birthdate && getUSAgeGroup(player.birthdate, selectedSeasonData?.id) && (
                              <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                                {getUSAgeGroup(player.birthdate, selectedSeasonData?.id)}
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {isWaived && (
                              <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded uppercase">
                                {t('overview.waived')}
                              </span>
                            )}
                            {/* Waiver doc status */}
                            <span title={hasMedical ? 'Waiver on file' : 'Waiver missing'}>
                              <FileCheck2
                                size={13}
                                className={
                                  hasMedical ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                                }
                              />
                            </span>
                            {/* ReePlayer account status */}
                            <span title={hasReeplayer ? 'ReePlayer account created' : 'No ReePlayer account'}>
                              <Camera
                                size={13}
                                className={hasReeplayer ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground'}
                              />
                            </span>
                            {hasBalance && (
                              <span className="text-xs font-bold text-red-700 dark:text-red-400">
                                {t('overview.owes', { amount: formatMoney(fin.remainingBalance) })}
                              </span>
                            )}
                            {fin && fin.remainingBalance <= 0 && !isWaived && (
                              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
                                <CheckCircle2 size={10} /> {t('overview.paid')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditPlayer(player);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <ChevronRight
                            size={14}
                            className="text-muted-foreground group-hover:text-blue-700 dark:text-blue-400 transition-colors"
                          />
                        </div>
                      </div>
                      {hasBalance && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-grow h-1 bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full transition-all"
                              style={{ width: `${paidPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground">{paidPct}%</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
