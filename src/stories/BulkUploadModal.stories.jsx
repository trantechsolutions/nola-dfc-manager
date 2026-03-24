import BulkUploadModal from '../components/BulkUploadModal';

export default {
  title: 'Components/BulkUploadModal',
  component: BulkUploadModal,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    onClose: { action: 'closed' },
    onUpload: { action: 'uploaded' },
  },
};

export const Default = {
  args: {
    show: true,
    onClose: () => {},
    onUpload: () => {},
    isSubmitting: false,
    existingPlayers: [
      { firstName: 'Marcus', lastName: 'Johnson' },
      { firstName: 'Sofia', lastName: 'Martinez' },
    ],
  },
};

export const Submitting = {
  args: {
    show: true,
    onClose: () => {},
    onUpload: () => {},
    isSubmitting: true,
    existingPlayers: [],
  },
};
