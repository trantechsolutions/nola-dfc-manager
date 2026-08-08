// A guardian can have more than one player rostered, and each carries its own
// set of responses. This view renders a card per player rather than a picker,
// so the assertions below pin the count and the name headings.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const cardProps = [];

vi.mock('../../components/PlayerChecklistCard', () => ({
  default: (props) => {
    cardProps.push(props);
    return <div data-testid="checklist-card">card for {props.player.id}</div>;
  },
}));

import { I18nProvider } from '../../i18n/I18nContext';
import ParentChecklistView from '../../views/team/ParentChecklistView';

const player = (id, first, last, teamId = 't1') => ({
  id,
  firstName: first,
  lastName: last,
  teamId,
});

function renderView(players) {
  cardProps.length = 0;
  return render(
    <I18nProvider>
      <ParentChecklistView
        players={players}
        selectedSeason="2025-26"
        clubId="c1"
        user={{ id: 'u1' }}
        showToast={vi.fn()}
        isReadOnly={false}
      />
    </I18nProvider>,
  );
}

describe('ParentChecklistView', () => {
  it('renders one card per player', () => {
    renderView([player('p1', 'Ada', 'Lovelace'), player('p2', 'Grace', 'Hopper')]);
    expect(screen.getAllByTestId('checklist-card')).toHaveLength(2);
  });

  it('labels each card when a guardian has more than one player', () => {
    renderView([player('p1', 'Ada', 'Lovelace'), player('p2', 'Grace', 'Hopper')]);
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grace Hopper' })).toBeInTheDocument();
  });

  it('omits the redundant name heading for a single player', () => {
    renderView([player('p1', 'Ada', 'Lovelace')]);
    expect(screen.getAllByTestId('checklist-card')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
  });

  it("scopes each card to its own player's team", () => {
    // Siblings can sit on different teams, and each team has its own checklist —
    // passing the view's team instead of the player's would cross the streams.
    renderView([player('p1', 'Ada', 'Lovelace', 't1'), player('p2', 'Grace', 'Hopper', 't2')]);
    expect(cardProps.map((p) => p.teamId)).toEqual(['t1', 't2']);
    expect(cardProps.every((p) => p.seasonId === '2025-26')).toBe(true);
  });

  it('explains itself when the guardian has no rostered players', () => {
    renderView([]);
    expect(screen.queryByTestId('checklist-card')).not.toBeInTheDocument();
    expect(screen.getByText('No Players Found')).toBeInTheDocument();
  });
});
