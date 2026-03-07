import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[300] p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-full">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-xl font-black text-slate-800">Confirm Action</h3>
        </div>
        
        <p className="text-slate-600 font-medium mb-8 leading-relaxed">
          {message}
        </p>
        
        <div className="flex gap-3">
          <button 
            onClick={onCancel} 
            className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm} 
            className="flex-1 py-3 px-4 rounded-xl font-black text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}