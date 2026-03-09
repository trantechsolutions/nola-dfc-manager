import React, { useState, useMemo } from 'react';
import { ShieldCheck, ShieldX, ChevronDown, Receipt, Users } from 'lucide-react';

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

  // Find the team for the active player
  const playerTeam = useMemo(() => {
    if (!activePlayer?.teamId || teams.length === 0) return null;
    return teams.find(t => t.id === activePlayer.teamId) || null;
  }, [activePlayer, teams]);

  // Check if players span multiple teams
  const multipleTeams = useMemo(() => {
    const teamIds = new Set(players.map(p => p.teamId).filter(Boolean));
    return teamIds.size > 1;
  }, [players]);

  // Recent transactions for this player
  const recentTxs = useMemo(() => {
    const fullName = `${activePlayer.firstName} ${activePlayer.lastName}`.toLowerCase();
    return transactions
      .filter(tx => {
        if (tx.playerId === activePlayer.id) return true;
        return (tx.playerName || '').toLowerCase() === fullName;
      })
      .filter(tx => tx.cleared)
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
      .slice(0, 8);
  }, [activePlayer, transactions]);

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24 md:pb-6">
      
      {/* ── CHILD SWITCHER ── */}
      {players.length > 1 && (
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
          {players.map((p, index) => {
            const pTeam = teams.find(t => t.id === p.teamId);
            return (
              <button 
                key={p.id}
                onClick={() => setSelectedIndex(index)}
                className={`flex-1 py-2.5 px-3 rounded-lg font-black text-xs transition-all ${
                  selectedIndex === index 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <span className="block">{p.firstName}</span>
                {multipleTeams && pTeam && (
                  <span className="block text-[9px] font-bold text-slate-400 mt-0.5">{pTeam.name}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── BALANCE HERO CARD ── */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full" />
        <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/5 rounded-full" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center bg-white text-slate-900 font-black h-10 w-10 rounded-xl text-sm">
              {activePlayer.jerseyNumber || '?'}
            </div>
            <div>
              <h2 className="text-lg font-black leading-tight">{activePlayer.firstName} {activePlayer.lastName}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {playerTeam && (
                  <span className="text-[10px] font-bold text-blue-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: playerTeam.colorPrimary || '#3b82f6' }} />
                    {playerTeam.name}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Season Balance</span>
              </div>
            </div>
          </div>
          
          <p className={`text-4xl font-black mt-2 ${financials.remainingBalance <= 0 ? 'text-emerald-400' : 'text-white'}`}>
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
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${paidPercent >= 100 ? 'bg-emerald-400' : 'bg-blue-400'}`} style={{ width: `${paidPercent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── FEE BREAKDOWN ── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-3 text-xs uppercase tracking-widest">Fee Breakdown</h3>
        <div className="space-y-0">
          {[
            { label: 'Base Season Fee', value: financials.baseFee, color: 'text-slate-800', show: true, sign: '' },
            { label: 'Team Fees Paid', value: financials.totalPaid, color: 'text-emerald-600', show: financials.totalPaid > 0, sign: '-' },
            { label: 'Fundraising Applied', value: financials.fundraising, color: 'text-emerald-600', show: financials.fundraising > 0, sign: '-' },
            { label: 'Sponsorships Applied', value: financials.sponsorships, color: 'text-emerald-600', show: financials.sponsorships > 0, sign: '-' },
            { label: 'Credits / Discounts', value: financials.credits, color: 'text-blue-600', show: financials.credits > 0, sign: '-' },
          ].filter(r => r.show).map((row, i) => (
            <div key={i} className="flex justify-between items-center py-2.5 border-b border-slate-50 last:border-0">
              <span className="text-sm text-slate-500">{row.label}</span>
              <span className={`font-bold text-sm ${row.color}`}>{row.sign}{formatMoney(row.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── COMPLIANCE STATUS ── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-3 text-xs uppercase tracking-widest">Compliance Status</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Medical Release', done: activePlayer.medicalRelease },
            { label: 'ReePlayer Waiver', done: activePlayer.reePlayerWaiver },
          ].map((item, i) => (
            <div key={i} className={`p-3 rounded-xl border text-center ${item.done ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex justify-center mb-1.5">
                {item.done ? <ShieldCheck size={20} className="text-emerald-600" /> : <ShieldX size={20} className="text-red-500" />}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{item.label}</p>
              <p className={`text-xs font-black mt-0.5 ${item.done ? 'text-emerald-600' : 'text-red-500'}`}>
                {item.done ? 'Complete' : 'Needed'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── RECENT TRANSACTIONS ── */}
      {recentTxs.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3 text-xs uppercase tracking-widest flex items-center gap-2">
            <Receipt size={14} /> Recent Activity
          </h3>
          <div className="space-y-0">
            {recentTxs.map(tx => (
              <div key={tx.id} className="flex justify-between items-center py-2.5 border-b border-slate-50 last:border-0">
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
  );
}