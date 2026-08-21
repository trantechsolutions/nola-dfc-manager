import React, { useState, useEffect } from 'react';
import { Plus, Settings, Trash2, Edit, UserPlus, X, Save } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { ALL_ROLES, TEAM_ROLES, CLUB_ASSIGNABLE_ROLES } from '../../utils/roles';
import { useT } from '../../i18n/I18nContext';
import Badge from '../../components/layout/Badge';
import ResponsiveModal from '../../components/layout/ResponsiveModal';
import PanelHost from '../../components/layout/PanelHost';
import { usePanelRoute } from '../../hooks/usePanelRoute';
import DirectoryCard, { DetailRow, EmptyRow } from '../../components/layout/DirectoryCard';
import { DirectoryToolbar, SearchInput, ToolbarButton, RowAction } from '../../components/layout/DirectoryControls';
import { paginate } from '../../utils/pagination';
import { PANELS } from '../../utils/panelRoute';

const PER_PAGE = 25;

const COLUMNS = [
  { key: 'team', label: 'Team' },
  { key: 'age', label: 'Age group', className: 'hidden md:table-cell' },
  { key: 'gender', label: 'Gender', className: 'hidden md:table-cell' },
  { key: 'tier', label: 'Tier' },
  { key: 'actions', label: 'Actions', align: 'right' },
];

