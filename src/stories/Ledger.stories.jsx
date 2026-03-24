import Ledger from '../components/Ledger';

const formatMoney = (v) => `$${Number(v).toFixed(2)}`;

const mockTransactions = [
  {
    id: 't1',
    title: 'March Dues - Marcus Johnson',
    amount: 150,
    date: '2025-03-01',
    category: 'TMF',
    type: 'Venmo',
    cleared: true,
    playerId: 'p1',
  },
  {
    id: 't2',
    title: 'Spring Tournament Entry',
    amount: 500,
    date: '2025-03-05',
    category: 'TOU',
    type: 'Check',
    cleared: true,
  },
  {
    id: 't3',
    title: 'Car Wash Fundraiser',
    amount: 320,
    date: '2025-03-10',
    category: 'FUN',
    type: 'Cash',
    cleared: false,
  },
  {
    id: 't4',
    title: 'Referee Fee - League Game',
    amount: -120,
    date: '2025-03-12',
    category: 'LEA',
    type: 'Zelle',
    cleared: true,
  },
  {
    id: 't5',
    title: 'Jersey Sponsor - ABC Corp',
    amount: 1000,
    date: '2025-03-15',
    category: 'SPO',
    type: 'ACH',
    cleared: false,
  },
  {
    id: 't6',
    title: 'Sofia Martinez - April Dues',
    amount: 150,
    date: '2025-04-01',
    category: 'TMF',
    type: 'Zeffy',
    cleared: false,
    playerId: 'p2',
  },
  {
    id: 't7',
    title: 'Transfer to Travel Fund',
    amount: -200,
    date: '2025-04-05',
    category: 'TRF',
    type: 'ACH',
    cleared: true,
    transferFrom: 'Operating',
    transferTo: 'Travel',
  },
];

export default {
  title: 'Components/Ledger',
  component: Ledger,
  argTypes: {
    onEditTx: { action: 'edit' },
    onDeleteTx: { action: 'delete' },
  },
};

export const WithTransactions = {
  args: {
    transactions: mockTransactions,
    onEditTx: () => {},
    onDeleteTx: () => {},
    formatMoney,
  },
};

export const Empty = {
  args: {
    transactions: [],
    onEditTx: () => {},
    onDeleteTx: () => {},
    formatMoney,
  },
};

export const SingleCategory = {
  args: {
    transactions: mockTransactions.filter((t) => t.category === 'TMF'),
    onEditTx: () => {},
    onDeleteTx: () => {},
    formatMoney,
  },
};
