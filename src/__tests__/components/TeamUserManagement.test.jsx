// Covers the AdminLTE users.html treatment: one card holding a table, with a
// search + filter + add control set in the header and a "Showing X to Y of Z"
// range plus pagination in the footer. The behaviour underneath (role assign /
// revoke, invite) is unchanged, so these tests target the parts the layout
// rewrite actually introduced — table rows, filtering, and paging.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getTeamGuardiansWithStatus = vi.fn();
vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getTeamGuardiansWithStatus: (...args) => getTeamGuardiansWithStatus(...args),
    assignRole: vi.fn().mockResolvedValue({}),
    revokeRole: vi.fn().mockResolvedValue({}),
    assignRoleByEmail: vi.fn().mockResolvedValue({}),
    createInvitation: vi.fn().mockResolvedValue({}),
  },
}));

import TeamUserManagement from '../../views/team/TeamUserManagement';

const team = { id: 't1', name: 'U12 Boys', clubId: 'c1' };

const guardian = (i, overrides = {}) => ({
  name: `Guardian ${String(i).padStart(2, '0')}`,
  email: `g${i}@example.com`,
  hasAccount: true,
  userId: `u${i}`,
  roles: [],
  players: [],
  ...overrides,
});

function renderView() {
  return render(<TeamUserManagement selectedTeam={team} showToast={vi.fn()} showConfirm={vi.fn()} />);
}

const table = () => screen.getByRole('table');
const rows = () => within(table()).getAllByRole('row').slice(1); // drop the header row

describe('TeamUserManagement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders each guardian as a table row with email, role and status', async () => {
    getTeamGuardiansWithStatus.mockResolvedValue([
      guardian(1, { roles: [{ id: 'r1', role: 'treasurer' }], players: [{ id: 'p1', name: 'Ana', jersey: 7 }] }),
      guardian(2, { hasAccount: false, userId: null }),
    ]);
    renderView();

    expect(await screen.findByText('User Directory')).toBeInTheDocument();
    expect(rows()).toHaveLength(2);

    const first = rows()[0];
    expect(within(first).getByText('g1@example.com')).toBeInTheDocument();
    expect(within(first).getByText('Treasurer')).toBeInTheDocument();
    expect(within(first).getByText('Active')).toBeInTheDocument();
    expect(within(first).getByText('#7 Ana')).toBeInTheDocument();

    // A guardian with no account is Pending and cannot be given a role yet.
    const second = rows()[1];
    expect(within(second).getByText('Pending')).toBeInTheDocument();
    expect(within(second).getByText('Awaiting sign-up')).toBeInTheDocument();
  });

  it('pages at 10 rows and reports the range in the card footer', async () => {
    getTeamGuardiansWithStatus.mockResolvedValue(Array.from({ length: 23 }, (_, i) => guardian(i + 1)));
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText('Showing 1 to 10 of 23 users')).toBeInTheDocument();
    expect(rows()).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(screen.getByText('Showing 21 to 23 of 23 users')).toBeInTheDocument();
    expect(rows()).toHaveLength(3);
  });

  it('filters by search and resets to the first page', async () => {
    getTeamGuardiansWithStatus.mockResolvedValue(Array.from({ length: 23 }, (_, i) => guardian(i + 1)));
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: 'Page 3' }));
    expect(screen.getByText('Showing 21 to 23 of 23 users')).toBeInTheDocument();

    // Searching from page 3 must not strand the user on an empty page.
    await user.type(screen.getByRole('searchbox', { name: /search users/i }), 'g11@');
    expect(screen.getByText('Showing 1 to 1 of 1 user')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it('filters by account status', async () => {
    getTeamGuardiansWithStatus.mockResolvedValue([
      guardian(1),
      guardian(2, { hasAccount: false, userId: null }),
      guardian(3, { hasAccount: false, userId: null }),
    ]);
    const user = userEvent.setup();
    renderView();

    await screen.findByText('User Directory');
    await user.selectOptions(screen.getByRole('combobox', { name: /filter users/i }), 'no-account');

    expect(rows()).toHaveLength(2);
    expect(screen.getByText('Showing 1 to 2 of 2 users')).toBeInTheDocument();
  });

  it('says so plainly when a filter matches nothing', async () => {
    getTeamGuardiansWithStatus.mockResolvedValue([guardian(1)]);
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByRole('searchbox', { name: /search users/i }), 'nobody');
    expect(screen.getByText('No guardians match your filters.')).toBeInTheDocument();
    expect(screen.getByText('Showing 0 to 0 of 0 users')).toBeInTheDocument();
  });

  it('opens the add-user form from the header button', async () => {
    getTeamGuardiansWithStatus.mockResolvedValue([guardian(1)]);
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: /add user/i }));
    expect(screen.getByText('Add new user')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
  });
});
