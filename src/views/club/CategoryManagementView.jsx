import React from 'react';
import { Tag } from 'lucide-react';
import CategoryManager from '../../components/CategoryManager';

export default function CategoryManagementView({ customCategories, onSave, onDelete, isSaving }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 bg-violet-100 text-violet-700 dark:text-violet-400 rounded-lg">
            <Tag size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Categories</h2>
            <p className="text-xs text-muted-foreground font-semibold mt-0.5">
              Manage transaction and budget categories for your club
            </p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-xs text-violet-700 dark:text-violet-300 font-semibold">
        Categories defined here are available when adding transactions to the ledger and when building budget line
        items. System categories cannot be deleted, but you can add custom ones for your club's specific needs.
      </div>

      {/* Manager panel */}
      <div className="bg-card rounded-lg border border-border shadow-sm p-6">
        <CategoryManager customCategories={customCategories} onSave={onSave} onDelete={onDelete} isSaving={isSaving} />
      </div>
    </div>
  );
}
