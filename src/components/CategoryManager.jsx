import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Edit, X, Save, Tag, GripVertical, AlertCircle } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

// ── Category colors (static — no translation needed) ──
export const CATEGORY_COLORS = {
  TMF: 'bg-blue-50 text-blue-700 dark:text-blue-300',
  SPO: 'bg-violet-50 text-violet-700 dark:text-violet-300',
  FUN: 'bg-emerald-50 text-emerald-700 dark:text-emerald-300',
  OPE: 'bg-muted text-foreground',
  TOU: 'bg-amber-50 text-amber-700 dark:text-amber-300',
  LEA: 'bg-orange-50 text-orange-700',
  CRE: 'bg-cyan-50 text-cyan-700',
  FRI: 'bg-rose-50 text-rose-700',
  TRF: 'bg-indigo-50 text-indigo-700 dark:text-indigo-300',
};

// ── Build translated default categories (call inside component) ──
export function getDefaultCategories(t) {
  return {
    TMF: { label: t('categories.teamFees'), description: t('catMgr.descTeamFees'), color: CATEGORY_COLORS.TMF },
    SPO: { label: t('categories.sponsorship'), description: t('catMgr.descSponsorship'), color: CATEGORY_COLORS.SPO },
    FUN: { label: t('categories.fundraising'), description: t('catMgr.descFundraising'), color: CATEGORY_COLORS.FUN },
    OPE: { label: t('categories.operating'), description: t('catMgr.descOperating'), color: CATEGORY_COLORS.OPE },
    TOU: { label: t('categories.tournament'), description: t('catMgr.descTournament'), color: CATEGORY_COLORS.TOU },
    LEA: { label: t('categories.leagueRefs'), description: t('catMgr.descLeague'), color: CATEGORY_COLORS.LEA },
    CRE: { label: t('categories.credit'), description: t('catMgr.descCredit'), color: CATEGORY_COLORS.CRE },
    FRI: { label: t('categories.friendlies'), description: t('catMgr.descFriendlies'), color: CATEGORY_COLORS.FRI },
    TRF: { label: t('categories.transfer'), description: t('catMgr.descTransfer'), color: CATEGORY_COLORS.TRF },
  };
}

// Keep a static fallback export for files that import DEFAULT_CATEGORIES outside React
export const DEFAULT_CATEGORIES = {
  TMF: {
    label: 'Team Fees',
    description: 'Player team fee payments',
    color: 'bg-blue-50 text-blue-700 dark:text-blue-300',
  },
  SPO: {
    label: 'Sponsorship',
    description: 'Sponsor contributions and donations',
    color: 'bg-violet-50 text-violet-700 dark:text-violet-300',
  },
  FUN: {
    label: 'Fundraising',
    description: 'Fundraiser income',
    color: 'bg-emerald-50 text-emerald-700 dark:text-emerald-300',
  },
  OPE: { label: 'Operating', description: 'General operating expenses', color: 'bg-muted text-foreground' },
  TOU: {
    label: 'Tournament',
    description: 'Tournament entry fees and travel',
    color: 'bg-amber-50 text-amber-700 dark:text-amber-300',
  },
  LEA: { label: 'League/Refs', description: 'League dues and referee payments', color: 'bg-orange-50 text-orange-700' },
  CRE: { label: 'Credit', description: 'Player credits and discounts', color: 'bg-cyan-50 text-cyan-700' },
  FRI: { label: 'Friendlies', description: 'Friendly match expenses', color: 'bg-rose-50 text-rose-700' },
  TRF: {
    label: 'Transfer',
    description: 'Internal fund transfers between accounts',
    color: 'bg-indigo-50 text-indigo-700 dark:text-indigo-300',
  },
};

