import React, { useState, useEffect } from 'react';

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
    cleared: false
  });

  useEffect(() => {
    if (initialData) {
      let formattedDate = new Date().toISOString().split('T')[0];
      if (initialData.date && initialData.date.seconds) {
        formattedDate = new Date(initialData.date.seconds * 1000).toISOString().split('T')[0];
      }
      setFormData({
        ...initialData,
        date: formattedDate
      });
    } else {
      setFormData({
        title: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'TMF',
        type: 'Venmo',
        playerId: '',
        cleared: false
      });
    }
  }, [initialData, show]);

  if (!show) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount) || 0
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <h3 className="font-bold text-lg">{initialData ? 'Edit Transaction' : 'Log New Transaction'}</h3>
          <button type="button" onClick={onClose} className="text-emerald-200 hover:text-white font-bold text-xl">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Title / Description</label>
            <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="e.g., Spring Team Fees, Referee Payment..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Amount ($)</label>
              <input required type="number" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Date</label>
              <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
          </div>

          <div className={`grid ${formData.category === 'CRE' ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Category</label>
              <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="TMF">Team Fees (Income)</option>
                <option value="FUN">Fundraising (Income)</option>
                <option value="SPO">Sponsorship (Income)</option>
                <option value="OPE">Operating (Expense)</option>
                <option value="TOU">Tournament (Expense)</option>
                <option value="LEA">League/Refs (Expense)</option>
                <option value="CRE">Player Credit / Discount</option>
              </select>
            </div>
            {formData.category !== 'CRE' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Payment Method</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="Venmo">Venmo</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Cash">Cash</option>
                  <option value="Check">Check</option>
                  <option value="ACH">ACH (Bank)</option>
                </select>
              </div>
            )}
          </div>

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

          <div className="flex items-center gap-2 pt-2">
            <input type="checkbox" id="cleared" checked={formData.cleared} onChange={e => setFormData({...formData, cleared: e.target.checked})} className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" />
            <label htmlFor="cleared" className="text-sm font-bold text-slate-700">Funds Cleared / Received</label>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50">
              {isSubmitting ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}