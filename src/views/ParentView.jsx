import React, { useState, useMemo } from 'react';
import { ShieldCheck, ShieldX, Receipt, AlertCircle } from 'lucide-react';

export default function ParentView({ players, transactions, calculatePlayerFinancials, formatMoney, teams = [] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  const activePlayer = players[selectedIndex];
  const financials = calculatePlayerFinancials(activePlayer, transactions);
  const paidPercent = financials.baseFee > 0 
    ? Math.min(100, Math.round(((financials.baseFee - financials.remainingBalance) / financials.baseFee) * 100)) 
    : 100;

  const playerTeam = useMemo(() => {
    if (!activePlayer?.teamId || teams.length === 0) return null;
    return teams.find(t => t.id === activePlayer.teamId) || null;
  }, [activePlayer, teams]);

  const multipleTeams = useMemo(() => {
    const teamIds = new Set(players.map(p => p.teamId).filter(Boolean));
    return teamIds.size > 1;
  }, [players]);

  const recentTxs = useMemo(() => {
    const fullName = `${activePlayer.firstName} ${activePlayer.lastName}`.toLowerCase();
    return transactions
      .filter(tx => {
        if (tx.playerId === activePlayer.id) return true;
        return (tx.playerName || '').toLowerCase() === fullName;
      })
      .filter(tx => tx.cleared)
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
      .slice(0, 10);
  }, [activePlayer, transactions]);

  return (
    <div className="pb-24 md:pb-6">
      {/* ── CHILD SWITCHER ── */}
      {players.length > 1 && (
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-5">
          {players.map((p, index) => {
            const pTeam = teams.find(t => t.id === p.teamId);
            return (
              <button key={p.id} onClick={() => setSelectedIndex(index)}
                className={`flex-1 py-2.5 px-3 rounded-lg font-black text-xs transition-all ${
                  selectedIndex === index ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}>
                <span className="block">{p.firstName}</span>
                {multipleTeams && pTeam && (
                  <span className="block text-[9px] font-bold text-slate-400 mt-0.5">{pTeam.name}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── DESKTOP: 2-COLUMN LAYOUT / MOBILE: STACKED ── */}
      <div className="md:grid md:grid-cols-5 md:gap-6">

        {/* LEFT COLUMN: Hero + Fee Breakdown (3 cols on desktop) */}
        <div className="md:col-span-3 space-y-4">
          {/* ── BALANCE HERO CARD ── */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full" />
            <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/5 rounded-full" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center bg-white text-slate-900 font-black h-12 w-12 rounded-xl text-lg">
                  {activePlayer.jerseyNumber || '?'}
                </div>
                <div>
                  <h2 className="text-xl font-black leading-tight">{activePlayer.firstName} {activePlayer.lastName}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    {playerTeam && (
                      <span className="text-[10px] font-bold text-blue-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: playerTeam.colorPrimary || '#3b82f6' }} />
                        {playerTeam.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Draft indicator */}
              {financials.isDraft && financials.baseFee > 0 && (
                <div className="flex items-center gap-2 mb-3 bg-amber-500/20 rounded-lg px-3 py-1.5">
                  <AlertCircle size={12} className="text-amber-400" />
                  <span className="text-[10px] font-bold text-amber-300">Budget in draft — fee is estimated</span>
                </div>
              )}
              
              <p className={`text-4xl font-black mt-1 ${financials.remainingBalance <= 0 ? 'text-emerald-400' : 'text-white'}`}>
                {financials.remainingBalance <= 0 ? formatMoney(0) : formatMoney(financials.remainingBalance)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {financials.remainingBalance <= 0 ? 'Fully paid — thank you!' : 'Remaining amount due'}
              </p>

              <div className="mt-4">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                  <span>{paidPercent}% paid</span>
                  <span>{formatMoney(financials.baseFee)} total</span>
                </div>
                <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${paidPercent >= 100 ? 'bg-emerald-400' : 'bg-blue-400'}`} style={{ width: `${paidPercent}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── FEE BREAKDOWN ── */}
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3 text-xs uppercase tracking-widest">Fee Breakdown</h3>
            <div className="space-y-0">
              {[
                { label: 'Base Season Fee', value: financials.baseFee, color: 'text-slate-800', show: true, sign: '', bold: true },
                { label: 'Team Fees Paid', value: financials.totalPaid, color: 'text-emerald-600', show: financials.totalPaid > 0, sign: '-' },
                { label: 'Fundraising Applied', value: financials.fundraising, color: 'text-emerald-600', show: financials.fundraising > 0, sign: '-' },
                { label: 'Sponsorships Applied', value: financials.sponsorships, color: 'text-emerald-600', show: financials.sponsorships > 0, sign: '-' },
                { label: 'Credits / Discounts', value: financials.credits, color: 'text-blue-600', show: financials.credits > 0, sign: '-' },
              ].filter(r => r.show).map((row, i) => (
                <div key={i} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-500">{row.label}</span>
                  <span className={`font-bold text-sm ${row.color}`}>{row.sign}{formatMoney(row.value)}</span>
                </div>
              ))}
              {/* Total row */}
              <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-slate-200">
                <span className="text-sm font-black text-slate-800">Remaining Balance</span>
                <span className={`text-lg font-black ${financials.remainingBalance <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatMoney(financials.remainingBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* ── RECENT TRANSACTIONS (desktop: below fee breakdown) ── */}
          {recentTxs.length > 0 && (
            <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-3 text-xs uppercase tracking-widest flex items-center gap-2">
                <Receipt size={14} /> Recent Activity
              </h3>
              <div className="space-y-0">
                {recentTxs.map(tx => (
                  <div key={tx.id} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
                    <div className="min-w-0 flex-grow mr-3">
                      <p className="text-sm font-bold text-slate-700 truncate">{tx.title}</p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : ''} · {tx.category}
                      </p>
                    </div>
                    <span className={`text-sm font-black shrink-0 ${tx.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {formatMoney(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Compliance + Quick Info (2 cols on desktop) */}
        <div className="md:col-span-2 space-y-4 mt-4 md:mt-0">
          {/* ── COMPLIANCE STATUS ── */}
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 text-xs uppercase tracking-widest">Compliance Status</h3>
            <div className="space-y-3">
              {[
                { label: 'Medical Release', done: activePlayer.medicalRelease },
                { label: 'ReePlayer Waiver', done: activePlayer.reePlayerWaiver },
              ].map((item, i) => (
                <div key={i} className={`flex items-center gap-3 p-4 rounded-xl border ${item.done ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  {item.done 
                    ? <ShieldCheck size={22} className="text-emerald-600 shrink-0" /> 
                    : <ShieldX size={22} className="text-red-500 shrink-0" />
                  }
                  <div>
                    <p className="text-sm font-bold text-slate-700">{item.label}</p>
                    <p className={`text-xs font-black ${item.done ? 'text-emerald-600' : 'text-red-500'}`}>
                      {item.done ? 'Complete' : 'Needed'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── PLAYER INFO CARD ── */}
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 text-xs uppercase tracking-widest">Player Info</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Jersey #</span>
                <span className="text-sm font-black text-slate-800">{activePlayer.jerseyNumber || '—'}</span>
              </div>
              {playerTeam && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Team</span>
                  <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: playerTeam.colorPrimary }} />
                    {playerTeam.name}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Season Fee</span>
                <div className="text-right">
                  <span className="text-sm font-black text-slate-800">{formatMoney(financials.baseFee)}</span>
                  {financials.isDraft && <span className="text-[9px] text-amber-500 font-bold block">estimated</span>}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Total Paid</span>
                <span className="text-sm font-bold text-emerald-600">{formatMoney(financials.totalPaid + financials.fundraising + financials.sponsorships + financials.credits)}</span>
              </div>
              {financials.isWaived && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-xs font-black text-amber-700">Fee Waived</p>
                  <p className="text-[10px] text-amber-600">This player's fee has been waived for this season.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── PAYMENT SUMMARY (visual) ── */}
          {financials.baseFee > 0 && !financials.isWaived && (
            <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 text-xs uppercase tracking-widest">Payment Progress</h3>
              <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                {/* Team fees */}
                <div className="absolute inset-y-0 left-0 bg-blue-500 rounded-l-full transition-all" 
                  style={{ width: `${Math.min(100, (financials.totalPaid / financials.baseFee) * 100)}%` }} />
                {/* Credits (stacked after paid) */}
                {(financials.fundraising + financials.sponsorships + financials.credits) > 0 && (
                  <div className="absolute inset-y-0 bg-emerald-400 transition-all rounded-r-full"
                    style={{ 
                      left: `${Math.min(100, (financials.totalPaid / financials.baseFee) * 100)}%`,
                      width: `${Math.min(100 - (financials.totalPaid / financials.baseFee) * 100, ((financials.fundraising + financials.sponsorships + financials.credits) / financials.baseFee) * 100)}%` 
                    }} />
                )}
              </div>
              <div className="flex justify-between mt-2.5 text-[10px] font-bold text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Fees Paid</span>
                  {(financials.fundraising + financials.sponsorships + financials.credits) > 0 && (
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Credits</span>
                  )}
                </div>
                <span>{paidPercent}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}