import React, { useState, useEffect } from 'react';
import { Building2, Shield, Save, UserPlus, X, CalendarDays, Loader2 } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { ALL_ROLES, CLUB_ROLES } from '../../utils/roles';
import AdminCard from '../../components/layout/AdminCard';
import FormRow from '../../components/layout/FormRow';
import { formControl } from '../../components/layout/formControl';
import ViewScopeCard from '../../components/ViewScopeCard';
import { VIEW_SCOPE } from '../../utils/viewScope';

export default function ClubSettings({
  club,
  teams,
  userRoles,
  showToast,
  showConfirm,
  refreshContext,
  viewScope,
  onChangeViewScope,
  canSetViewScope = false,
}) {
  const [clubName, setClubName] = useState(club?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [allRoles, setAllRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  // Default season
  const [seasons, setSeasons] = useState([]);
  const [defaultSeason, setDefaultSeason] = useState(club?.settings?.defaultSeason || '');
  const [isSavingSeason, setIsSavingSeason] = useState(false);

  // Keep the selection in sync when the club context refreshes
  useEffect(() => {
    setDefaultSeason(club?.settings?.defaultSeason || '');
  }, [club?.settings?.defaultSeason]);

  // Load the season list for the picker
  useEffect(() => {
    supabaseService
      .getAllSeasons()
      .then((data) => setSeasons(data || []))
      .catch((e) => console.error('Failed to load seasons', e));
  }, []);

  const handleSaveDefaultSeason = async () => {
    setIsSavingSeason(true);
    try {
      const settings = { ...(club?.settings || {}), defaultSeason: defaultSeason || null };
      await supabaseService.updateClub(club.id, { settings });
      if (refreshContext) await refreshContext();
      if (showToast) showToast('Default season saved.');
    } catch (e) {
      if (showToast) showToast('Save failed.', true);
    } finally {
      setIsSavingSeason(false);
    }
  };

  // Club-level role invite
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('club_manager');

  // Fetch all roles across the club
  useEffect(() => {
    const fetchAllRoles = async () => {
      setLoadingRoles(true);
      try {
        const clubRoles = [];
        // Club-level roles
        for (const r of userRoles.filter((r) => r.clubId)) {
          clubRoles.push({ ...r, scope: 'club', scopeName: club?.name || 'Club' });
        }
        // Team-level roles
        for (const team of teams) {
          const roles = await supabaseService.getTeamRoles(team.id);
          roles.forEach((r) => {
            clubRoles.push({ ...r, scope: 'team', scopeName: team.name, teamColor: team.colorPrimary });
          });
        }
        setAllRoles(clubRoles);
      } catch (e) {
        console.error('Failed to load roles', e);
      } finally {
        setLoadingRoles(false);
      }
    };
    fetchAllRoles();
  }, [teams, userRoles, club]);

  const handleSaveClub = async () => {
    if (!clubName.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.updateClub(club.id, { name: clubName.trim() });
      if (refreshContext) await refreshContext();
      if (showToast) showToast('Club settings saved.');
    } catch (e) {
      if (showToast) showToast('Save failed.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignClubRole = async () => {
    if (!inviteEmail.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.assignRoleByEmail(inviteEmail.trim(), inviteRole, { clubId: club.id });
      setShowInvite(false);
      setInviteEmail('');
      await refreshContext();
      if (showToast) showToast('Club role assigned.');
    } catch (e) {
      if (showToast) showToast(e.message || 'Assignment failed.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeRole = async (roleId) => {
    const ok = await showConfirm('Remove this role assignment?');
    if (!ok) return;
    try {
      await supabaseService.revokeRole(roleId);
      setAllRoles((prev) => prev.filter((r) => r.id !== roleId));
      if (showToast) showToast('Role removed.');
    } catch (e) {
      if (showToast) showToast('Failed.', true);
    }
  };

  // Group roles by user ID
  const rolesByUser = {};
  allRoles.forEach((r) => {
    if (!rolesByUser[r.userId]) rolesByUser[r.userId] = { userId: r.userId, roles: [] };
    rolesByUser[r.userId].roles.push(r);
  });

  return (
    <div className="pb-24 md:pb-0">
      <p className="mb-4 text-xs font-semibold text-muted-foreground">
        {club?.name} · {teams.length} {teams.length === 1 ? 'team' : 'teams'}
      </p>

      {/* ── Club Information ── */}
      <AdminCard
        title="Club Information"
        icon={Building2}
        footer={
          <div className="flex justify-end">
            <SaveButton onClick={handleSaveClub} busy={isSaving} disabled={!clubName.trim()}>
              Save changes
            </SaveButton>
          </div>
        }
        bodyClassName="space-y-4"
      >
        <FormRow label="Club name" htmlFor="club-name">
          <input
            id="club-name"
            type="text"
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            className={formControl}
          />
        </FormRow>
        <FormRow label="Slug" help="Set when the club is created — used in public links.">
          <p className="pt-1.5 font-mono text-sm text-muted-foreground">{club?.slug}</p>
        </FormRow>
        <FormRow label="Teams">
          <p className="pt-1.5 text-sm font-semibold text-foreground">{teams.length}</p>
        </FormRow>
      </AdminCard>

      {/* ── Default Season ── */}
      <AdminCard
        title="Default Season"
        icon={CalendarDays}
        footer={
          <div className="flex justify-end">
            <SaveButton onClick={handleSaveDefaultSeason} busy={isSavingSeason}>
              Save default season
            </SaveButton>
          </div>
        }
      >
        <FormRow
          label="Season"
          htmlFor="default-season"
          help="The season loaded when members open the app. Leave on “Auto” to follow the active season on the calendar."
        >
          <select
            id="default-season"
            value={defaultSeason}
            onChange={(e) => setDefaultSeason(e.target.value)}
            className={formControl}
          >
            <option value="">Auto (current season)</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id}
              </option>
            ))}
          </select>
        </FormRow>
      </AdminCard>

      {/* ── View Scope ── personal preference; also lives in Team Settings so
          an admin who hides the club section can get back to it. */}
      {canSetViewScope && onChangeViewScope && (
        <ViewScopeCard
          viewScope={viewScope}
          onChange={(scope) => {
            onChangeViewScope(scope);
            if (showToast && scope === VIEW_SCOPE.TEAM) {
              showToast('Showing team-level items only. Switch back from Team → Settings.');
            }
          }}
        />
      )}

      {/* ── Club Administrators ── */}
      <AdminCard
        title="Club Administrators"
        icon={Shield}
        tools={
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-muted"
          >
            <UserPlus size={13} /> Add admin
          </button>
        }
      >
        {showInvite && (
          <div className="mb-4 space-y-2 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">Assign a club-level role by email address</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="email"
                placeholder="admin@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className={`${formControl} min-w-0 flex-1`}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className={`${formControl} w-auto`}
              >
                {Object.entries(CLUB_ROLES).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              User must have an existing account. If they don't, use the Invite flow in Club → Users instead.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowInvite(false)}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignClubRole}
                disabled={isSaving || !inviteEmail.trim()}
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        )}

        {/* All role holders */}
        {loadingRoles ? (
          <p className="animate-pulse py-4 text-xs text-muted-foreground">Loading roles...</p>
        ) : Object.keys(rolesByUser).length === 0 ? (
          <p className="py-4 text-xs italic text-muted-foreground">No roles assigned yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {Object.values(rolesByUser).map(({ userId, roles }) => {
              const firstWithEmail = roles.find((r) => r.email || r.displayName);
              const displayLabel = firstWithEmail?.displayName || firstWithEmail?.email || userId.slice(0, 12) + '...';
              return (
                <li key={userId} className="py-3 first:pt-0 last:pb-0">
                  <p className="mb-1.5 text-sm font-semibold text-foreground">{displayLabel}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((r) => (
                      <span
                        key={r.id}
                        className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1"
                      >
                        {r.scope === 'team' && (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: r.teamColor || '#94a3b8' }}
                          />
                        )}
                        <span className={`text-xs font-bold uppercase ${roleToneClass(r.role)}`}>
                          {ALL_ROLES[r.role]?.label || r.role}
                        </span>
                        <span className="text-xs text-muted-foreground">{r.scopeName}</span>
                        <button
                          onClick={() => handleRevokeRole(r.id)}
                          aria-label={`Remove ${ALL_ROLES[r.role]?.label || r.role} on ${r.scopeName}`}
                          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>

      {/* ── Role Legend ── */}
      <AdminCard title="Role Permissions" icon={Shield}>
        <ul className="divide-y divide-border">
          {Object.entries(ALL_ROLES).map(([key, def]) => (
            <li key={key} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <span
                className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-bold uppercase ${roleBadgeClass(key)}`}
              >
                {def.label}
              </span>
              <p className="text-xs leading-relaxed text-muted-foreground">{def.description}</p>
            </li>
          ))}
        </ul>
      </AdminCard>
    </div>
  );
}

/** AdminLTE puts the primary action alone in the `.card-footer`. */
function SaveButton({ onClick, busy, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
      {children}
    </button>
  );
}

function roleToneClass(role) {
  if (role === 'club_admin') return 'text-red-700 dark:text-red-400';
  if (role === 'club_manager' || role === 'scheduler') return 'text-violet-700 dark:text-violet-400';
  if (role === 'team_manager') return 'text-blue-700 dark:text-blue-400';
  if (role === 'treasurer') return 'text-emerald-700 dark:text-emerald-400';
  if (role === 'head_coach') return 'text-amber-700 dark:text-amber-400';
  return 'text-muted-foreground';
}

function roleBadgeClass(role) {
  if (role === 'club_admin') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  if (role === 'club_manager' || role === 'scheduler')
    return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300';
  if (role === 'team_manager') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  if (role === 'treasurer') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (role === 'head_coach') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-muted text-foreground';
}
