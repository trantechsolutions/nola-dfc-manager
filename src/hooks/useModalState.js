import { useState } from 'react';

/**
 * Owns the transient UI state that has no business being in the URL: toasts,
 * the confirm dialog, impersonation.
 *
 * Panels used to live here too. They are addressed by the URL now
 * (usePanelRoute), so they survive a reload and can be linked to. A confirm
 * dialog deliberately stays behind: it is a promise the caller is awaiting, not
 * a place in the app, and there is nothing to restore it to after a reload.
 */
export function useModalState() {
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [impersonatingAs, setImpersonatingAs] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, isError = false, action = null) => {
    setToast({ msg, isError, action });
    setTimeout(() => setToast(null), 4000);
  };

  const showConfirm = (message) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        onConfirm: () => {
          resolve(true);
          setConfirmDialog(null);
        },
        onCancel: () => {
          resolve(false);
          setConfirmDialog(null);
        },
      });
    });
  };

  return {
    confirmDialog,
    setConfirmDialog,
    impersonatingAs,
    setImpersonatingAs,
    toast,
    setToast,
    showToast,
    showConfirm,
  };
}