const COLOR_OPTIONS = [
  { value: 'bg-blue-50 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500', name: 'Blue' },
  { value: 'bg-violet-50 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', name: 'Violet' },
  { value: 'bg-emerald-50 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', name: 'Emerald' },
  { value: 'bg-muted text-foreground', dot: 'bg-slate-500', name: 'Slate' },
  { value: 'bg-amber-50 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', name: 'Amber' },
  { value: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500', name: 'Orange' },
  { value: 'bg-cyan-50 text-cyan-700', dot: 'bg-cyan-500', name: 'Cyan' },
  { value: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500', name: 'Rose' },
  { value: 'bg-pink-50 text-pink-700', dot: 'bg-pink-500', name: 'Pink' },
  { value: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500', name: 'Teal' },
  { value: 'bg-lime-50 text-lime-700', dot: 'bg-lime-500', name: 'Lime' },
  { value: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-500', name: 'Yellow' },
];

const EMPTY_FORM = { code: '', label: '', description: '', color: COLOR_OPTIONS[0].value, flow: 'expense' };

export default function CategoryManager({ customCategories, onSave, onDelete, isSaving }) {
  const { t } = useT();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  const translatedDefaults = useMemo(() => getDefaultCategories(t), [t]);

  // Merge default + custom for display
  const allCustom = customCategories || [];

  const handleEdit = (cat) => {
    setEditingId(cat.id);
    setFormData({
      code: cat.code,
      label: cat.label,
      description: cat.description || '',
      color: cat.color || COLOR_OPTIONS[0].value,
      flow: cat.flow || 'expense',
    });
    setShowForm(true);
    setError('');
  };

  const handleNew = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM });
    setShowForm(true);
    setError('');
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ ...EMPTY_FORM });
    setError('');
  };

  const validateCode = (code) => {
    if (!code || code.length < 2 || code.length > 5) return t('catMgr.codeLength');
    if (!/^[A-Z0-9]+$/.test(code)) return t('catMgr.codeFormat');
    // Check against defaults (only on new categories)
    if (!editingId && DEFAULT_CATEGORIES[code]) return t('catMgr.codeReserved');
    // Check against other custom categories
    const duplicate = allCustom.find((c) => c.code === code && c.id !== editingId);
    if (duplicate) return t('catMgr.codeDuplicate');
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const codeUpper = formData.code.toUpperCase().trim();
    const codeError = validateCode(codeUpper);
    if (codeError) {
      setError(codeError);
      return;
    }
    if (!formData.label.trim()) {
      setError(t('catMgr.labelRequired'));
      return;
    }

    setError('');
    await onSave({
      ...(editingId ? { id: editingId } : {}),
      code: codeUpper,
      label: formData.label.trim(),
      description: formData.description.trim(),
      color: formData.color,
      flow: formData.flow,
    });
    handleCancel();
  };

  return (
    <div className="space-y-4">
      {/* ── HEADER ── */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Tag size={18} /> Custom Categories
          </h3>
          <p className="text-xs text-muted-foreground font-semibold mt-0.5">
            Add custom categories for transactions. These appear in the ledger and transaction forms.
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:bg-accent/90 transition-all"
        >
          <Plus size={14} /> Add Category
        </button>
      </div>

      {/* ── SYSTEM CATEGORIES (read-only display) ── */}
      <div className="bg-background p-4 rounded-lg border border-border">
        <p className="text-xs font-bold text-muted-foreground mb-3">System Categories (built-in)</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(translatedDefaults).map(([code, cat]) => (
            <span
              key={code}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${cat.color}`}
            >
              <span className="font-bold">{code}</span>
              <span className="opacity-60">·</span>
              {cat.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── CUSTOM CATEGORIES LIST ── */}
      {allCustom.length > 0 && (
        <div className="bg-card rounded-lg border border-border overflow-hidden divide-y divide-border">
          {allCustom.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 p-4 hover:bg-background/50 transition-colors">
              <GripVertical size={14} className="text-muted-foreground shrink-0" />
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold shrink-0 ${cat.color}`}
              >
                {cat.code}
              </span>
              <div className="flex-grow min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{cat.label}</p>
                {cat.description && <p className="text-xs text-muted-foreground truncate">{cat.description}</p>}
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  cat.flow === 'income'
                    ? 'bg-emerald-50 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 text-red-700 dark:text-red-400'
                }`}
              >
                {cat.flow === 'income' ? 'Income' : 'Expense'}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleEdit(cat)}
                  className="p-1.5 text-muted-foreground hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => onDelete(cat.id)}
                  className="p-1.5 text-muted-foreground hover:text-red-700 dark:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {allCustom.length === 0 && !showForm && (
        <div className="text-center py-8 text-muted-foreground">
          <Tag size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">No custom categories yet</p>
          <p className="text-xs mt-1">
            Add categories like "Equipment", "Uniform", or "Travel" to organize your ledger.
          </p>
        </div>
      )}

      {/* ── ADD / EDIT FORM ── */}
      {showForm && (
        <div className="bg-card rounded-lg border-2 border-blue-200 dark:border-blue-700 p-5 space-y-4 shadow-sm">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold text-foreground">{editingId ? 'Edit Category' : 'New Category'}</h4>
            <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Code (2-5 chars)</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 5),
                    })
                  }
                  placeholder="e.g. EQP"
                  maxLength={5}
                  disabled={!!editingId}
                  className="w-full border border-border rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring uppercase disabled:bg-background disabled:text-muted-foreground"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Label</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="e.g. Equipment"
                  className="w-full border border-border rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this category covers..."
                className="w-full border border-border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Default Flow</label>
                <select
                  value={formData.flow}
                  onChange={(e) => setFormData({ ...formData, flow: e.target.value })}
                  className="w-full border border-border rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Color</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: opt.value })}
                      className={`w-6 h-6 rounded-full ${opt.dot} transition-all ${
                        formData.color === opt.value
                          ? 'ring-2 ring-offset-2 ring-blue-500 scale-110'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      title={opt.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-xs font-semibold bg-red-50 p-3 rounded-lg">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-background rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm"
              >
                <Save size={14} /> {isSaving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
