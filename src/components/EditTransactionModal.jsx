import React from 'react';

export default function EditTransactionModal({ 
  show, 
  onClose, 
  onUpdate, 
  onDelete,
  editTx, 
  setEditTx, 
  isSubmitting, 
  players 
}) {
  if (!show || !editTx) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <h3 className="font-bold text-lg">Edit Transaction</h3>
          <button onClick={onClose} className="text-blue-200 hover:text-white font-bold text-xl">&times;</button>
        </div>
        
        <form onSubmit={onUpdate} className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Title / Description</label>
            <input required type="text" value={editTx.title} onChange={e => setEditTx({...editTx, title: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Amount ($)</label>
              <input required type="number" step="0.01" value={editTx.amount} onChange={e => setEditTx({...editTx, amount: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Date</label>
              <input required type="date" value={editTx.date} onChange={e => setEditTx({...editTx, date: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className={`grid ${editTx.category === 'CRE' ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Category</label>
              <select value={editTx.category} onChange={e => setEditTx({...editTx, category: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2">
                <option value="TMF">Team Fees</option>
                <option value="FUN">Fundraising</option>
                <option value="SPO">Sponsorship</option>
                <option value="OPE">Operating</option>
                <option value="TOU">Tournament</option>
                <option value="LEA">League/Refs</option>
                <option value="CRE">Player Credit / Discount</option>
              </select>
            </div>
            {editTx.category !== 'CRE' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Payment Method</label>
                <select value={editTx.type} onChange={e => setEditTx({...editTx, type: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none">
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
            <label className="block text-sm font-bold text-slate-700 mb-1">Link to Player</label>
            <select value={editTx.playerId || ''} onChange={e => setEditTx({...editTx, playerId: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2">
              <option value="">-- General Team Expense --</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
            </select>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-between gap-3 shrink-0">
            <button 
              type="button" 
              onClick={() => { if(window.confirm('Delete this transaction permanently?')) onDelete(editTx.id) }}
              className="px-4 py-2 font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              Delete
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow-sm disabled:opacity-50">
                {isSubmitting ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}