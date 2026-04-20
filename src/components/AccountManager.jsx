import React, { useState } from 'react';
import { Plus, Trash2, Edit, X, Save, Wallet, Loader2 } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { HOLDINGS, HOLDING_LABELS, HOLDING_ICONS, HOLDING_COLORS } from '../utils/holdings';

const EMPTY_FORM = { id: null, name: '', holding: 'bank', isActive: true, sortOrder: 0 };

export default function AccountManager({ accounts = [], onSave, onDelete, isSaving }) {
  const { t } = useT();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const handleEdit = (acc) => {
    setFormData({
      id: acc.id,
      name: acc.name,
      holding: acc.holding,
      isActive: acc.isActive,
      sortOrder: acc.sortOrder || 0,
    });
    setShowForm(true);
    setError('');
  };

  const handleNew = () => {
    setFormData(EMPTY_FORM);
    setShowForm(true);
    setError('');
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData(EMPTY_FORM);
    setError('');
  };

  const handleSubmit = async () => {
    const name = formData.name.trim();
    if (!name) {
      setError(t('accountMgr.errorName'));
      return;
    }
    const dupe = accounts.find((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== formData.id);
    if (dupe) {
      setError(t('accountMgr.errorDuplicate'));
      return;
    }
    try {
      await onSave({ ...formData, name });
      handleCancel();
    } catch (err) {
      setError(err.message || 'Save failed');
    }
  };

  const handleDelete = async (acc) => {
    if (!window.confirm(t('accountMgr.confirmDelete', { name: acc.name }))) return;
    try {
      await onDelete(acc.id);
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const grouped = HOLDINGS.reduce((acc, h) => {
    acc[h] = accounts.filter((a) => a.holding === h);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Wallet size={16} className="text-indigo-600" /> {t('accountMgr.title')}
          </p>
          <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t('accountMgr.subtitle')}</p>
        </div>
        {!showForm && (
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Plus size={12} /> {t('accountMgr.addAccount')}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {formData.id ? t('accountMgr.editAccount') : t('accountMgr.newAccount')}
            </p>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
              {t('accountMgr.name')}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('accountMgr.namePlaceholder')}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                {t('accountMgr.holding')}
              </label>
              <select
                value={formData.holding}
                onChange={(e) => setFormData({ ...formData, holding: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white"
              >
                {HOLDINGS.map((h) => (
                  <option key={h} value={h}>
                    {HOLDING_LABELS[h]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                {t('accountMgr.sortOrder')}
              </label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value, 10) || 0 })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="account-active"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <label htmlFor="account-active" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t('accountMgr.active')}
            </label>
          </div>
          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* Grouped list */}
      <div className="space-y-4">
        {HOLDINGS.map((h) => {
          const list = grouped[h];
          if (list.length === 0) return null;
          const colors = HOLDING_COLORS[h];
          const IconComp = HOLDING_ICONS[h];
          return (
            <div key={h} className="space-y-1.5">
              <p
                className={`text-[10px] font-black uppercase tracking-widest ${colors.text} flex items-center gap-1.5`}
              >
                <IconComp size={11} /> {HOLDING_LABELS[h]}
              </p>
              {list.map((acc) => (
                <div
                  key={acc.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
                    acc.isActive
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-slate-800 dark:text-white truncate">{acc.name}</span>
                    {!acc.isActive && (
                      <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded uppercase">
                        {t('accountMgr.archived')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEdit(acc)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                      title={t('common.edit')}
                    >
                      <Edit size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(acc)}
                      className="p-1.5 text-slate-300 hover:text-red-500 rounded"
                      title={t('common.delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {accounts.length === 0 && !showForm && (
          <div className="text-center py-8 text-slate-400 text-sm font-bold">{t('accountMgr.noAccounts')}</div>
        )}
      </div>
    </div>
  );
}
