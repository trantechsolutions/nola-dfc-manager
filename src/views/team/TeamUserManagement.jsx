import React, { useState, useEffect, useMemo } from 'react';
import { UserPlus, X, ChevronUp, Info } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { TEAM_ROLES, ALL_ROLES, TEAM_ASSIGNABLE_ROLES } from '../../utils/roles';
import AdminCard from '../../components/layout/AdminCard';
import Badge from '../../components/layout/Badge';
import DirectoryCard, { DetailRow, EmptyRow } from '../../components/layout/DirectoryCard';
import { DirectoryToolbar, SearchInput, FilterSelect, ToolbarButton } from '../../components/layout/DirectoryControls';
import { paginate } from '../../utils/pagination';

// Role → Bootstrap badge tone, ordered the way AdminLTE's user directory does
// it: the most privileged role takes `danger`, descending from there.
const ROLE_TONES = {
  team_manager: 'danger',
  head_coach: 'primary',
  assistant_coach: 'secondary',
  treasurer: 'success',
  scheduler: 'info',
  fundraiser: 'warning',
};

const PER_PAGE = 10;

const FILTERS = [
  { value: 'all', label: 'All users' },
  { value: 'with-account', label: 'Has account' },
  { value: 'no-account', label: 'No account' },
  { value: 'has-role', label: 'Has role' },
];

const COLUMNS = [
  { key: 'user', label: 'User' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'players', label: 'Players' },
  { key: 'actions', label: 'Actions', align: 'right' },
];

