import React from 'react';
import { Tag } from 'lucide-react';
import CategoryManager from '../../components/CategoryManager';

export default function CategoryManagementView({ customCategories, onSave, onDelete, isSaving }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 bg-violet-100 text-violet-600 rounded-xl">
            <Tag size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Categories</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              Manage transaction and budget categories for your club
            </p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-xs text-violet-700 font-bold">
        Categories defined here are available when adding transactions to the ledger and when building budget line
        items. System categories cannot be deleted, but you can add custom ones for your club's specific needs.
      </div>

      {/* Manager panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <CategoryManager customCategories={customCategories} onSave={onSave} onDelete={onDelete} isSaving={isSaving} />
      </div>
    </div>
  );
}
