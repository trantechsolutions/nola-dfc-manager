import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

export default function ConfirmModal({ message, onConfirm, onCancel }) {
  const { t } = useT();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[300] p-4">
      <div className="bg-card rounded-lg p-8 w-full max-w-sm shadow-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-xl font-bold text-foreground">{t('common.confirmAction')}</h3>
        </div>

        <p className="text-foreground font-medium mb-8 leading-relaxed">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-lg font-semibold text-foreground bg-muted hover:bg-muted transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
          >
            {t('common.proceed')}
          </button>
        </div>
      </div>
    </div>
  );
}
