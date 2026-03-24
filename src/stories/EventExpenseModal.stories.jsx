import EventExpenseModal from '../components/EventExpenseModal';

export default {
  title: 'Components/EventExpenseModal',
  component: EventExpenseModal,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    onClose: { action: 'closed' },
    onSave: { action: 'saved' },
  },
};

const mockEvent = {
  id: 'e1',
  title: 'vs Metairie FC',
  eventType: 'game',
  date: '2025-03-15',
};

export const NewExpense = {
  args: {
    show: true,
    event: mockEvent,
    existingExpenses: [],
    onClose: () => {},
    onSave: () => {},
  },
};

export const WithExistingExpenses = {
  args: {
    show: true,
    event: mockEvent,
    existingExpenses: [
      { id: 'x1', title: 'Referee Fee', amount: 120, category: 'LEA' },
      { id: 'x2', title: 'Field Rental', amount: 75, category: 'OPE' },
    ],
    onClose: () => {},
    onSave: () => {},
  },
};
