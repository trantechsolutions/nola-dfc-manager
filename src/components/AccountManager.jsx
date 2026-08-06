import React, { useState } from 'react';
import { Plus, Trash2, Edit, X, Save, Wallet, Loader2, Eye, AlertTriangle } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import AdminCard from './layout/AdminCard';
import { HOLDINGS, HOLDING_LABELS, HOLDING_ICONS, HOLDING_COLORS } from '../utils/holdings';

const EMPTY_FORM = {
  id: null,
  name: '',
  handle: '',
  holding: 'bank',
  isActive: true,
  isPublic: false,
  sortOrder: 0,
};

/**
 * AccountManager — sits in the same `AdminCard` box as every other settings
 * pane, so the card supplies the title and the "Add Account" tool. Inside it,
 * records use the club Users page idiom (views/club/UserManagement): a row per
 * account with an avatar, a dashed-border empty state, and the create/edit form
 * in a modal rather than an inline panel. Accounts group by holding, so the
 * rows sit under small colour-coded group headings the Users page doesn't need.
 *
 * The rows are `bg-background` rather than the Users page's `bg-card` — inside
 * a card, card-on-card reads as a rendering bug rather than a list.
 */
export default function AccountManager({ accounts = [], onSave, onDelete, isSaving }) {
  const { t } = useT();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const handleEdit = (acc) => {
    setFormData({
      id: acc.id,
      name: acc.name,
      handle: acc.handle || '',
      holding: acc.holding,
      isActive: acc.isActive,
      isPublic: acc.isPublic ?? false,
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

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
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

  const activeCount = accounts.filter((a) => a.isActive).length;
  const archivedCount = accounts.length - activeCount;

  return (
    <>
      <AdminCard
        title={t('accountMgr.title')}
        icon={Wallet}
        tools={
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-muted"
          >
            <Plus size={13} /> {t('accountMgr.addAccount')}
          </button>
        }
        footer={
          <p className="text-xs text-muted-foreground">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
            {archivedCount > 0 && ` · ${archivedCount} ${t('accountMgr.archived').toLowerCase()}`}
          </p>
        }
        bodyClassName="space-y-4"
      >
        <p className="text-xs text-muted-foreground">{t('accountMgr.subtitle')}</p>

        {/* ═══ LIST ═══ grouped by holding, one row per account ═══ */}
        {accounts.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-border bg-background p-10 text-center text-sm font-semibold text-muted-foreground">
            {t('accountMgr.noAccounts')}
          </div>
        ) : (
          <div className="space-y-5">
            {HOLDINGS.map((h) => {
              const list = grouped[h];
              if (list.length === 0) return null;
              const colors = HOLDING_COLORS[h];
              const IconComp = HOLDING_ICONS[h];
              return (
                <div key={h} className="space-y-2">
                  <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${colors.text}`}>
                    <IconComp size={12} /> {HOLDING_LABELS[h]}
                    <span className="font-semibold text-muted-foreground">({list.length})</span>
                  </p>
                  {list.map((acc) => (
                    <div
                      key={acc.id}
                      className={`overflow-hidden rounded-lg border border-border bg-background ${
                        acc.isActive ? '' : 'opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        {/* Avatar — the holding icon stands in for the Users page initial */}
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colors.bg} ${colors.icon}`}
                        >
                          <IconComp size={16} />
                        </div>

                        <div className="min-w-0 flex-grow">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-foreground">{acc.name}</p>
                            {!acc.isActive && (
                              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-bold uppercase text-muted-foreground">
                                {t('accountMgr.archived')}
                              </span>
                            )}
                            {/* Only the published state is badged. "Internal"
                                is the default and the safe state — badging it
                                would put a label on nearly every row and make
                                the one that matters harder to spot. */}
                            {acc.isActive && acc.isPublic && (
                              <span
                                className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400"
                                title={t('accountMgr.publicHint')}
                              >
                                <Eye size={10} /> {t('accountMgr.publicBadge')}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs font-medium text-muted-foreground">
                            {acc.handle || HOLDING_LABELS[acc.holding]}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => handleEdit(acc)}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title={t('common.edit')}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(acc)}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title={t('common.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {/* ═══ ACCOUNT MODAL ═══ rendered outside the card so the card's
          `overflow-hidden` can never interact with the fixed overlay. */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Wallet size={20} className="text-muted-foreground" />
                {formData.id ? t('accountMgr.editAccount') : t('accountMgr.newAccount')}
              </h3>
              <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="account-name" className="text-xs font-semibold text-muted-foreground">
                  {t('accountMgr.name')} *
                </label>
                <input
                  id="account-name"
                  autoFocus
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('accountMgr.namePlaceholder')}
                  className="mt-1 w-full rounded-lg border border-border bg-card p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label htmlFor="account-handle" className="text-xs font-semibold text-muted-foreground">
                  {t('accountMgr.handle')}
                </label>
                <input
                  id="account-handle"
                  type="text"
                  value={formData.handle}
                  onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                  placeholder={t('accountMgr.handlePlaceholder')}
                  className="mt-1 w-full rounded-lg border border-border bg-card p-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="account-holding" className="text-xs font-semibold text-muted-foreground">
                    {t('accountMgr.holding')} *
                  </label>
                  <select
                    id="account-holding"
                    value={formData.holding}
                    onChange={(e) => setFormData({ ...formData, holding: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-card p-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                  >
                    {HOLDINGS.map((h) => (
                      <option key={h} value={h}>
                        {HOLDING_LABELS[h]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="account-sort" className="text-xs font-semibold text-muted-foreground">
                    {t('accountMgr.sortOrder')}
                  </label>
                  <input
                    id="account-sort"
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value, 10) || 0 })}
                    className="mt-1 w-full rounded-lg border border-border bg-card p-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-lg bg-background p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="account-active"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 rounded accent-primary"
                  />
                  <label htmlFor="account-active" className="text-xs font-semibold text-foreground">
                    {t('accountMgr.active')}
                  </label>
                </div>

                {/* The one switch with an audience outside this page: checking
                    it puts the handle in front of every parent on the team. */}
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="account-public"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded accent-primary"
                  />
                  <div>
                    <label htmlFor="account-public" className="text-xs font-semibold text-foreground">
                      {t('accountMgr.public')}
                    </label>
                    <p className="text-xs text-muted-foreground">{t('accountMgr.publicHint')}</p>
                  </div>
                </div>
              </div>

              {/* Published with nothing to publish — a parent would see the
                  account name and no way to act on it, so say so before save. */}
              {formData.isPublic && !formData.handle.trim() && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-warning">
                  <AlertTriangle size={13} className="mt-px shrink-0" />
                  {t('accountMgr.publicNeedsHandle')}
                </p>
              )}

              {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-semibold text-muted-foreground"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !formData.name.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
