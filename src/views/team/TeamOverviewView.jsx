import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageTabs from '../../components/layout/PageTabs';
import OnboardingChecklist from '../../components/OnboardingChecklist';
import SmallBox from '../../components/layout/SmallBox';
import {
  Users,
  Archive,
  Edit,
  Search,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  LayoutDashboard,
  UsersRound,
  Wallet,
  PiggyBank,
  Receipt,
  ListChecks,
} from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup } from '../../utils/ageGroup';
import { isCompliant, outstandingFor, EMPTY_COMPLIANCE } from '../../utils/compliance';
import JerseyBadge from '../../components/JerseyBadge';
import { TRACKED_HOLDINGS, HOLDING_LABELS, HOLDING_ICONS } from '../../utils/holdings';

/**
 * Compliance bars ramp red -> green with completion, so a glance at the card
 * ranks the checklist items without reading a single number. Palette colors
 * only: the theme vars in tailwind.config carry no alpha channel, so any
 * `bg-<themeColor>/<n>` utility silently compiles to nothing.
 */
const complianceBarColor = (pct) => {
  if (pct >= 100) return 'bg-emerald-500';
  if (pct >= 75) return 'bg-lime-500';
  if (pct >= 50) return 'bg-amber-400';
  if (pct >= 25) return 'bg-orange-500';
  return 'bg-red-500';
};

/** One labelled bar in the compliance card: "<label>  N / M (P%)". */
function ComplianceBar({ label, count, total, emphasis = false }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div
        className={`flex justify-between gap-2 text-xs mb-1 ${emphasis ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}
      >
        <span className="min-w-0 truncate" title={label}>
          {label}
        </span>
        <span className="tabular-nums whitespace-nowrap">
          {count} / {total} <span className="text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${complianceBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** One line of the season-at-a-glance card: label, figure, optional bar, link. */
function GlanceRow({ label, value, valueClass, detail, bar, legend, action }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className={`text-2xl font-bold tracking-tight tabular-nums ${valueClass || 'text-foreground'}`}>
            {value}
          </span>
          {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
        </p>
        {bar && (
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
            {bar
              .filter((seg) => seg.pct > 0)
              .map((seg, i) => (
                <div key={i} className={`h-full ${seg.className}`} style={{ width: `${seg.pct}%` }} title={seg.title} />
              ))}
          </div>
        )}
        {legend && <p className="mt-2 flex flex-wrap items-center gap-y-1 text-sm text-muted-foreground">{legend}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-md border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function LegendDot({ className = '' }) {
  return <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${className}`} aria-hidden="true" />;
}

