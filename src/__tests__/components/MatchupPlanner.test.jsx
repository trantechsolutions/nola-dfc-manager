// The planner is a card per club now: the contact that used to live in its own
// panel sits on the card, and games are scheduled from the card they belong to.
// These tests pin that wiring, and that the cost/ledger affordances survived the
// move.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n/I18nContext';
import MatchupPlanner from '../../components/MatchupPlanner';

const CONTACTS = [
  { id: 'c1', clubName: 'Bayou FC', contactName: 'Sam Reed', phone: '504-555-0100', email: 'sam@bayou.test' },
  { id: 'c2', clubName: 'Gulf United', contactName: '', phone: '', email: '' },
];

const MATCHUPS = [
  {
    id: 'm1',
    opponentName: 'Bayou FC',
    status: 'open',
    isHome: true,
    matchDate: '2026-03-14',
    matchTime: null,
    weekLabel: 'Fall Week 3',
    location: 'Pan Am',
    field: '4',
    notes: '',
  },
  {
    id: 'm2',
    opponentName: '',
    status: 'open',
    isHome: false,
    matchDate: null,
    matchTime: null,
    weekLabel: null,
    location: '',
    field: '',
    notes: '',
  },
];

const handlers = () => ({
  onCreate: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onSetStatus: vi.fn(),
  onConfirm: vi.fn(),
  onReschedule: vi.fn(),
  onCreateContact: vi.fn(),
  onUpdateContact: vi.fn(),
  onDeleteContact: vi.fn(),
});

function renderPlanner(props = {}) {
  const h = handlers();
  const utils = render(
    <I18nProvider>
      <MatchupPlanner canEdit contacts={CONTACTS} matchups={MATCHUPS} {...h} {...props} />
    </I18nProvider>,
  );
  return { ...utils, ...h };
}

/** The card whose club-name input holds this name. */
const cardFor = (clubName) => screen.getByDisplayValue(clubName).closest('div.bg-card');

describe('MatchupPlanner team cards', () => {
  beforeEach(async () => {
    localStorage.clear();
    const i18n = (await import('../../i18n/config')).default;
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('draws a card per club with that club’s contact details on it', () => {
    renderPlanner();
    const bayou = cardFor('Bayou FC');
    expect(within(bayou).getByDisplayValue('Sam Reed')).toBeInTheDocument();
    expect(within(bayou).getByDisplayValue('504-555-0100')).toBeInTheDocument();
    expect(within(bayou).getByDisplayValue('sam@bayou.test')).toBeInTheDocument();
    // A club with no games yet still gets its card.
    expect(cardFor('Gulf United')).toBeTruthy();
  });

  it('keeps a club’s games on its own card', () => {
    renderPlanner();
    expect(within(cardFor('Bayou FC')).getByDisplayValue('Pan Am')).toBeInTheDocument();
    expect(
      within(cardFor('Gulf United')).getByText('No games against this team yet. Schedule one to start.'),
    ).toBeInTheDocument();
  });

  it('schedules a game already pointed at the card’s club', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderPlanner();
    await user.click(within(cardFor('Gulf United')).getByRole('button', { name: /Schedule Game/i }));
    expect(onCreate).toHaveBeenCalledWith({ opponentName: 'Gulf United' });
  });

  it('renames the contact and its games together', async () => {
    const user = userEvent.setup();
    const { onUpdateContact, onUpdate } = renderPlanner();
    const nameInput = screen.getByDisplayValue('Bayou FC');
    await user.clear(nameInput);
    await user.type(nameInput, 'Bayou SC');
    await user.tab();
    expect(onUpdateContact).toHaveBeenCalledWith('c1', { clubName: 'Bayou SC' });
    expect(onUpdate).toHaveBeenCalledWith('m1', { opponentName: 'Bayou SC' });
  });

  it('adds a club to the directory from the header input', async () => {
    const user = userEvent.setup();
    const { onCreateContact } = renderPlanner();
    await user.type(screen.getByPlaceholderText('New club or team name...'), 'Delta SC');
    await user.click(screen.getByRole('button', { name: /Add Team/i }));
    expect(onCreateContact).toHaveBeenCalledWith({ clubName: 'Delta SC' });
  });

  it('offers to save an opponent that only exists on a game', () => {
    renderPlanner({ contacts: [], matchups: [MATCHUPS[0]] });
    expect(within(cardFor('Bayou FC')).getByRole('button', { name: /Save Contact/i })).toBeInTheDocument();
  });

  it('gives games with no opponent their own card, with a field to assign one', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderPlanner();
    const unassigned = screen.getByText('No opponent yet').closest('div.bg-card');
    const opponentField = within(unassigned).getByLabelText('Opponent...');
    await user.type(opponentField, 'Delta SC');
    await user.tab();
    expect(onUpdate).toHaveBeenCalledWith('m2', { opponentName: 'Delta SC' });
  });

  it('keeps the expected-cost editor and the ledger bulk bar', async () => {
    const user = userEvent.setup();
    renderPlanner({
      plannedCosts: [{ id: 'p1', matchupId: 'm1', category: 'OPE', label: 'Refs', amount: 120 }],
      plannedSummary: null,
      onFileAllCostsToLedger: vi.fn(),
      ledgerReadyCount: 1,
    });
    expect(screen.getByRole('button', { name: /File 1 in Ledger/i })).toBeInTheDocument();

    const costToggle = within(cardFor('Bayou FC')).getByRole('button', { name: '$120.00' });
    await user.click(costToggle);
    expect(screen.getByDisplayValue('Refs')).toBeInTheDocument();
  });
});
