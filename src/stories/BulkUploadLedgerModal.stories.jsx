import BulkUploadLedgerModal from '../components/BulkUploadLedgerModal';

const mockPlayers = [
  { id: 'p1', firstName: 'Marcus', lastName: 'Johnson' },
  { id: 'p2', firstName: 'Sofia', lastName: 'Martinez' },
  { id: 'p3', firstName: 'Kai', lastName: 'Williams' },
];

export default {
  title: 'Components/BulkUploadLedgerModal',
  component: BulkUploadLedgerModal,
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
    players: mockPlayers,
  },
};
