import React, { useState } from 'react';

export default function ParentView({ players, transactions, calculatePlayerFinancials, formatMoney }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!players || players.length === 0) return (
    <div className="text-center p-12 bg-white rounded-2xl border border-slate-200 mt-8">
      <h3 className="text-lg font-black text-slate-800 mb-2">No Players Found</h3>
      <p className="text-slate-500 font-medium">We couldn't find any rostered players associated with your email address.</p>
    </div>
  );

  const activePlayer = players[selectedIndex];
  const financials = calculatePlayerFinancials(activePlayer, transactions);

  return (
    <div className="max-w-md mx-auto space-y-6">
      
      {/* --- SIBLING SWITCHER --- */}
      {players.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-2 mb-2 no-scrollbar">
          {players.map((p, index) => (
            <button 
              key={p.id}
              onClick={() => setSelectedIndex(index)}
              className={`flex-1 py-3 px-4 rounded-xl font-black text-sm transition-all whitespace-nowrap ${
                selectedIndex === index 
                  ? 'bg-slate-900 text-white shadow-md' 
                  : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p.firstName}
            </button>
          ))}
        </div>
      )}

      {/* --- BALANCE CARD --- */}
      <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg">
        <h2 className="text-2xl font-black mb-1">{activePlayer.firstName}'s Balance</h2>
        <p className="text-4xl font-black text-emerald-400 mt-4">{financials.remainingBalance <= 0 ? formatMoney(0) : formatMoney(financials.remainingBalance)}</p>
        <p className="text-xs text-slate-400 mt-2 uppercase font-bold tracking-widest">Remaining Amount Due</p>
      </div>

      {/* --- ITEMIZED FEE BREAKDOWN --- */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-4">
        <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Fee Breakdown</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500">Base Season Fee</span>
            <span className="font-bold text-slate-800">{formatMoney(financials.baseFee)}</span>
          </div>
          
          {financials.totalPaid > 0 && (
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Team Fees Paid</span>
              <span className="font-bold text-emerald-600">-{formatMoney(financials.totalPaid)}</span>
            </div>
          )}
          
          {financials.fundraising > 0 && (
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Fundraising Applied</span>
              <span className="font-bold text-emerald-600">-{formatMoney(financials.fundraising)}</span>
            </div>
          )}
          
          {financials.sponsorships > 0 && (
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Sponsorships Applied</span>
              <span className="font-bold text-emerald-600">-{formatMoney(financials.sponsorships)}</span>
            </div>
          )}
          
          {financials.credits > 0 && (
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500 font-bold">Credits / Discounts</span>
              <span className="font-bold text-blue-600">-{formatMoney(financials.credits)}</span>
            </div>
          )}
        </div>
      </div>

      {/* --- COMPLIANCE CARD --- */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Compliance Status</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50">
            <span className="text-sm font-medium">Medical Release</span>
            {activePlayer.medicalRelease ? <span className="text-emerald-600 font-bold text-sm">Completed ✔</span> : <span className="text-red-500 font-bold text-sm">Action Required ✘</span>}
          </div>
          <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50">
            <span className="text-sm font-medium">ReePlayer Waiver</span>
            {activePlayer.reePlayerWaiver ? <span className="text-emerald-600 font-bold text-sm">Completed ✔</span> : <span className="text-red-500 font-bold text-sm">Action Required ✘</span>}
          </div>
        </div>
      </div>
    </div>
  );
}