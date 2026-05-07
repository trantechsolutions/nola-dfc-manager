import { useState } from 'react';

/**
 * Owns all transient UI state: modals, toasts, confirm dialogs, impersonation.
 * Extracted from App.jsx to keep the root component focused on layout and auth.
 */
export function useModalState() {
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [playerToEdit, setPlayerToEdit] = useState(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [playerToView, setPlayerToView] = useState(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [txToEdit, setTxToEdit] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [impersonatingAs, setImpersonatingAs] = useState(null);
  const [toast, setToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false);

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
    showPlayerForm,
    setShowPlayerForm,
    playerToEdit,
    setPlayerToEdit,
    showPlayerModal,
    setShowPlayerModal,
    playerToView,
    setPlayerToView,
    showTxForm,
    setShowTxForm,
    txToEdit,
    setTxToEdit,
    confirmDialog,
    setConfirmDialog,
    impersonatingAs,
    setImpersonatingAs,
    toast,
    setToast,
    mobileMenuOpen,
    setMobileMenuOpen,
    sidebarSettingsOpen,
    setSidebarSettingsOpen,
    showToast,
    showConfirm,
  };
}
