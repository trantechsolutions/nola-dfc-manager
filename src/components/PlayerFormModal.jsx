import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Archive } from 'lucide-react';

export default function PlayerFormModal({ show, onClose, onSubmit, onArchive, initialData, isSubmitting, selectedSeason }) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    jerseyNumber: '',
    status: 'active',
    guardians: [{ name: '', email: '', phone: '' }]
  });

  useEffect(() => {
    if (initialData) {
        setFormData({
          ...initialData,
          guardians: initialData.guardians?.length ? initialData.guardians : [{ name: '', email: '', phone: '' }],
          status: initialData.status || 'active'
        });
    } else {
        setFormData({
          firstName: '', lastName: '', jerseyNumber: '', status: 'active',
          guardians: [{ name: '', email: '', phone: '' }]
        });
    }
  }, [initialData, show, selectedSeason]);

  if (!show) return null;

  const handleGuardianChange = (index, field, value) => {
    const newGuardians = [...formData.guardians];
    newGuardians[index][field] = value;
    setFormData({ ...formData, guardians: newGuardians });
  };

  const addGuardian = () => {
    setFormData({ ...formData, guardians: [...formData.guardians, { name: '', email: '', phone: '' }] });
  };

  const removeGuardian = (index) => {
    const newGuardians = formData.guardians.filter((_, i) => i !== index);
    setFormData({ ...formData, guardians: newGuardians });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Safely update the player's season profile while preserving existing 
    // data like baseFee and feeWaived managed by the Budget view
    const profiles = initialData?.seasonProfiles || {};
    profiles[selectedSeason] = {
      ...(profiles[selectedSeason] || {}),
      status: formData.status 
    };

    const submissionData = {
      ...formData,
      seasonProfiles: profiles
    };
    
    onSubmit(submissionData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-xl font-black text-slate-800">
            {initialData ? 'Edit Player' : 'Add New Player'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">First Name</label>
              <input type="text" required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Last Name</label>
              <input type="text" required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Jersey #</label>
                <input type="text" value={formData.jerseyNumber} onChange={e => setFormData({...formData, jerseyNumber: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="active">Active</option>
                  <option value="archived">Archived / Inactive</option>
                </select>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest">Parent / Guardian Info</label>
              <button type="button" onClick={addGuardian} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Plus size={14} /> Add Another
              </button>
            </div>
            
            <div className="space-y-4">
              {formData.guardians.map((guardian, index) => (
                <div key={index} className="flex gap-2 items-start bg-white p-3 rounded-lg border border-slate-200 shadow-sm relative">
                  <div className="flex-grow space-y-2">
                    <input type="text" placeholder="Full Name" required value={guardian.name} onChange={e => handleGuardianChange(index, 'name', e.target.value)} className="w-full border border-slate-200 rounded md p-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                    <input type="email" placeholder="Email (Used for Login)" required value={guardian.email} onChange={e => handleGuardianChange(index, 'email', e.target.value)} className="w-full border border-slate-200 rounded md p-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                    <input type="tel" placeholder="Phone Number" value={guardian.phone} onChange={e => handleGuardianChange(index, 'phone', e.target.value)} className="w-full border border-slate-200 rounded md p-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                  </div>
                  {formData.guardians.length > 1 && (
                    <button type="button" onClick={() => removeGuardian(index)} className="text-red-400 hover:text-red-600 mt-1">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-100">
            {initialData ? (
              <button type="button" onClick={() => onArchive(initialData.id)} className="px-4 py-2 font-bold text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors">
                <Archive size={16} /> Archive
              </button>
            ) : <div />}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2">
                {isSubmitting ? 'Saving...' : (initialData ? 'Update Player' : 'Add Player')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}