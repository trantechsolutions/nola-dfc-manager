import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, ShieldX, Receipt, AlertCircle, ChevronDown,
  DollarSign, Lock, Unlock, Users, Calendar, TrendingUp, Clock, CheckCircle2
} from 'lucide-react';

const CATEGORY_LABELS = {
  TMF: 'Team Fee', SPO: 'Sponsorship', FUN: 'Fundraising', 
  CRE: 'Credit', OPE: 'Operating', TOU: 'Tournament', LEA: 'League/Refs', FRI: 'Friendlies'
};

const CATEGORY_COLORS = {
  TMF: 'text-blue-600', SPO: 'text-violet-600', FUN: 'text-emerald-600', 
  CRE: 'text-cyan-600', OPE: 'text-slate-500', TOU: 'text-amber-600', LEA: 'text-orange-600', FRI: 'text-rose-600'
};

function getProgressColor(pct) {
  if (pct >= 100) return { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (pct >= 75)  return { bar: 'bg-blue-500',    text: 'text-blue-600',    bg: 'bg-blue-50' };
  if (pct >= 25)  return { bar: 'bg-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50' };
  return                  { bar: 'bg-red-500',     text: 'text-red-600',     bg: 'bg-red-50' };
}

export default function ParentView({ 
  players, transactions, calculatePlayerFinancials, formatMoney, 
  teams = [], seasons = [], selectedSeason, setSelectedSeason, currentSeasonData 
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // ── EMPTY STATE ──
  if (!players || players.length === 0) return (
    <div className="max-w-lg mx-auto mt-12 text-center p-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
        <ShieldX size={28} className="text-slate-400" />
      </div>
      <h3 className="text-lg font-black text-slate-800 mb-2">No Players Found</h3>
      <p className="text-slate-500 font-medium text-sm leading-relaxed">
        We couldn't find any rostered players associated with your email address. 
        Please contact a team manager to get linked.
      </p>
    </div>
  );

  // ── ACTIVE PLAYER ──
  const activePlayer = players[selectedIndex];
  const financials = calculatePlayerFinancials(activePlayer, transactions);

  // Finalization: prefer per-player value from DB view, fall back to currentSeasonData prop
  const isFinalized = financials.isFinalized || currentSeasonData?.isFinalized || false;
  const isDraft = !isFinalized;

  const paidPercent = financials.baseFee > 0 
    ? Math.min(100, Math.round(((financials.baseFee - financials.remainingBalance) / financials.baseFee) * 100)) 
    : 100;
  const progressColors = getProgressColor(paidPercent);

  // ── PLAYER'S TEAM ──
  const playerTeam = useMemo(() => {
    if (!activePlayer?.teamId || teams.length === 0) return null;
    return teams.find(t => t.id === activePlayer.teamId) || null;
  }, [activePlayer, teams]);

  // ── AVAILABLE SEASONS for this player (seasons they have a profile for) ──
  const playerSeasons = useMemo(() => {
    if (!activePlayer?.seasonProfiles) return seasons;
    const playerSeasonIds = Object.keys(activePlayer.seasonProfiles);
    const available = seasons.filter(s => playerSeasonIds.includes(s.id));
    return available.length > 0 ? available : seasons;
  }, [activePlayer, seasons]);

  // ── SIBLING CHECK ──
  const multipleTeams = useMemo(() => {
    const teamIds = new Set(players.map(p => p.teamId).filter(Boolean));
    return teamIds.size > 1;
  }, [players]);

  // ── PLAYER-SPECIFIC TRANSACTIONS ──
  const playerTransactions = useMemo(() => {
    const fullName = `${activePlayer.firstName} ${activePlayer.lastName}`.toLowerCase();
    return transactions
      .filter(tx => {
        if (tx.playerId === activePlayer.id) return true;
        return (tx.playerName || '').toLowerCase() === fullName;
      })
      .filter(tx => tx.cleared)
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
  }, [activePlayer, transactions]);

  // ── COMPLIANCE ITEMS ──
  const complianceItems = [
    { label: 'Medical Release', done: activePlayer.medicalRelease },
    { label: 'ReePlayer Waiver', done: activePlayer.reePlayerWaiver },
  ];
  const isFullyCompliant = complianceItems.every(c => c.done);

  return (
    <div className="pb-24 md:pb-6">
      {/* ── CHILD SWITCHER (always on top) ── */}
      {players.length > 1 && (
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-5">
          {players.map((p, index) => {
            const pTeam = teams.find(t => t.id === p.teamId);
            return (
              <button key={p.id} onClick={() => setSelectedIndex(index)}
                className={`flex-1 py-2.5 px-3 rounded-lg font-black text-xs transition-all ${
                  selectedIndex === index ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}>
                <span className="block">#{p.jerseyNumber || '?'} {p.firstName}</span>
                {multipleTeams && pTeam && (
                  <span className="block text-[9px] font-bold text-slate-400 mt-0.5">{pTeam.name}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── DESKTOP: 2-column | MOBILE: stacked ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">

        {/* ════════ LEFT COLUMN (2/5 width on desktop) ════════ */}
        <div className="md:col-span-2 space-y-4">

          {/* Player Card */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl font-black">
                  {activePlayer.jerseyNumber || '?'}
                </div>
                <div>
                  <h2 className="text-xl font-black">{activePlayer.firstName} {activePlayer.lastName}</h2>
                  {playerTeam && (
                    <p className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: playerTeam.colorPrimary || '#3b82f6' }} />
                      {playerTeam.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Compliance badges */}
              <div className="flex gap-2">
                {complianceItems.map((item, i) => (
                  <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black ${
                    item.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}>
                    {item.done ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Season + Team Selector */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Season</label>
              <select 
                value={selectedSeason} 
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              >
                {playerSeasons.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
            </div>
            {playerTeam && (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Team</label>
                <div className="mt-1 flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: playerTeam.colorPrimary || '#1e293b' }} />
                  <span className="text-sm font-bold text-slate-700">{playerTeam.name}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{playerTeam.ageGroup} · {playerTeam.gender}</span>
                </div>
              </div>
            )}
          </div>

          {/* Budget Status Card */}
          <div className={`p-4 rounded-2xl border shadow-sm ${isFinalized ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-3">
              {isFinalized 
                ? <Lock size={18} className="text-emerald-600" /> 
                : <Unlock size={18} className="text-amber-600" />
              }
              <div>
                <p className={`text-sm font-black ${isFinalized ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {financials.isWaived ? 'Fee Waived' : isFinalized ? 'Budget Finalized' : 'Budget in Draft'}
                </p>
                <p className={`text-[11px] font-medium ${isFinalized ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {financials.isWaived 
                    ? 'This player\'s fee has been waived for this season.'
                    : isFinalized 
                      ? 'Season fees are locked. Payments can be made.'
                      : `Fee of ${formatMoney(financials.baseFee)} is estimated and may change.`
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Player Info */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3 text-xs uppercase tracking-widest">Player Info</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Jersey #</span>
                <span className="text-sm font-black text-slate-800">{activePlayer.jerseyNumber || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Status</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                  activePlayer.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>{activePlayer.status}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Compliance</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                  isFullyCompliant ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                }`}>{isFullyCompliant ? 'Complete' : 'Incomplete'}</span>
              </div>
              {activePlayer.guardians?.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Guardians</p>
                  {activePlayer.guardians.map((g, i) => (
                    <div key={i} className="flex justify-between items-center py-1">
                      <span className="text-sm text-slate-600">{g.name}</span>
                      {g.phone && (
                        <a href={`tel:${g.phone}`} className="text-[10px] font-bold text-blue-600 hover:text-blue-800">
                          {g.phone}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════ RIGHT COLUMN (3/5 width on desktop) ════════ */}
        <div className="md:col-span-3 space-y-4">

          {/* Balance Hero */}
          <div className={`p-6 rounded-2xl border shadow-sm ${progressColors.bg} border-slate-200`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Remaining Balance</p>
                <p className={`text-3xl font-black tracking-tight mt-1 ${
                  financials.remainingBalance <= 0 ? 'text-emerald-600' : progressColors.text
                }`}>
                  {financials.remainingBalance <= 0 ? formatMoney(0) : formatMoney(financials.remainingBalance)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Season Fee</p>
                <p className="text-xl font-black text-slate-800 mt-1">
                  {formatMoney(financials.baseFee)}
                  {isDraft && financials.baseFee > 0 && <span className="text-[9px] text-amber-500 font-bold ml-1">est.</span>}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-3 bg-white/80 rounded-full overflow-hidden shadow-inner">
              <div className={`h-full rounded-full transition-all duration-1000 ${progressColors.bar}`} 
                style={{ width: `${paidPercent}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400">
              <span>{paidPercent}% paid</span>
              <span>
                {financials.remainingBalance <= 0 
                  ? 'Fully paid — thank you!' 
                  : `${formatMoney(financials.remainingBalance)} remaining`
                }
              </span>
            </div>
          </div>

          {/* Fee Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 text-xs uppercase tracking-widest flex items-center gap-2">
              <DollarSign size={14} className="text-slate-400" /> Fee Breakdown
            </h3>
            <div className="space-y-0">
              {[
                { label: 'Base Season Fee', value: financials.baseFee, color: 'text-slate-800', show: true, sign: '' },
                { label: 'Team Fees Paid', value: financials.totalPaid, color: 'text-emerald-600', show: financials.totalPaid > 0, sign: '-' },
                { label: 'Fundraising Applied', value: financials.fundraising, color: 'text-emerald-600', show: financials.fundraising > 0, sign: '-' },
                { label: 'Sponsorships Applied', value: financials.sponsorships, color: 'text-violet-600', show: financials.sponsorships > 0, sign: '-' },
                { label: 'Credits / Discounts', value: financials.credits, color: 'text-cyan-600', show: financials.credits > 0, sign: '-' },
              ].filter(r => r.show).map((row, i) => (
                <div key={i} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-500">{row.label}</span>
                  <span className={`font-bold text-sm ${row.color}`}>{row.sign}{formatMoney(row.value)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-slate-200">
                <span className="text-sm font-black text-slate-800">Remaining Balance</span>
                <span className={`text-lg font-black ${financials.remainingBalance <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {financials.remainingBalance <= 0 ? formatMoney(0) : formatMoney(financials.remainingBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Progress (visual breakdown) */}
          {financials.baseFee > 0 && !financials.isWaived && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 text-xs uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} className="text-slate-400" /> Payment Progress
              </h3>
              <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                {/* Team fees paid (blue) */}
                <div className="absolute inset-y-0 left-0 bg-blue-500 rounded-l-full transition-all duration-700" 
                  style={{ width: `${Math.min(100, (financials.totalPaid / financials.baseFee) * 100)}%` }} />
                {/* Credits stacked after (emerald) */}
                {(financials.fundraising + financials.sponsorships + financials.credits) > 0 && (
                  <div className="absolute inset-y-0 bg-emerald-400 transition-all duration-700"
                    style={{ 
                      left: `${Math.min(100, (financials.totalPaid / financials.baseFee) * 100)}%`,
                      width: `${Math.min(100 - (financials.totalPaid / financials.baseFee) * 100, ((financials.fundraising + financials.sponsorships + financials.credits) / financials.baseFee) * 100)}%` 
                    }} />
                )}
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-[10px] font-bold text-slate-400">
                {financials.totalPaid > 0 && (
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Fees Paid ({formatMoney(financials.totalPaid)})</span>
                )}
                {financials.fundraising > 0 && (
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Fundraising ({formatMoney(financials.fundraising)})</span>
                )}
                {financials.sponsorships > 0 && (
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-violet-400" /> Sponsors ({formatMoney(financials.sponsorships)})</span>
                )}
                {financials.credits > 0 && (
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Credits ({formatMoney(financials.credits)})</span>
                )}
              </div>
            </div>
          )}

          {/* Transactions */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                <Receipt size={14} className="text-slate-400" /> Transactions ({playerTransactions.length})
              </h3>
            </div>

            {playerTransactions.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-bold text-sm">
                No transactions recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
                {playerTransactions.map(tx => {
                  const catLabel = CATEGORY_LABELS[tx.category] || tx.category || '';
                  const catColor = CATEGORY_COLORS[tx.category] || 'text-slate-500';
                  const isPositive = tx.amount > 0;

                  return (
                    <div key={tx.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isPositive ? 'bg-emerald-50' : 'bg-slate-50'
                      }`}>
                        {isPositive 
                          ? <TrendingUp size={14} className="text-emerald-500" /> 
                          : <Receipt size={14} className="text-slate-400" />
                        }
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-bold text-slate-700 truncate">{tx.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-black uppercase ${catColor}`}>{catLabel}</span>
                          <span className="text-[10px] text-slate-400">
                            {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : ''}
                          </span>
                        </div>
                      </div>
                      <span className={`font-black text-sm shrink-0 ${isPositive ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {isPositive ? '+' : ''}{formatMoney(tx.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}