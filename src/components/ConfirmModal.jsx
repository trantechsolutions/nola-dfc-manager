import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

export default function ConfirmModal({ message, onConfirm, onCancel }) {
  const { t } = useT();

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[300] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 w-full max-w-sm shadow-2xl dark:shadow-none animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 rounded-full">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-xl font-black text-slate-800 dark:text-white">{t('common.confirmAction')}</h3>
        </div>

        <p className="text-slate-600 dark:text-slate-300 font-medium mb-8 leading-relaxed">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-xl font-black text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
          >
            {t('common.proceed')}
          </button>
        </div>
      </div>
    </div>
  );
}