export default function TeamOverviewView({
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
  selectedSeason,
  canViewFinancials = true,
  accountMap = {},
  // Season compliance index — see utils/compliance.js.
  compliance = EMPTY_COMPLIANCE,
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
    // A player only counts as "paid" if a real fee was assessed (baseFee > 0)
    // and it's fully covered. Season profiles with no team_season link (e.g.
    // legacy/orphaned records) resolve to baseFee 0 / remainingBalance 0, which
    // otherwise looks identical to "fully paid" despite nothing being collected.
    const paid = nonWaived.filter((p) => {
      const fin = playerFinancials[p.id];
      return fin && fin.baseFee > 0 && fin.remainingBalance <= 0;
    });
    const outstanding = nonWaived.filter((p) => {
      const fin = playerFinancials[p.id];
      return fin && (fin.remainingBalance > 0 || !(fin.baseFee > 0));
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

  // Compliance — the season checklist, not the old fixed three flags. One bar per
  // checklist item, in the checklist's own order, so the card reads as the same
  // list ChecklistManager shows.
  //
  // Split required from optional because only required items define compliance
  // (see isPlayerCompliant): "Fully Compliant" summarises the required group and
  // nothing else, so an optional item sitting at 20% must not read as if it were
  // holding that number down.
  const complianceStats = useMemo(
    () => ({
      total: players.length,
      waived: players.filter((p) => p.seasonProfiles?.[selectedSeasonData?.id]?.feeWaived).length,
      fullyCompliant: players.filter((p) => isCompliant(compliance, p.id)).length,
      requiredItems: compliance.perItem.filter((row) => row.item.required),
      optionalItems: compliance.perItem.filter((row) => !row.item.required),
    }),
    [players, selectedSeasonData, compliance],
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

  return (
    <div className="space-y-6">
      {/* ── Draft budget notice ── */}
      {!isFinalized &&
        baseFee > 0 &&
        (() => {
          const projIncome = selectedSeasonData?.totalProjectedIncome || 0;
          const rosterCount = selectedSeasonData?.expectedRosterSize || 0;
          const buffer = selectedSeasonData?.bufferPercent ?? 0;
          const gap = projectedSpend - projIncome;
          return (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30 md:p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg shrink-0 mt-0.5">
                  <AlertCircle size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                      {t('overview.budgetDraftAlert')}
                    </p>
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-800 dark:text-amber-200">
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
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />
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

          {/* ── Season at a glance ── three questions a coach asks most —
              how much is in the bank, how much budget is left, who has paid —
              each answered by its figure first, with the page that acts on it
              beside it. Quiet rows rather than four loud tiles, so the
              number that is actually off stands out by its colour alone. */}
          {canViewFinancials && (
            <section
              aria-label={t('overview.atAGlance', 'Season at a glance')}
              className="m-bleed divide-y divide-border rounded-lg border border-border bg-card"
            >
              <GlanceRow
                label={t('overview.availableCash')}
                value={formatMoney(teamBalance)}
                valueClass={teamBalance < 0 ? 'text-destructive' : undefined}
                detail={
                  pendingDelta !== 0
                    ? `${pendingDelta < 0 ? '−' : '+'}${formatMoney(Math.abs(pendingDelta))} ${t('overview.pending', 'pending')}`
                    : null
                }
                action={{ label: t('nav.ledger'), onClick: () => navigate('/finance/ledger') }}
              />
              <GlanceRow
                label={`${t('overview.remainingBudget')}${!isFinalized ? ` (${t('parent.est')})` : ''}`}
                value={formatMoney(remainingBudget)}
                valueClass={remainingBudget < 0 ? 'text-destructive' : undefined}
                detail={
                  projectedSpend > 0
                    ? `${t('overview.of', 'of')} ${formatMoney(projectedSpend)}, ${Math.round(spendPercentage)}% ${t('overview.spentShort', 'spent')}`
                    : null
                }
                bar={
                  projectedSpend > 0
                    ? [
                        {
                          pct: Math.min(100, spendPercentage),
                          className:
                            spendPercentage > 90
                              ? 'bg-destructive'
                              : spendPercentage > 60
                                ? 'bg-warning'
                                : 'bg-success',
                        },
                      ]
                    : null
                }
                action={{ label: t('nav.budget'), onClick: () => navigate('/finance/budget') }}
              />
              {baseFee > 0 && players.length > 0 && (
                <GlanceRow
                  label={t('overview.feeCollection')}
                  value={formatMoney(paymentStats.totalCollected)}
                  detail={`${t('overview.of', 'of')} ${formatMoney(paymentStats.totalOwed)}, ${formatMoney(baseFee)} ${t('overview.perPlayer', 'per player')}${isFinalized ? '' : ` (${t('parent.est')})`}`}
                  bar={[
                    {
                      pct: (paymentStats.paid.length / players.length) * 100,
                      className: 'bg-success',
                      title: `${paymentStats.paid.length} ${t('overview.paid')}`,
                    },
                    {
                      pct: (paymentStats.outstanding.length / players.length) * 100,
                      className: 'bg-warning',
                      title: `${paymentStats.outstanding.length} ${t('overview.outstanding')}`,
                    },
                    {
                      pct: (paymentStats.waived.length / players.length) * 100,
                      className: 'bg-slate-300 dark:bg-slate-600',
                      title: `${paymentStats.waived.length} ${t('overview.waived')}`,
                    },
                  ]}
                  legend={
                    <>
                      <LegendDot className="bg-success" /> {paymentStats.paid.length} {t('overview.paid').toLowerCase()}
                      <LegendDot className="ml-3 bg-warning" /> {paymentStats.outstanding.length}{' '}
                      {t('overview.outstanding').toLowerCase()}
                      {paymentStats.totalOutstanding > 0 && ` (${formatMoney(paymentStats.totalOutstanding)})`}
                      {paymentStats.waived.length > 0 && (
                        <>
                          <LegendDot className="ml-3 bg-slate-300 dark:bg-slate-600" /> {paymentStats.waived.length}{' '}
                          {t('overview.waived').toLowerCase()}
                        </>
                      )}
                    </>
                  }
                  action={
                    outstandingPlayers.length > 0
                      ? { label: t('overview.seeWhoOwes', 'See who owes'), onClick: () => setTab('roster') }
                      : null
                  }
                />
              )}
            </section>
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
            <div className="space-y-5">
              {/* Required — these define compliance, so the group closes on the roll-up. */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t('overview.complianceRequired')}
                </p>
                <div className="space-y-3">
                  {complianceStats.requiredItems.map((row) => (
                    <ComplianceBar
                      key={row.item.key}
                      label={row.item.label}
                      count={row.completed}
                      total={complianceStats.total}
                    />
                  ))}
                  <div className="pt-3 border-t border-border">
                    <ComplianceBar
                      label={t('overview.fullyCompliant')}
                      count={complianceStats.fullyCompliant}
                      total={complianceStats.total}
                      emphasis
                    />
                  </div>
                </div>
              </div>

              {/* Optional — tracked, but deliberately outside the roll-up above. */}
              {complianceStats.optionalItems.length > 0 && (
                <div className="pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('overview.complianceOptional')}
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-2">{t('overview.complianceOptionalNote')}</p>
                  <div className="space-y-3">
                    {complianceStats.optionalItems.map((row) => (
                      <ComplianceBar
                        key={row.item.key}
                        label={row.item.label}
                        count={row.completed}
                        total={complianceStats.total}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ ROSTER TAB ════════════════ */}
      {tab === 'roster' && (
        <div className="space-y-5">
          {/* Outstanding fees callout */}
          {canViewFinancials && outstandingPlayers.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <AlertCircle size={16} className="text-red-500 dark:text-red-400" /> {t('overview.outstandingFees')}
                </h3>
                <span className="text-lg font-bold text-red-600 dark:text-red-400">
                  {formatMoney(paymentStats.totalOutstanding)}
                </span>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
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
                    <div key={p.id} className="flex items-center gap-3 rounded-lg bg-muted p-2.5">
                      <JerseyBadge number={p.jerseyNumber} size={32} color="red" />
                      <div className="flex-grow min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
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
                  const outstanding = outstandingFor(compliance, player.id);
                  const playerCompliant = outstanding.length === 0;
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
                            {/* Checklist compliance. One indicator instead of the
                                old three fixed icons: the items are now whatever
                                the team authored, so a per-flag row no longer
                                describes what is actually outstanding. */}
                            <span
                              title={
                                playerCompliant
                                  ? t('overview.fullyCompliant')
                                  : outstanding.map((i) => i.label).join(', ')
                              }
                              className="flex items-center gap-1"
                            >
                              <ListChecks
                                size={13}
                                className={
                                  playerCompliant ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                                }
                              />
                              {!playerCompliant && outstanding.length > 0 && (
                                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                                  {outstanding.length}
                                </span>
                              )}
                            </span>
                            {hasBalance && (
                              <span className="text-xs font-bold text-red-700 dark:text-red-400">
                                {t('overview.owes', { amount: formatMoney(fin.remainingBalance) })}
                              </span>
                            )}
                            {fin && fin.baseFee > 0 && fin.remainingBalance <= 0 && !isWaived && (
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
