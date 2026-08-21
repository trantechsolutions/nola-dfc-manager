import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import ResponsiveModal from './layout/ResponsiveModal';

export default function ConfirmModal({ message, onConfirm, onCancel }) {
  const { t } = useT();

  return (
    // Stays a card on a phone: an alert is not a screen you navigated to, and
    // it is reachable from inside panels that are — hence z-1070, above them.
    <ResponsiveModal
      fullScreen={false}
      size="sm"
      onClose={onCancel}
      overlayClassName="z-[1070]"
      className="animate-in fade-in zoom-in-95 duration-200"
    >
      <ResponsiveModal.Header dismissible={false}>
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-amber-100 p-3 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-xl font-bold text-foreground">{t('common.confirmAction')}</h3>
        </div>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="pt-0">
        <p className="font-medium leading-relaxed text-foreground">{message}</p>
      </ResponsiveModal.Body>

      <ResponsiveModal.Footer className="flex-nowrap">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg bg-muted px-4 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-red-600 px-4 py-3 font-bold text-white shadow-lg shadow-red-200 transition-colors hover:bg-red-700"
        >
          {t('common.proceed')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
