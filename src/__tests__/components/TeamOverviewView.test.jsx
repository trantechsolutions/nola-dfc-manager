// A smoke test, because the bug this guards against shipped past both the build
// and the whole suite: `<ListChecks>` was used in the roster card without being
// imported. eslint here has no react plugin, so `react/jsx-no-undef` never runs
// and an unbound JSX component is invisible until the component actually renders.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { I18nProvider } from '../../i18n/I18nContext';
import TeamOverviewView from '../../views/team/TeamOverviewView';
import { buildCompliance } from '../../utils/compliance';

const SEASON = '2025-26';

const player = (id, first, last, profile = {}) => ({
  id,
  firstName: first,
  lastName: last,
  status: 'active',
  jerseyNumber: '7',
  seasonProfiles: { [SEASON]: profile },
});

const item = (key, label, overrides = {}) => ({
  key,
  label,
  description: '',
  type: 'check',
  url: '',
  audience: 'parent',
  required: true,
  requiresVerification: false,
  dueDate: null,
  linkedForm: null,
  ...overrides,
});

function renderOverview({ players = [], items = [], responses = [] } = {}) {
  const compliance = buildCompliance({ items, responses, players, seasonId: SEASON });
  return render(
    <MemoryRouter>
      <I18nProvider>
        <TeamOverviewView
          players={players}
          archivedPlayers={[]}
          teamBalance={0}
          totalExpenses={0}
          formatMoney={(n) => `$${Number(n || 0).toFixed(2)}`}
          onAddPlayer={vi.fn()}
          onEditPlayer={vi.fn()}
          onViewPlayer={vi.fn()}
          selectedSeasonData={{ id: SEASON, calculatedBaseFee: 0 }}
          transactions={[]}
          calculatePlayerFinancials={() => ({ baseFee: 0, remainingBalance: 0 })}
          selectedSeason={SEASON}
          canViewFinancials
          accountMap={{}}
          compliance={compliance}
        />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('TeamOverviewView', () => {
  it('renders the roster tab without throwing on an unbound icon', async () => {
    // The player cards live behind the Roster tab, and that is exactly where the
    // unbound <ListChecks> was — the overview tab alone would not have caught it.
    const user = userEvent.setup();
    renderOverview({
      players: [player('p1', 'Ada', 'Lovelace'), player('p2', 'Grace', 'Hopper')],
      items: [item('uniform', 'Order uniform')],
      responses: [{ playerId: 'p1', itemKey: 'uniform', completed: true }],
    });

    await user.click(screen.getAllByRole('button', { name: /roster/i })[0]);

    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/Grace/)).toBeInTheDocument();
  });

  it('renders with an empty roster', () => {
    expect(() => renderOverview()).not.toThrow();
  });

  it('renders a season with no checklist at all', () => {
    // The compliance index is empty here, so every per-player lookup misses —
    // the accessors must tolerate that rather than blow up mid-render.
    expect(() => renderOverview({ players: [player('p1', 'Ada', 'Lovelace')] })).not.toThrow();
  });

  it('labels the compliance breakdown with the checklist item, not a fixed flag', () => {
    renderOverview({
      players: [player('p1', 'Ada', 'Lovelace')],
      items: [item('uniform', 'Order uniform'), item('fees', 'Pay fees')],
    });
    expect(screen.getByText('Order uniform')).toBeInTheDocument();
    expect(screen.getByText('Pay fees')).toBeInTheDocument();
    expect(screen.queryByText(/ReePlayer/i)).not.toBeInTheDocument();
  });
});
