import React from 'react';

export default function PlayerModal({ 
  player, 
  selectedSeason,
  stats,
  onClose, 
  onToggleCompliance, 
  formatMoney 
}) {
  if (!player) return null;

  // stats comes directly from the player_financials VIEW — no calculation needed
  const fin = stats || { baseFee: 0, totalPaid: 0, fundraising: 0, sponsorships: 0, credits: 0, remainingBalance: 0, feeWaived: false };
  const isWaived = fin.feeWaived || player.seasonProfiles?.[selectedSeason]?.feeWaived === true;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center bg-white text-slate-900 font-black h-8 w-8 rounded-full text-sm">
              {player.jerseyNumber || '-'}
            </span>
            <div className="flex flex-col">
              <h3 className="font-bold text-lg leading-tight">{player.firstName} {player.lastName}</h3>
              {isWaived && (
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest mt-0.5">
                  Fee Waived
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {/* Compliance Section */}
          <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Compliance & Waivers</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700 text-sm">Medical Release Form</span>
                <button onClick={() => onToggleCompliance(player.id, 'medicalRelease', player.medicalRelease)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${player.medicalRelease ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${player.medicalRelease ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700 text-sm">ReePlayer Waiver</span>
                <button onClick={() => onToggleCompliance(player.id, 'reePlayerWaiver', player.reePlayerWaiver)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${player.reePlayerWaiver ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${player.reePlayerWaiver ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Guardians */}
          {player.guardians?.length > 0 && (
            <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Guardians</h4>
              <div className="space-y-2">
                {player.guardians.map((g, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-bold text-slate-800">{g.name}</p>
                    {g.email && <p className="text-slate-500 text-xs">{g.email}</p>}
                    {g.phone && <p className="text-slate-500 text-xs">{g.phone}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Summary — straight from player_financials view */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Financial Summary</h4>

            {/* Balance Display */}
            <div className="text-center mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {isWaived ? 'Fee Waived' : 'Remaining Balance'}
              </p>
              <span className={`text-3xl font-black ${fin.remainingBalance > 0 && !isWaived ? 'text-red-500' : 'text-emerald-600'}`}>
                {isWaived ? formatMoney(0) : formatMoney(fin.remainingBalance)}
              </span>
            </div>
              
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-4">
              <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Fee Breakdown</h3>
              
              {isWaived && (
                <div className="bg-amber-50 text-amber-700 p-3 rounded-xl mb-4 text-xs font-bold border border-amber-200 flex items-center gap-2">
                  ⚠️ Player is exempt from the {selectedSeason} team fee.
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500">Base Season Fee</span>
                  <span className={`font-bold ${isWaived ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                    {formatMoney(fin.baseFee)}
                  </span>
                </div>
                
                {fin.totalPaid > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">Team Fees Paid</span>
                    <span className="font-bold text-emerald-600">-{formatMoney(fin.totalPaid)}</span>
                  </div>
                )}
                
                {fin.fundraising > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">Fundraising Applied</span>
                    <span className="font-bold text-emerald-600">-{formatMoney(fin.fundraising)}</span>
                  </div>
                )}
                
                {fin.sponsorships > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">Sponsorships Applied</span>
                    <span className="font-bold text-emerald-600">-{formatMoney(fin.sponsorships)}</span>
                  </div>
                )}
                
                {fin.credits > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-bold">Credits / Discounts</span>
                    <span className="font-bold text-blue-600">-{formatMoney(fin.credits)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}