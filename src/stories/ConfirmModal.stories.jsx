import ConfirmModal from '../components/ConfirmModal';

export default {
  title: 'Components/ConfirmModal',
  component: ConfirmModal,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    onConfirm: { action: 'confirmed' },
    onCancel: { action: 'cancelled' },
  },
};

export const DeletePlayer = {
  args: {
    message: 'Are you sure you want to remove this player from the roster? This action cannot be undone.',
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export const DeleteTransaction = {
  args: {
    message: 'Delete this transaction? The amount will be removed from the ledger.',
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export const DeleteDocument = {
  args: {
    message: 'Remove this medical release document? The player will no longer be in medical compliance.',
    onConfirm: () => {},
    onCancel: () => {},
  },
};
