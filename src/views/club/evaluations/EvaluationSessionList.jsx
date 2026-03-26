import React, { useState } from 'react';
import { Plus, Trash2, Calendar, Users, ChevronRight, X } from 'lucide-react';
import { useT } from '../../../i18n/I18nContext';
import { useEvaluationManager } from '../../../hooks/useEvaluationManager';

const STATUS_STYLES = {
  draft: {
    bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    label: 'Draft',
  },
  active: {
    bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    label: 'Active',
  },
  completed: {
    bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    label: 'Completed',
  },
};

const EMPTY_FORM = { name: '', description: '', seasonId: '', scoreScale: 5 };

export default function EvaluationSessionList({
  club,
  seasons,
  selectedSeason,
  user,
  onSelectSession,
  showToast,
  showConfirm,
}) {
  const { t } = useT();
  const { sessions, loading, createSession, deleteSession } = useEvaluationManager(club?.id);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, seasonId: selectedSeason || '' });
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    setForm({ ...EMPTY_FORM, seasonId: selectedSeason || '' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(EMPTY_FORM);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createSession({
        name: form.name.trim(),
        description: form.description.trim(),
        seasonId: form.seasonId || null,
        scoreScale: form.scoreScale,
        status: 'draft',
        createdBy: user?.id,
      });
      closeModal();
      if (showToast) showToast(t('evaluations.sessionCreated', 'Session created'));
    } catch {
      if (showToast) showToast(t('evaluations.createFailed', 'Failed to create session'), true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (session) => {
    const ok = await showConfirm(
      t('evaluations.deleteConfirm', `Permanently delete "${session.name}"? This cannot be undone.`),
    );
    if (!ok) return;
    try {
      await deleteSession(session.id);
      if (showToast) showToast(t('evaluations.sessionDeleted', 'Session deleted'));
    } catch {
      if (showToast) showToast(t('evaluations.deleteFailed', 'Failed to delete session'), true);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {sessions.length}{' '}
          {sessions.length === 1 ? t('evaluations.session', 'session') : t('evaluations.sessions', 'sessions')}
        </p>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          {t('evaluations.newSession', 'New Session')}
        </button>
      </div>

      {/* Session Cards */}
      {sessions.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4">
            <Users size={24} className="text-indigo-400 dark:text-indigo-300" />
          </div>
          <p className="text-slate-600 dark:text-slate-300 font-semibold mb-1">
            {t('evaluations.noSessions', 'No evaluation sessions yet')}
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {t('evaluations.noSessionsHint', 'Create a session to start evaluating players.')}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const status = STATUS_STYLES[session.status] || STATUS_STYLES.draft;
            return (
              <div
                key={session.id}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Main content - clickable */}
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className="flex-1 flex items-center gap-4 text-left min-w-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white truncate">{session.name}</h3>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${status.bg}`}>
                          {t(`evaluations.status.${session.status}`, status.label)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                        {session.createdAt && (
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {formatDate(session.createdAt)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {session.candidateCount ?? 0} {t('evaluations.candidates', 'candidates')}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      size={18}
                      className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0"
                    />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(session);
                    }}
                    className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                    title={t('evaluations.delete', 'Delete session')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Session Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('evaluations.newSession', 'New Session')}
              </h3>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('evaluations.sessionName', 'Session Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('evaluations.sessionNamePlaceholder', 'e.g. Spring 2026 Tryouts')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('evaluations.description', 'Description')}
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder={t('evaluations.descriptionPlaceholder', 'Optional session notes...')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm resize-none"
                />
              </div>

              {/* Season picker */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('evaluations.season', 'Season')}
                </label>
                <select
                  value={form.seasonId}
                  onChange={(e) => setForm((f) => ({ ...f, seasonId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                >
                  <option value="">{t('evaluations.noSeason', '-- No season --')}</option>
                  {(seasons || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Score scale */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('evaluations.scoreScale', 'Score Scale')}
                </label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scoreScale"
                      value={5}
                      checked={form.scoreScale === 5}
                      onChange={() => setForm((f) => ({ ...f, scoreScale: 5 }))}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">1 – 5</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scoreScale"
                      value={10}
                      checked={form.scoreScale === 10}
                      onChange={() => setForm((f) => ({ ...f, scoreScale: 10 }))}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">1 – 10</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                >
                  {saving ? t('common.saving', 'Saving...') : t('evaluations.createSession', 'Create Session')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
