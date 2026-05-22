import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { TEAM_ROLES, ALL_ROLES, TEAM_ASSIGNABLE_ROLES } from '../../utils/roles';

const ROLE_COLORS = {
  team_manager: 'bg-blue-100 text-blue-700 dark:text-blue-300',
  team_admin: 'bg-indigo-100 text-indigo-700 dark:text-indigo-300',
  scheduler: 'bg-violet-100 text-violet-700 dark:text-violet-300',
  treasurer: 'bg-emerald-100 text-emerald-700 dark:text-emerald-300',
  head_coach: 'bg-amber-100 text-amber-700 dark:text-amber-300',
  assistant_coach: 'bg-muted text-foreground',
};

export default function TeamUserManagement({ selectedTeam, showToast, showConfirm }) {
  const [guardians, setGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | with-account | no-account | has-role
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

  const withAccount = guardians.filter((g) => g.hasAccount).length;
  const withRoles = guardians.filter((g) => g.roles.length > 0).length;

  if (loading)
    return <div className="p-20 text-center font-bold text-muted-foreground animate-pulse">Loading team users...</div>;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Team Users</h2>
          <p className="text-xs text-muted-foreground font-semibold">
            {selectedTeam?.name} · {guardians.length} guardians · {withAccount} with accounts · {withRoles} with roles
          </p>
        </div>
        <button
          onClick={() => setShowInviteForm(!showInviteForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={14} /> Add User
        </button>
      </div>

      {/* Invite by Email Form */}
      {showInviteForm && (
        <form
          onSubmit={handleInviteByEmail}
          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3"
        >
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Add User by Email</h4>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            If the user has an account, the role will be assigned immediately. Otherwise, an invitation will be created.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="email"
              required
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-700 bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="text"
              placeholder="Name (optional)"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              className="px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-700 bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-700 bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
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
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Adding...' : 'Add User'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInviteForm(false);
                setInviteEmail('');
                setInviteName('');
              }}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm text-center">
          <Users size={16} className="text-blue-700 dark:text-blue-400 mx-auto" />
          <p className="text-xl font-bold text-foreground mt-1">{guardians.length}</p>
          <p className="text-xs font-semibold text-muted-foreground">Guardians</p>
        </div>
        <div
          className={`p-4 rounded-lg border shadow-sm text-center ${withAccount === guardians.length ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700' : 'bg-card border-border'}`}
        >
          <CheckCircle2
            size={16}
            className={
              withAccount === guardians.length
                ? 'text-emerald-700 dark:text-emerald-400 mx-auto'
                : 'text-muted-foreground mx-auto'
            }
          />
          <p className="text-xl font-bold mt-1">{withAccount}</p>
          <p className="text-xs font-semibold text-muted-foreground">Have Accounts</p>
        </div>
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm text-center">
          <Shield size={16} className="text-violet-700 dark:text-violet-400 mx-auto" />
          <p className="text-xl font-bold text-foreground mt-1">{withRoles}</p>
          <p className="text-xs font-semibold text-muted-foreground">Have Roles</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5 shrink-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'with-account', label: 'Has Account' },
            { id: 'no-account', label: 'No Account' },
            { id: 'has-role', label: 'Has Role' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${filterStatus === f.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Guardian List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-card rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground font-semibold text-sm">
            {searchTerm || filterStatus !== 'all'
              ? 'No guardians match your filters.'
              : 'No guardians found for this team.'}
          </div>
        ) : (
          filtered.map((g) => {
            const isExpanded = assigningFor === g.email;

            return (
              <div
                key={g.email}
                className={`bg-card rounded-lg border shadow-sm overflow-hidden ${g.hasAccount ? 'border-border' : 'border-border opacity-75'}`}
              >
                <div className="flex items-center gap-3 p-4">
                  {/* Avatar */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${g.hasAccount ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-muted text-muted-foreground'}`}
                  >
                    {g.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                      {g.hasAccount ? (
                        <span className="text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded uppercase">
                          Account
                        </span>
                      ) : (
                        <span className="text-xs font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded uppercase">
                          No Account
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium truncate">{g.email}</p>
                    {/* Player connections */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {g.players.map((p) => (
                        <span
                          key={p.id}
                          className="text-xs font-semibold bg-background border border-border px-1.5 py-0.5 rounded text-muted-foreground"
                        >
                          #{p.jersey || '?'} {p.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Roles + assign button */}
                  <div className="flex items-center gap-2 shrink-0">
                    {g.roles.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {g.roles.map((r) => (
                          <div key={r.id} className="inline-flex items-center gap-1 group">
                            <span
                              className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${ROLE_COLORS[r.role] || 'bg-muted text-foreground'}`}
                            >
                              {ALL_ROLES[r.role]?.label || r.role}
                            </span>
                            <button
                              onClick={() => handleRevokeRole(g, r.id, r.role)}
                              className="text-muted-foreground hover:text-red-700 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {g.hasAccount && (
                      <button
                        onClick={() => setAssigningFor(isExpanded ? null : g.email)}
                        className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`}
                        title="Assign role"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <UserPlus size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Assign role form — only TEAM_ASSIGNABLE_ROLES (team_admin, treasurer, scheduler) */}
                {isExpanded && (
                  <div className="border-t border-border p-4 bg-blue-50/50 dark:bg-blue-900/20 flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground shrink-0">Assign:</span>
                    <select
                      value={assignRole}
                      onChange={(e) => setAssignRole(e.target.value)}
                      className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs font-semibold outline-none flex-grow"
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
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => setAssigningFor(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Help text */}
      <div className="bg-background p-4 rounded-lg text-xs text-muted-foreground leading-relaxed">
        <p className="font-semibold text-muted-foreground mb-1">How this works:</p>
        <p>
          This list shows all guardians linked to players on your roster. Guardians with a{' '}
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">green "Account" badge</span> have
          signed up and can be assigned team roles.
        </p>
        <p className="mt-2 font-semibold text-muted-foreground">Available roles:</p>
        <p className="mt-1">
          <span className="font-semibold text-indigo-700 dark:text-indigo-400">Team Admin</span> — Full access to all
          team functions (roster, budget, ledger, schedule, sponsors, insights).
        </p>
        <p>
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">Treasurer</span> — Can manage budget,
          ledger, transactions, sponsors, and fee waivers.
        </p>
        <p>
          <span className="font-semibold text-violet-700 dark:text-violet-400">Scheduler</span> — Can create and manage
          blackout dates on the calendar.
        </p>
        <p className="mt-2">
          Coaches and Team Managers are assigned by a Club Admin from the Club → Teams or Club → Users tab.
        </p>
      </div>
    </div>
  );
}