export default function TeamUserManagement({ selectedTeam, showToast, showConfirm }) {
  const [guardians, setGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | with-account | no-account | has-role
  const [page, setPage] = useState(1);
  const [assigningFor, setAssigningFor] = useState(null); // guardian email
  const [assignRole, setAssignRole] = useState(TEAM_ASSIGNABLE_ROLES[0]); // default to first assignable
  const [isSaving, setIsSaving] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('head_coach');

  const fetchGuardians = async () => {
    if (!selectedTeam?.id) return;
    setLoading(true);
    try {
      const data = await supabaseService.getTeamGuardiansWithStatus(selectedTeam.id);
      setGuardians(data);
    } catch (e) {
      console.error('Failed to fetch guardians:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuardians();
  }, [selectedTeam?.id]);

  const handleAssignRole = async (guardian) => {
    if (!guardian.userId) {
      showToast(`${guardian.name} doesn't have an account yet. They need to sign up first.`, true);
      return;
    }
    setIsSaving(true);
    try {
      await supabaseService.assignRole(guardian.userId, assignRole, { teamId: selectedTeam.id });
      showToast(`${ALL_ROLES[assignRole]?.label} role assigned to ${guardian.name}`);
      setAssigningFor(null);
      fetchGuardians();
    } catch (e) {
      showToast(e.message || 'Failed to assign role.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeRole = async (guardian, roleId, roleName) => {
    const ok = await showConfirm(`Remove ${ALL_ROLES[roleName]?.label || roleName} role from ${guardian.name}?`);
    if (!ok) return;
    try {
      await supabaseService.revokeRole(roleId);
      showToast('Role removed.');
      fetchGuardians();
    } catch (e) {
      showToast('Failed to remove role.', true);
    }
  };

  const handleInviteByEmail = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsSaving(true);
    try {
      // Try to assign role directly if user already exists
      await supabaseService.assignRoleByEmail(inviteEmail.trim(), inviteRole, { teamId: selectedTeam.id });
      showToast(`${ALL_ROLES[inviteRole]?.label || inviteRole} role assigned to ${inviteEmail}`);
      setShowInviteForm(false);
      setInviteEmail('');
      setInviteName('');
      fetchGuardians();
    } catch {
      // User doesn't exist yet — create an invitation
      try {
        await supabaseService.createInvitation({
          email: inviteEmail.trim(),
          role: inviteRole,
          teamId: selectedTeam.id,
          clubId: selectedTeam.clubId,
          name: inviteName.trim() || null,
        });
        showToast(`Invitation sent to ${inviteEmail}`);
        setShowInviteForm(false);
        setInviteEmail('');
        setInviteName('');
      } catch (err) {
        showToast(`Failed: ${err.message}`, true);
      }
    }
    setIsSaving(false);
  };

  const filtered = useMemo(() => {
    let result = guardians;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter((g) => g.name.toLowerCase().includes(q) || g.email.includes(q));
    }
    if (filterStatus === 'with-account') result = result.filter((g) => g.hasAccount);
    if (filterStatus === 'no-account') result = result.filter((g) => !g.hasAccount);
    if (filterStatus === 'has-role') result = result.filter((g) => g.roles.length > 0);
    return result;
  }, [guardians, searchTerm, filterStatus]);

  // paginate() clamps, so a filter that shrinks the list below the current
  // page still renders rows rather than an empty table.
  const { slice, page: currentPage, pageCount, total, from, to } = paginate(filtered, page, PER_PAGE);

  const withAccount = guardians.filter((g) => g.hasAccount).length;
  const withRoles = guardians.filter((g) => g.roles.length > 0).length;

  const resetToFirstPage = (fn) => (value) => {
    fn(value);
    setPage(1);
  };

  if (loading)
    return <div className="p-20 text-center font-bold text-muted-foreground animate-pulse">Loading team users...</div>;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground font-semibold">
        {selectedTeam?.name} · {guardians.length} guardians · {withAccount} with accounts · {withRoles} with roles
      </p>

      <DirectoryCard
        title="User Directory"
        columns={COLUMNS}
        noun="user"
        page={currentPage}
        pageCount={pageCount}
        total={total}
        from={from}
        to={to}
        onPageChange={setPage}
        toolbar={
          <DirectoryToolbar>
            <SearchInput
              value={searchTerm}
              onChange={resetToFirstPage(setSearchTerm)}
              placeholder="Search users…"
              label="Search users"
            />
            <FilterSelect
              value={filterStatus}
              onChange={resetToFirstPage(setFilterStatus)}
              options={FILTERS}
              label="Filter users"
            />
            <ToolbarButton icon={UserPlus} tone="primary" onClick={() => setShowInviteForm((v) => !v)}>
              Add user
            </ToolbarButton>
          </DirectoryToolbar>
        }
        prepend={
          /* Add-user form. AdminLTE puts this in a modal; kept inline here so
             it reuses the existing invite flow untouched. */
          showInviteForm && (
            <form onSubmit={handleInviteByEmail} className="space-y-3 border-b border-border bg-foreground/[0.03] p-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Add new user</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  If the user has an account the role is assigned immediately. Otherwise an invitation is created and
                  the invite is sent to this address.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text"
                  placeholder="Full name (optional)"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {Object.entries(TEAM_ROLES).map(([key, role]) => (
                    <option key={key} value={key}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSaving || !inviteEmail.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:opacity-50"
                >
                  {isSaving ? 'Adding…' : 'Create user'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteEmail('');
                    setInviteName('');
                  }}
                  className="rounded-md bg-secondary px-4 py-2 text-xs font-semibold text-secondary-foreground transition-colors hover:brightness-95"
                >
                  Cancel
                </button>
              </div>
            </form>
          )
        }
      >
        {slice.length === 0 ? (
          <EmptyRow colSpan={COLUMNS.length}>
            {searchTerm || filterStatus !== 'all'
              ? 'No guardians match your filters.'
              : 'No guardians found for this team.'}
          </EmptyRow>
        ) : (
          slice.map((g) => {
            const isExpanded = assigningFor === g.email;
            return (
              <React.Fragment key={g.email}>
                <tr className="border-b border-border align-middle transition-colors hover:bg-foreground/[0.03]">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                          g.hasAccount ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {g.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 font-semibold text-foreground">{g.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{g.email}</td>
                  <td className="px-4 py-2.5">
                    {g.roles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {g.roles.map((r) => (
                          <Badge key={r.id} tone={ROLE_TONES[r.role] || 'secondary'} className="group">
                            {ALL_ROLES[r.role]?.label || r.role}
                            <button
                              onClick={() => handleRevokeRole(g, r.id, r.role)}
                              aria-label={`Remove ${ALL_ROLES[r.role]?.label || r.role} role from ${g.name}`}
                              className="opacity-60 transition-opacity hover:opacity-100"
                            >
                              <X size={10} />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {g.hasAccount ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Pending</Badge>}
                  </td>
                  <td className="px-4 py-2.5">
                    {g.players.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {g.players.map((p) => (
                          <span
                            key={p.id}
                            className="rounded border border-border px-1.5 py-0.5 text-xs font-semibold text-muted-foreground"
                          >
                            #{p.jersey || '?'} {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {g.hasAccount ? (
                      <button
                        onClick={() => setAssigningFor(isExpanded ? null : g.email)}
                        title="Assign role"
                        aria-label={`Assign role to ${g.name}`}
                        aria-expanded={isExpanded}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {isExpanded ? <ChevronUp size={13} /> : <UserPlus size={13} />}
                        Role
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Awaiting sign-up</span>
                    )}
                  </td>
                </tr>

                {isExpanded && (
                  <DetailRow colSpan={COLUMNS.length}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Assign role:</span>
                      <select
                        value={assignRole}
                        onChange={(e) => setAssignRole(e.target.value)}
                        aria-label={`Role to assign to ${g.name}`}
                        className="rounded-md border border-input bg-card px-2 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"
                      >
                        {TEAM_ASSIGNABLE_ROLES.map((key) => (
                          <option key={key} value={key}>
                            {TEAM_ROLES[key]?.label || ALL_ROLES[key]?.label || key}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignRole(g)}
                        disabled={isSaving}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:opacity-50"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => setAssigningFor(null)}
                        aria-label="Cancel role assignment"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </DetailRow>
                )}
              </React.Fragment>
            );
          })
        )}
      </DirectoryCard>

      {/* Reference documentation — collapsed by default so it stays available
          without competing with the directory for the fold. */}
      <AdminCard title="How this works" icon={Info} collapsible defaultCollapsed>
        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            This list shows all guardians linked to players on your roster. Guardians showing{' '}
            <Badge tone="success">Active</Badge> have signed up and can be assigned team roles;{' '}
            <Badge tone="warning">Pending</Badge> means they have not created an account yet.
          </p>
          <p className="pt-1 font-semibold text-foreground">Available roles</p>
          <p>
            <Badge tone="success">Treasurer</Badge> — manage budget, ledger, transactions, sponsors and fee waivers.
          </p>
          <p>
            <Badge tone="info">Scheduler</Badge> — create and manage blackout dates on the calendar.
          </p>
          <p>
            <Badge tone="warning">Fundraiser</Badge> — view and manage sponsors and fundraising distributions. Cannot
            edit the ledger or budget.
          </p>
          <p className="pt-1">
            Coaches and Team Managers are assigned by a Club Admin from the Club → Teams or Club → Users tab.
          </p>
        </div>
      </AdminCard>
    </div>
  );
}