export default function TeamList({ club, teams, onSelectTeam, formatMoney, showToast, showConfirm, refreshContext }) {
  const { t } = useT();
  // The create panel is addressed by the URL. The per-row invite below is an
  // inline disclosure rather than a panel, so it stays in local state.
  const { panel, openPanel, closePanel } = usePanelRoute();
  const showCreateForm = panel === PANELS.NEW_TEAM;
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [teamRoles, setTeamRoles] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // New team form
  const [newTeam, setNewTeam] = useState({
    name: '',
    ageGroup: '',
    gender: 'M',
    tier: 'competitive',
    icalUrl: '',
    colorPrimary: '#1e293b',
  });

  // Inline team editing
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingTier, setEditingTier] = useState('competitive');

  // Invite form
  const [showInvite, setShowInvite] = useState(null); // teamId or null
  const [inviteRole, setInviteRole] = useState('team_manager');
  const [inviteEmail, setInviteEmail] = useState('');

  // Fetch roles for expanded team
  useEffect(() => {
    if (expandedTeam && !teamRoles[expandedTeam]) {
      supabaseService
        .getTeamRoles(expandedTeam)
        .then((roles) => {
          setTeamRoles((prev) => ({ ...prev, [expandedTeam]: roles }));
        })
        .catch(console.error);
    }
  }, [expandedTeam]);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeam.name.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.createTeam({ ...newTeam, clubId: club.id });
      closePanel();
      setNewTeam({ name: '', ageGroup: '', gender: 'M', tier: 'competitive', icalUrl: '', colorPrimary: '#1e293b' });
      await refreshContext();
      if (showToast) showToast(t('clubTeams.teamCreated', { name: newTeam.name }));
    } catch (e) {
      if (showToast) showToast(t('clubTeams.createFailed'), true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTeam = async (team) => {
    const ok = await showConfirm(
      `Permanently delete "${team.name}" and all its players, transactions, budget, and events? This cannot be undone.`,
    );
    if (!ok) return;
    setIsSaving(true);
    try {
      await supabaseService.deleteTeam(team.id);
      await refreshContext();
      if (showToast) showToast(`Team "${team.name}" deleted`);
    } catch (e) {
      if (showToast) showToast(`Delete failed: ${e.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTeam = async (teamId) => {
    if (!editingName.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.updateTeam(teamId, { name: editingName.trim(), tier: editingTier });
      await refreshContext();
      setEditingTeamId(null);
      setEditingName('');
      setEditingTier('competitive');
      if (showToast) showToast(t('clubTeams.nameUpdated'));
    } catch (e) {
      if (showToast) showToast(t('clubTeams.nameUpdateFailed'), true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignRole = async (teamId) => {
    if (!inviteEmail.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.assignRoleByEmail(inviteEmail.trim(), inviteRole, { teamId });
      setShowInvite(null);
      setInviteEmail('');
      setTeamRoles((prev) => ({ ...prev, [teamId]: null })); // force refetch
      setExpandedTeam(null);
      setTimeout(() => setExpandedTeam(teamId), 50);
      if (showToast) showToast(t('clubTeams.roleAssigned'));
    } catch (e) {
      if (showToast) showToast(e.message || t('clubTeams.assignFailed'), true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeRole = async (roleId, teamId) => {
    const ok = await showConfirm(t('clubTeams.removeRoleConfirm'));
    if (!ok) return;
    try {
      await supabaseService.revokeRole(roleId);
      setTeamRoles((prev) => ({ ...prev, [teamId]: prev[teamId]?.filter((r) => r.id !== roleId) }));
      if (showToast) showToast(t('clubTeams.roleRemoved'));
    } catch (e) {
      if (showToast) showToast(t('clubTeams.createFailed'), true);
    }
  };

  const COLORS = ['#1e293b', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#d97706', '#0891b2', '#be185d'];

  const filteredTeams = search.trim()
    ? teams.filter((tm) => `${tm.name} ${tm.ageGroup} ${tm.tier}`.toLowerCase().includes(search.trim().toLowerCase()))
    : teams;

  const { slice, page: currentPage, pageCount, total, from, to } = paginate(filteredTeams, page, PER_PAGE);

  return (
    <div className="space-y-5">
      <p className="text-xs font-semibold text-muted-foreground">
        {club?.name} · {teams.length} team{teams.length !== 1 && 's'}
      </p>

      <DirectoryCard
        title={t('clubTeams.title', 'Team Directory')}
        columns={COLUMNS}
        noun="team"
        page={currentPage}
        pageCount={pageCount}
        total={total}
        from={from}
        to={to}
        onPageChange={setPage}
        toolbar={
          <DirectoryToolbar>
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search teams..."
              label="Search teams"
            />
            <ToolbarButton icon={Plus} tone="primary" onClick={() => openPanel(PANELS.NEW_TEAM)}>
              {t('clubTeams.addTeam')}
            </ToolbarButton>
          </DirectoryToolbar>
        }
      >
        {slice.length === 0 ? (
          <EmptyRow colSpan={COLUMNS.length}>
            {search ? 'No teams match your search.' : 'No teams in this club yet.'}
          </EmptyRow>
        ) : (
          slice.map((team) => {
            const isExpanded = expandedTeam === team.id;
            const roles = teamRoles[team.id] || [];
            const isEditingThis = editingTeamId === team.id;

            return (
              <React.Fragment key={team.id}>
                <tr className="border-b border-border align-middle transition-colors hover:bg-foreground/[0.03]">
                  <td className="px-4 py-2.5">
                    {isEditingThis ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          autoFocus
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTeam(team.id);
                            if (e.key === 'Escape') {
                              setEditingTeamId(null);
                              setEditingName('');
                              setEditingTier('competitive');
                            }
                          }}
                          aria-label="Team name"
                          className="flex-grow rounded-md border border-input bg-card px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                        />
                        <select
                          value={editingTier}
                          onChange={(e) => setEditingTier(e.target.value)}
                          aria-label="Team tier"
                          className="rounded-md border border-input bg-card px-2 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="competitive">Competitive</option>
                          <option value="recreational">Recreational</option>
                          <option value="academy">Academy</option>
                          <option value="select">Select</option>
                        </select>
                        <RowAction
                          icon={Save}
                          label="Save team"
                          disabled={isSaving}
                          onClick={() => handleSaveTeam(team.id)}
                        />
                        <RowAction
                          icon={X}
                          label="Cancel edit"
                          onClick={() => {
                            setEditingTeamId(null);
                            setEditingName('');
                            setEditingTier('competitive');
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectTeam(team.id)}
                        className="flex items-center gap-2.5 text-left"
                      >
                        <span
                          className="h-8 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: team.colorPrimary || 'var(--primary)' }}
                        />
                        <span className="font-semibold text-foreground transition-colors hover:text-primary">
                          {team.name}
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{team.ageGroup}</td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                    {team.gender === 'M' ? 'Boys' : team.gender === 'F' ? 'Girls' : team.gender}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={team.tier === 'competitive' ? 'primary' : 'secondary'}>{team.tier}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <RowAction
                        icon={Edit}
                        label="Edit team name"
                        onClick={() => {
                          setEditingTeamId(team.id);
                          setEditingName(team.name);
                          setEditingTier(team.tier || 'competitive');
                        }}
                      />
                      <RowAction
                        icon={Settings}
                        label="Manage roles"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                      />
                      <RowAction icon={Trash2} label="Archive team" onClick={() => handleDeleteTeam(team)} />
                    </div>
                  </td>
                </tr>

                {isExpanded && (
                  <DetailRow colSpan={COLUMNS.length}>
                    <div className="space-y-3">
                      {/* Header with assign button */}
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-muted-foreground">Team Roles</p>
                        <button
                          onClick={() => setShowInvite(showInvite === team.id ? null : team.id)}
                          className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 flex items-center gap-1"
                        >
                          <UserPlus size={12} /> Assign Role
                        </button>
                      </div>

                      {roles === null ? (
                        <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
                      ) : roles.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2">No roles assigned to this team yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {roles.map((r) => (
                            <div
                              key={r.id}
                              className={`flex items-center justify-between p-2.5 rounded-lg border ${r.isClubLevel ? 'bg-violet-50/50 dark:bg-violet-900/20 border-violet-100 dark:border-violet-800' : 'bg-card border-border'}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                    r.role === 'club_admin'
                                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                      : r.role === 'club_manager'
                                        ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                                        : r.role === 'team_manager'
                                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                          : r.role === 'treasurer'
                                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                            : r.role === 'scheduler'
                                              ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                                              : r.role === 'head_coach'
                                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                                : r.role === 'fundraiser'
                                                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                                  : 'bg-muted text-foreground'
                                  }`}
                                >
                                  {ALL_ROLES[r.role]?.label || r.role}
                                </span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {r.displayName || r.email || r.userId.slice(0, 8) + '...'}
                                </span>
                                {r.isClubLevel && (
                                  <span className="text-xs font-semibold text-violet-400 uppercase shrink-0">
                                    via club
                                  </span>
                                )}
                              </div>
                              {/* Only allow revoking direct team roles, not inherited club roles */}
                              {!r.isClubLevel ? (
                                <button
                                  onClick={() => handleRevokeRole(r.id, team.id)}
                                  className="text-muted-foreground hover:text-red-700 dark:text-red-400 transition-colors shrink-0"
                                >
                                  <X size={12} />
                                </button>
                              ) : (
                                <span
                                  className="text-xs text-muted-foreground shrink-0"
                                  title="Manage in Club Settings"
                                >
                                  🔒
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Invite form — only CLUB_ASSIGNABLE_ROLES (coach, assist coach, team manager) */}
                      {showInvite === team.id && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                            Assign a coach or team manager by their login email
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              placeholder="coach@example.com"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              className="flex-grow bg-card border border-blue-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                            />
                            <select
                              value={inviteRole}
                              onChange={(e) => setInviteRole(e.target.value)}
                              className="bg-card border border-blue-200 rounded-lg px-2 py-1.5 text-xs font-semibold outline-none"
                            >
                              {CLUB_ASSIGNABLE_ROLES.map((key) => (
                                <option key={key} value={key}>
                                  {TEAM_ROLES[key]?.label || key}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            User must have an existing account. If they don't, use the Invite flow in Club → Users
                            instead.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowInvite(null)}
                              className="text-xs font-semibold text-muted-foreground px-3 py-1.5"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleAssignRole(team.id)}
                              disabled={isSaving || !inviteEmail.trim()}
                              className="text-xs font-bold text-white bg-blue-600 px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              Assign
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </DetailRow>
                )}
              </React.Fragment>
            );
          })
        )}
      </DirectoryCard>

      {/* Create Team Modal */}
      {showCreateForm && (
        <PanelHost>
          <ResponsiveModal as="form" onSubmit={handleCreateTeam} onClose={closePanel} size="md">
            <ResponsiveModal.Header className="border-b border-border">
              <h3 className="text-lg font-bold text-foreground">Create Team</h3>
            </ResponsiveModal.Header>

            <ResponsiveModal.Body className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Team Name</label>
                <input
                  autoFocus
                  required
                  type="text"
                  placeholder="e.g. 2014 Boys White"
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                  className="w-full border border-border rounded-lg p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring mt-1 bg-card"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Age Group</label>
                  <input
                    type="text"
                    placeholder="U11"
                    value={newTeam.ageGroup}
                    onChange={(e) => setNewTeam({ ...newTeam, ageGroup: e.target.value })}
                    className="w-full border border-border rounded-lg p-2.5 text-sm outline-none mt-1 bg-card"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Gender</label>
                  <select
                    value={newTeam.gender}
                    onChange={(e) => setNewTeam({ ...newTeam, gender: e.target.value })}
                    className="w-full border border-border rounded-lg p-2.5 text-sm outline-none mt-1 bg-card"
                  >
                    <option value="M">Boys</option>
                    <option value="F">Girls</option>
                    <option value="Coed">Coed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Tier</label>
                  <select
                    value={newTeam.tier}
                    onChange={(e) => setNewTeam({ ...newTeam, tier: e.target.value })}
                    className="w-full border border-border rounded-lg p-2.5 text-sm outline-none mt-1 bg-card"
                  >
                    <option value="competitive">Competitive</option>
                    <option value="recreational">Recreational</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Team Color</label>
                <div className="flex gap-2 mt-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTeam({ ...newTeam, colorPrimary: c })}
                      className={`w-8 h-8 rounded-lg transition-all ${newTeam.colorPrimary === c ? 'ring-2 ring-blue-500 ring-offset-2 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">iCal URL (optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newTeam.icalUrl}
                  onChange={(e) => setNewTeam({ ...newTeam, icalUrl: e.target.value })}
                  className="w-full border border-border rounded-lg p-2.5 text-sm outline-none mt-1 bg-card"
                />
              </div>
            </ResponsiveModal.Body>

            <ResponsiveModal.Footer>
              <button
                type="button"
                onClick={closePanel}
                className="text-sm font-semibold text-muted-foreground px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !newTeam.name.trim()}
                className="text-sm font-bold text-accent-foreground bg-accent px-6 py-2 rounded-lg hover:bg-accent/90 disabled:opacity-50 shadow-lg"
              >
                {isSaving ? 'Creating...' : 'Create Team'}
              </button>
            </ResponsiveModal.Footer>
          </ResponsiveModal>
        </PanelHost>
      )}
    </div>
  );
}
