// End-to-end proof that the panel-routing wiring actually holds in a real
// view: the URL alone opens a panel, closing puts the URL back, and the view's
// own params survive the round trip. TeamList stands in for the ~25 views that
// were converted the same way — the mechanism is shared, not per-view.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getTeamsByClub: vi.fn().mockResolvedValue([]),
    getUserRolesByClub: vi.fn().mockResolvedValue([]),
    createTeam: vi.fn().mockResolvedValue({}),
    deleteTeam: vi.fn().mockResolvedValue({}),
    updateTeam: vi.fn().mockResolvedValue({}),
    inviteUser: vi.fn().mockResolvedValue({}),
  },
}));

import { I18nProvider } from '../../i18n/I18nContext';
import TeamList from '../../views/club/TeamList';

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="search">{location.search}</p>;
}

const renderAt = (entry) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <Routes>
          <Route
            path="/club-teams"
            element={
              <>
                <LocationProbe />
                <TeamList
                  club={{ id: 'c1', name: 'NOLA DFC' }}
                  teams={[]}
                  onSelectTeam={vi.fn()}
                  formatMoney={(v) => `$${v}`}
                  showToast={vi.fn()}
                  showConfirm={vi.fn()}
                  refreshContext={vi.fn()}
                />
              </>
            }
          />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );

const createPanel = () => screen.queryByRole('heading', { name: 'Create Team' });

describe('panel routing, end to end', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves the panel shut on a bare URL', async () => {
    renderAt('/club-teams');
    expect(await screen.findByText(/NOLA DFC/i)).toBeInTheDocument();
    expect(createPanel()).not.toBeInTheDocument();
  });

  it('opens the panel named by the URL, with no click needed', async () => {
    renderAt('/club-teams?panel=newTeam');
    expect(await screen.findByRole('heading', { name: 'Create Team' })).toBeInTheDocument();
  });

  it('puts the panel in the URL when it is opened from the page', async () => {
    const user = userEvent.setup();
    renderAt('/club-teams');

    await user.click(await screen.findByRole('button', { name: /add team/i }));

    expect(createPanel()).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('panel=newTeam');
  });

  it('takes the panel back out of the URL when it is closed', async () => {
    const user = userEvent.setup();
    renderAt('/club-teams');

    await user.click(await screen.findByRole('button', { name: /add team/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(createPanel()).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  // The reason panels are query params rather than a path segment: the list
  // route never stops matching, so whatever else the view had in the URL is
  // still there when the panel closes.
  it('keeps the view’s own params through an open and close', async () => {
    const user = userEvent.setup();
    renderAt('/club-teams?admin=1');

    await user.click(await screen.findByRole('button', { name: /add team/i }));
    expect(screen.getByTestId('search')).toHaveTextContent('admin=1');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?admin=1');
  });
});
