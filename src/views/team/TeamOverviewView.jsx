import { useState, useMemo } from 'react';
import SeasonPicker from '../../components/SeasonPicker';
import {
  TrendingDown,
  Users,
  DollarSign,
  Activity,
  Archive,
  Edit,
  Search,
  Shield,
  ChevronRight,
  Wallet,
  AlertCircle,
  Landmark,
  Banknote,
  SmartphoneNfc,
  CheckCircle2,
  FileCheck2,
  Camera,
  LayoutDashboard,
  UsersRound,
  TrendingUp,
  Percent,
} from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup } from '../../utils/ageGroup';
import JerseyBadge from '../../components/JerseyBadge';

// ── Account helpers ───────────────────────────────────────────
const ACCOUNT_ICONS = { Venmo: SmartphoneNfc, Cash: Banknote, Bank: Landmark, Zeffy: Wallet };
const ACCOUNT_COLORS = {
  Venmo: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-700',
    icon: 'text-blue-500 dark:text-blue-400',
  },
  Cash: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-700',
    icon: 'text-emerald-500 dark:text-emerald-400',
  },
  Bank: {
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    icon: 'text-slate-500 dark:text-slate-400',
  },
  Zeffy: {
    bg: 'bg-rose-50 dark:bg-rose-900/30',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-700',
    icon: 'text-rose-500 dark:text-rose-400',
  },
};
const BANK_METHODS = new Set(['ACH', 'Zelle', 'Check']);
const toHolding = (method) => (BANK_METHODS.has(method) ? 'Bank' : method);

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
  seasons = [],
  selectedSeason,
  setSelectedSeason,
  canViewFinancials = true,
}) {
  const { t } = useT();
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

  // Account holdings
  const accountBalances = useMemo(() => {
    const balances = {};
    transactions.forEach((tx) => {
      if (!tx.cleared || tx.waterfallBatchId) return;
      if (tx.category === 'TRF') {
        const from = toHolding(tx.transferFrom);
        const to = toHolding(tx.transferTo);
        const amt = Math.abs(tx.amount);
        if (from) balances[from] = (balances[from] || 0) - amt;
        if (to) balances[to] = (balances[to] || 0) + amt;
      } else {
        const method = toHolding(tx.type || 'Other');
        balances[method] = (balances[method] || 0) + tx.amount;
      }
    });
    return Object.entries(balances)
      .filter(([_, amount]) => Math.abs(amount) >= 0.01)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }, [transactions]);

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
    <div className="space-y-6 pb-20 md:pb-6">
      <SeasonPicker seasons={seasons} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} />

      {/* ── Draft budget notice ── */}
      {!isFinalized &&
        baseFee > 0 &&
        (() => {
          const projIncome = selectedSeasonData?.totalProjectedIncome || 0;
          const rosterCount = selectedSeasonData?.expectedRosterSize || 0;
          const buffer = selectedSeasonData?.bufferPercent ?? 0;
          const gap = projectedSpend - projIncome;
          return (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-300 dark:border-amber-700 border-dashed rounded-2xl p-4 md:p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-xl shrink-0 mt-0.5">
                  <AlertCircle size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-amber-800 dark:text-amber-200">
                      {t('overview.budgetDraftAlert')}
                    </p>
                    <span className="text-[9px] font-black bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                      {t('overview.notFinalized')}
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5 leading-relaxed">
                    {t('overview.estimatedFee')}{' '}
                    <span className="font-black text-amber-900 dark:text-amber-100">{formatMoney(baseFee)}</span>
                    {rosterCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {' '}
                        · {rosterCount} {rosterCount !== 1 ? t('common.players') : t('common.player')}
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
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] font-bold">
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
                  <p className="text-[10px] text-amber-500 dark:text-amber-400 mt-2">{t('overview.draftHelp')}</p>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm dark:shadow-none'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
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
          {/* ── Primary stat cards (financial — hidden for coaches) ── */}
          {canViewFinancials && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {/* Available Cash */}
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white p-4 md:p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <DollarSign size={18} className="opacity-70" />
                  {!isFinalized && (
                    <span className="text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded">Draft</span>
                  )}
                </div>
                <p className="text-xl md:text-2xl font-black tracking-tight">{formatMoney(teamBalance)}</p>
                <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest mt-1">
                  {t('overview.availableCash')}
                </p>
              </div>

              {/* Remaining Budget */}
              <div
                className={`p-4 md:p-5 rounded-2xl ${!isFinalized ? 'border-dashed ' : ''}${
                  remainingBudget < 0
                    ? 'bg-gradient-to-br from-red-500 to-red-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <TrendingDown
                    size={18}
                    className={remainingBudget < 0 ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}
                  />
                  {!isFinalized && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${remainingBudget < 0 ? 'bg-white/20' : 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'}`}
                    >
                      Draft
                    </span>
                  )}
                </div>
                <p
                  className={`text-xl md:text-2xl font-black tracking-tight ${remainingBudget < 0 ? '' : 'text-slate-900 dark:text-white'}`}
                >
                  {formatMoney(remainingBudget)}
                </p>
                <p
                  className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${remainingBudget < 0 ? 'text-red-200' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  {t('overview.remainingBudget')}
                  {!isFinalized ? ' (Est.)' : ''}
                </p>
              </div>

              {/* Season Fee */}
              <div
                className={`bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl border ${!isFinalized && baseFee > 0 ? 'border-dashed border-amber-200 dark:border-amber-700' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <Wallet size={18} className="text-slate-400 dark:text-slate-500" />
                  {!isFinalized && baseFee > 0 && (
                    <span className="text-[8px] font-black bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded uppercase">
                      Est.
                    </span>
                  )}
                  {isFinalized && (
                    <span className="text-[8px] font-black bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded uppercase">
                      Locked
                    </span>
                  )}
                </div>
                <p className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formatMoney(baseFee)}
                </p>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                  {t('overview.seasonFeePlayer')}
                </p>
              </div>

              {/* Collection Rate */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-4 md:p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <Percent size={18} className="opacity-70" />
                </div>
                <p className="text-xl md:text-2xl font-black tracking-tight">{paymentStats.collectionRate}%</p>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mt-1">
                  {t('overview.collectionRate')}
                </p>
              </div>
            </div>
          )}

          {/* ── Payment status bar ── */}
          {canViewFinancials && baseFee > 0 && players.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-600" /> {t('overview.feeCollection')}
                </h3>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  {players.length} {players.length !== 1 ? t('common.players') : t('common.player')} ·{' '}
                  {formatMoney(paymentStats.totalCollected)} {t('overview.collected')}
                </span>
              </div>

              {/* Stacked progress bar */}
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex mb-3">
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
                <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-3">
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                    {paymentStats.paid.length}
                  </p>
                  <p className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-widest">
                    {t('overview.paid')}
                  </p>
                  {paymentStats.totalCollected > 0 && (
                    <p className="text-[10px] font-bold text-emerald-400 dark:text-emerald-500 mt-0.5">
                      {formatMoney(paymentStats.totalCollected)}
                    </p>
                  )}
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3">
                  <p className="text-lg font-black text-amber-700 dark:text-amber-300">
                    {paymentStats.outstanding.length}
                  </p>
                  <p className="text-[10px] font-bold text-amber-500 dark:text-amber-400 uppercase tracking-widest">
                    {t('overview.outstanding')}
                  </p>
                  {paymentStats.totalOutstanding > 0 && (
                    <p className="text-[10px] font-bold text-amber-400 dark:text-amber-500 mt-0.5">
                      {formatMoney(paymentStats.totalOutstanding)}
                    </p>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <p className="text-lg font-black text-slate-600 dark:text-slate-300">{paymentStats.waived.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {t('overview.waived')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Account holdings ── */}
          {canViewFinancials && accountBalances.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Landmark size={16} className="text-indigo-600" /> {t('overview.moneyHoldings')}
                </h3>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  {accountBalances.length}{' '}
                  {accountBalances.length !== 1 ? t('overview.accounts') : t('overview.account')}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {accountBalances.map(([account, amount]) => {
                  const colors = ACCOUNT_COLORS[account] || {
                    bg: 'bg-slate-50 dark:bg-slate-800',
                    text: 'text-slate-700 dark:text-slate-300',
                    border: 'border-slate-200 dark:border-slate-700',
                    icon: 'text-slate-500 dark:text-slate-400',
                  };
                  const IconComp = ACCOUNT_ICONS[account] || Wallet;
                  return (
                    <div
                      key={account}
                      className={`${colors.bg} border ${colors.border} rounded-xl p-4 flex items-center gap-3`}
                    >
                      <div className={`p-2 rounded-lg ${colors.bg} ${colors.icon}`}>
                        <IconComp size={18} />
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-300 truncate">{account}</p>
                        <p className={`text-lg font-black tracking-tight ${amount < 0 ? 'text-red-600' : colors.text}`}>
                          {formatMoney(amount)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  {t('overview.totalHoldings')}
                </span>
                <span className={`text-sm font-black ${teamBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatMoney(accountBalances.reduce((s, [_, a]) => s + a, 0))}
                </span>
              </div>
            </div>
          )}

          {/* ── Budget burn + Compliance ── */}
          <div className={`grid grid-cols-1 ${canViewFinancials ? 'lg:grid-cols-2' : ''} gap-4`}>
            {canViewFinancials && (
              <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Activity size={16} className="text-blue-600" /> {t('overview.budgetBurnRate')}
                  </h3>
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-xs font-black px-2 py-1 rounded-lg ${
                        spendPercentage > 90
                          ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          : spendPercentage > 60
                            ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {Math.round(spendPercentage)}%
                    </span>
                    {!isFinalized && (
                      <span className="text-[8px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded ml-1">
                        DRAFT
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      spendPercentage > 90 ? 'bg-red-500' : spendPercentage > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, spendPercentage)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  <span>
                    {t('overview.spent')} {formatMoney(totalExpenses)}
                  </span>
                  <span>
                    {t('overview.budgetLabel')} {formatMoney(projectedSpend)}
                  </span>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
              <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2 mb-4">
                <Shield size={16} className="text-violet-600" /> {t('overview.docCompliance')}
              </h3>
              <div className="space-y-2.5">
                {[
                  { label: t('medical.medicalRelease'), count: complianceStats.medical, color: 'bg-violet-500' },
                  { label: t('medical.reeplayerWaiver'), count: complianceStats.reeplayer, color: 'bg-blue-500' },
                  {
                    label: t('overview.fullyCompliant'),
                    count: complianceStats.fullyCompliant,
                    color: 'bg-emerald-500',
                  },
                ].map(({ label, count, color }) => {
                  const pct = complianceStats.total > 0 ? Math.round((count / complianceStats.total) * 100) : 0;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        <span>{label}</span>
                        <span>
                          {count} / {complianceStats.total}{' '}
                          <span className="text-slate-400 dark:text-slate-500">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${color} rounded-full transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ ROSTER TAB ════════════════ */}
      {tab === 'roster' && (
        <div className="space-y-5">
          {/* Outstanding fees callout */}
          {canViewFinancials && outstandingPlayers.length > 0 && (
            <div className="bg-gradient-to-r from-red-50 to-amber-50 dark:from-red-900/30 dark:to-amber-900/30 border border-red-200 dark:border-red-700 rounded-2xl p-5 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-red-800 dark:text-red-200 text-sm flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-500 dark:text-red-400" /> {t('overview.outstandingFees')}
                </h3>
                <span className="text-lg font-black text-red-600 dark:text-red-400">
                  {formatMoney(paymentStats.totalOutstanding)}
                </span>
              </div>
              <p className="text-[10px] font-bold text-red-600/70 dark:text-red-400/70 mb-3">
                {outstandingPlayers.length} {outstandingPlayers.length !== 1 ? t('common.players') : t('common.player')}{' '}
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
                      className="flex items-center gap-3 bg-white/70 dark:bg-slate-800/70 rounded-xl p-2.5 backdrop-blur-sm"
                    >
                      <JerseyBadge number={p.jerseyNumber} size={32} color="red" />
                      <div className="flex-grow min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {p.firstName} {p.lastName}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-grow h-1.5 bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
                            <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-red-600 dark:text-red-400">
                          {formatMoney(p.fin.remainingBalance)}
                        </p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500">of {formatMoney(p.fin.baseFee)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Player grid */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Users size={16} className="text-slate-400 dark:text-slate-500" />
                  {viewArchived
                    ? `${t('common.archived')} (${archivedPlayers.length})`
                    : `${t('overview.activeRoster')} (${players.length})`}
                </h3>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <button
                    onClick={() => setViewArchived(!viewArchived)}
                    className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-3 py-2 text-xs font-bold flex items-center gap-1 transition-all rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Archive size={14} /> {viewArchived ? t('common.active') : t('common.archived')}
                  </button>
                  <button
                    onClick={onAddPlayer}
                    className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 dark:hover:bg-slate-200 transition-all"
                  >
                    {t('overview.addPlayer')}
                  </button>
                </div>
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-2.5 text-slate-300 dark:text-slate-500" size={16} />
                <input
                  type="text"
                  placeholder={t('overview.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 md:p-6">
              {filteredPlayers.length === 0 ? (
                <div className="col-span-full py-10 text-center text-slate-400 dark:text-slate-500 font-bold italic border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-2xl">
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
                      className={`group p-4 rounded-xl border cursor-pointer transition-all ${
                        viewArchived
                          ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60'
                          : hasBalance
                            ? 'border-amber-200 dark:border-amber-700 hover:border-amber-400 hover:shadow-md dark:hover:shadow-none bg-amber-50/30 dark:bg-amber-900/20 active:scale-[0.98]'
                            : 'border-slate-100 dark:border-slate-700 hover:border-blue-300 hover:shadow-md dark:hover:shadow-none bg-white dark:bg-slate-900 active:scale-[0.98]'
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
                          <p className="font-black text-slate-900 dark:text-white text-sm truncate flex items-center gap-2">
                            {player.firstName} {player.lastName}
                            {player.birthdate && getUSAgeGroup(player.birthdate, selectedSeasonData?.id) && (
                              <span className="text-[9px] font-black bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                                {getUSAgeGroup(player.birthdate, selectedSeasonData?.id)}
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {isWaived && (
                              <span className="text-[9px] font-black bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded uppercase">
                                {t('overview.waived')}
                              </span>
                            )}
                            {/* Waiver doc status */}
                            <span title={hasMedical ? 'Waiver on file' : 'Waiver missing'}>
                              <FileCheck2
                                size={13}
                                className={hasMedical ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}
                              />
                            </span>
                            {/* ReePlayer account status */}
                            <span title={hasReeplayer ? 'ReePlayer account created' : 'No ReePlayer account'}>
                              <Camera
                                size={13}
                                className={hasReeplayer ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'}
                              />
                            </span>
                            {hasBalance && (
                              <span className="text-[9px] font-black text-red-500">
                                {t('overview.owes', { amount: formatMoney(fin.remainingBalance) })}
                              </span>
                            )}
                            {fin && fin.remainingBalance <= 0 && !isWaived && (
                              <span className="text-[9px] font-bold text-emerald-500 flex items-center gap-0.5">
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
                            className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <ChevronRight
                            size={14}
                            className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors"
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
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{paidPct}%</span>
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
