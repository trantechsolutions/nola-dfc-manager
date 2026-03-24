import TransactionModal from '../components/TransactionModal';

const mockPlayers = [
  { id: 'p1', firstName: 'Marcus', lastName: 'Johnson' },
  { id: 'p2', firstName: 'Sofia', lastName: 'Martinez' },
  { id: 'p3', firstName: 'Kai', lastName: 'Williams' },
];

const mockEvents = [
  { id: 'e1', title: 'vs Metairie FC', date: '2025-03-15' },
  { id: 'e2', title: 'Spring Tournament', date: '2025-04-01' },
];

export default {
  title: 'Components/TransactionModal',
  component: TransactionModal,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    onClose: { action: 'closed' },
    onSubmit: { action: 'submitted' },
  },
};

export const NewTransaction = {
  args: {
    show: true,
    onClose: () => {},
    onSubmit: () => {},
    initialData: null,
    isSubmitting: false,
    players: mockPlayers,
    teamEvents: mockEvents,
  },
};

export const EditTransaction = {
  args: {
    show: true,
    onClose: () => {},
    onSubmit: () => {},
    initialData: {
      title: 'March Dues',
      amount: 150,
      date: '2025-03-01',
      category: 'TMF',
      type: 'Venmo',
      playerId: 'p1',
      cleared: true,
    },
    isSubmitting: false,
    players: mockPlayers,
    teamEvents: mockEvents,
  },
};

export const Submitting = {
  args: {
    show: true,
    onClose: () => {},
    onSubmit: () => {},
    initialData: null,
    isSubmitting: true,
    players: mockPlayers,
    teamEvents: [],
  },
};
