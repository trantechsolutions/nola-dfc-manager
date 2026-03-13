import React, { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'Venmo', label: 'Venmo' },
  { value: 'Zelle', label: 'Zelle' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Check', label: 'Check' },
  { value: 'ACH', label: 'ACH (Bank)' },
  { value: 'Zeffy', label: 'Zeffy' },
];

export default function TransactionModal({ 
  show, 
  onClose, 
  onSubmit, 
  initialData, 
  isSubmitting, 
  players 
}) {
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'TMF',
    type: 'Venmo',
    playerId: '',
    cleared: false,
    transferFrom: '',
    transferTo: '',
  });

  useEffect(() => {
    if (initialData) {
      let formattedDate = new Date().toISOString().split('T')[0];
      if (initialData.date && initialData.date.seconds) {
        formattedDate = new Date(initialData.date.seconds * 1000).toISOString().split('T')[0];
      }
      setFormData({
        ...initialData,
        date: formattedDate,
        transferFrom: initialData.transferFrom || '',
        transferTo: initialData.transferTo || '',
      });
    } else {
      setFormData({
        title: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'TMF',
        type: 'Venmo',
        playerId: '',
        cleared: false,
        transferFrom: '',
        transferTo: '',
      });
    }
  }, [initialData, show]);

  if (!show) return null;

  const isTransfer = formData.category === 'TRF';

  const handleCategoryChange = (newCategory) => {
    const updates = { category: newCategory };
    if (newCategory === 'TRF') {
      updates.transferFrom = formData.transferFrom || 'Venmo';
      updates.transferTo = formData.transferTo || 'Cash';
      updates.playerId = '';
      updates.playerName = '';
      updates.cleared = true;
    } else {
      updates.transferFrom = '';
      updates.transferTo = '';
    }
    setFormData({ ...formData, ...updates });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = parseFloat(formData.amount) || 0;
    onSubmit({
      ...formData,
      amount: isTransfer ? Math.abs(amount) : amount,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className={`px-6 py-4 flex justify-between items-center text-white shrink-0 ${
          isTransfer ? 'bg-indigo-600' : 'bg-emerald-600'
        }`}>
          <h3 className="font-bold text-lg flex items-center gap-2">
            {isTransfer && <ArrowRightLeft size={18} />}
            {initialData ? 'Edit Transaction' : (isTransfer ? 'Transfer Funds' : 'Log New Transaction')}
          </h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white font-bold text-xl">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              {isTransfer ? 'Transfer Description' : 'Title / Description'}
            </label>
            <input required type="text" value={formData.title} 
              onChange={e => setFormData({...formData, title: e.target.value})} 
              className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" 
              placeholder={isTransfer ? 'e.g., Move funds to checking account...' : 'e.g., Spring Team Fees, Referee Payment...'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Amount ($)</label>
              <input required type="number" step="0.01" min="0" value={formData.amount} 
                onChange={e => setFormData({...formData, amount: e.target.value})} 
                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" 
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Date</label>
              <input required type="date" value={formData.date} 
                onChange={e => setFormData({...formData, date: e.target.value})} 
                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
          </div>

          {/* Category */}
          <div className={`grid ${formData.category === 'CRE' || isTransfer ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Category</label>
              <select value={formData.category} 
                onChange={e => handleCategoryChange(e.target.value)} 
                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="TMF">Team Fees (Income)</option>
                <option value="FUN">Fundraising (Income)</option>
                <option value="SPO">Sponsorship (Income)</option>
                <option value="OPE">Operating (Expense)</option>
                <option value="TOU">Tournament (Expense)</option>
                <option value="LEA">League/Refs (Expense)</option>
                <option value="CRE">Player Credit / Discount</option>
                <option value="TRF">↔ Transfer Between Accounts</option>
              </select>
            </div>
            {!isTransfer && formData.category !== 'CRE' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Payment Method</label>
                <select value={formData.type} 
                  onChange={e => setFormData({...formData, type: e.target.value})} 
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none">
                  {PAYMENT_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ── TRANSFER: From / To Account ── */}
          {isTransfer && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">Transfer Details</p>
              <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">From Account</label>
                  <select value={formData.transferFrom} 
                    onChange={e => setFormData({...formData, transferFrom: e.target.value})} 
                    className="w-full border border-indigo-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                    {PAYMENT_METHODS.map(m => (
                      <option key={m.value} value={m.value} disabled={m.value === formData.transferTo}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="pb-2">
                  <ArrowRightLeft size={18} className="text-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">To Account</label>
                  <select value={formData.transferTo} 
                    onChange={e => setFormData({...formData, transferTo: e.target.value})} 
                    className="w-full border border-indigo-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                    {PAYMENT_METHODS.map(m => (
                      <option key={m.value} value={m.value} disabled={m.value === formData.transferFrom}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {formData.transferFrom === formData.transferTo && formData.transferFrom && (
                <p className="text-xs text-red-500 font-bold">Source and destination must be different accounts.</p>
              )}
            </div>
          )}

          {/* Player link (hidden for transfers) */}
          {!isTransfer && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Link to Player Account (Optional)</label>
              <select value={formData.playerId} onChange={e => {
                const selectedPlayer = players.find(p => p.id === e.target.value);
                setFormData({
                  ...formData, 
                  playerId: e.target.value,
                  playerName: selectedPlayer ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : ''
                });
              }} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="">-- General Team Expense/Income --</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Cleared checkbox (hidden for transfers — they auto-clear) */}
          {!isTransfer && (
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="cleared" checked={formData.cleared} 
                onChange={e => setFormData({...formData, cleared: e.target.checked})} 
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" />
              <label htmlFor="cleared" className="text-sm font-bold text-slate-700">Funds Cleared / Received</label>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" 
              disabled={isSubmitting || (isTransfer && formData.transferFrom === formData.transferTo)} 
              className={`font-bold py-2 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50 text-white ${
                isTransfer ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}>
              {isSubmitting ? 'Saving...' : (isTransfer ? 'Record Transfer' : 'Save Transaction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}