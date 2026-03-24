import PlayerFormModal from '../components/PlayerFormModal';

export default {
  title: 'Components/PlayerFormModal',
  component: PlayerFormModal,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    onClose: { action: 'closed' },
    onSubmit: { action: 'submitted' },
    onArchive: { action: 'archived' },
  },
};

export const AddPlayer = {
  args: {
    show: true,
    onClose: () => {},
    onSubmit: () => {},
    onArchive: () => {},
    initialData: null,
    isSubmitting: false,
    selectedSeason: '2025-2026',
  },
};

export const EditPlayer = {
  args: {
    show: true,
    onClose: () => {},
    onSubmit: () => {},
    onArchive: () => {},
    initialData: {
      firstName: 'Marcus',
      lastName: 'Johnson',
      jerseyNumber: '10',
      status: 'active',
      guardians: [
        { name: 'Lisa Johnson', email: 'lisa@example.com', phone: '504-555-0101' },
        { name: 'David Johnson', email: 'david@example.com', phone: '504-555-0102' },
      ],
    },
    isSubmitting: false,
    selectedSeason: '2025-2026',
  },
};

export const Submitting = {
  args: {
    show: true,
    onClose: () => {},
    onSubmit: () => {},
    onArchive: () => {},
    initialData: null,
    isSubmitting: true,
    selectedSeason: '2025-2026',
  },
};
