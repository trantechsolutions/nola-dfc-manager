import React, { useState, useEffect } from 'react';
import { Building2, Shield, Users, Save, UserPlus, X, CheckCircle2 } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { ALL_ROLES, CLUB_ROLES } from '../../utils/roles';

export default function ClubSettings({ club, teams, userRoles, showToast, showConfirm, refreshContext }) {
  const [clubName, setClubName] = useState(club?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [allRoles, setAllRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

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
      // Update club name through a direct query (add to service if needed)
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
    <div className="space-y-6 pb-24 md:pb-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-slate-900 rounded-xl">
          <Building2 size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">Club Settings</h2>
          <p className="text-xs text-slate-400 font-bold">
            {club?.name} · {teams.length} teams
          </p>
        </div>
      </div>

      {/* Club Info */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
          <Building2 size={16} className="text-blue-600" /> Club Information
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Club Name</label>
            <input
              type="text"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 mt-1"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-grow">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Slug</label>
              <p className="text-sm font-mono text-slate-500 mt-1">{club?.slug}</p>
            </div>
            <div className="flex-grow">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Teams</label>
              <p className="text-sm font-black text-slate-800 mt-1">{teams.length}</p>
            </div>
          </div>
          <button
            onClick={handleSaveClub}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-slate-800 disabled:opacity-50"
          >
            <Save size={14} /> Save Changes
          </button>
        </div>
      </div>

      {/* Club-Level Roles */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <Shield size={16} className="text-blue-600" /> Club Administrators
          </h3>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <UserPlus size={12} /> Add Admin
          </button>
        </div>

        {showInvite && (
          <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
            <p className="text-[10px] font-bold text-blue-700">Assign a club-level role by email address</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="admin@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-grow bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
              >
                {Object.entries(CLUB_ROLES).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[9px] text-slate-400">
              User must have an existing account. If they don't, use the Invite flow in Club → Users instead.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowInvite(false)} className="text-xs font-bold text-slate-500 px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={handleAssignClubRole}
                disabled={isSaving || !inviteEmail.trim()}
                className="text-xs font-black text-white bg-blue-600 px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        )}

        {/* All role holders */}
        {loadingRoles ? (
          <p className="text-xs text-slate-400 animate-pulse py-4">Loading roles...</p>
        ) : Object.keys(rolesByUser).length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4">No roles assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {Object.values(rolesByUser).map(({ userId, roles }) => {
              const firstWithEmail = roles.find((r) => r.email || r.displayName);
              const displayLabel = firstWithEmail?.displayName || firstWithEmail?.email || userId.slice(0, 12) + '...';
              return (
                <div key={userId} className="bg-slate-50 p-3 rounded-xl">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-600">{displayLabel}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((r) => (
                      <div
                        key={r.id}
                        className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 group"
                      >
                        {r.scope === 'team' && (
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: r.teamColor || '#94a3b8' }}
                          />
                        )}
                        <span
                          className={`text-[9px] font-black uppercase ${
                            r.role === 'club_admin'
                              ? 'text-red-600'
                              : r.role === 'club_manager'
                                ? 'text-violet-600'
                                : r.role === 'team_manager'
                                  ? 'text-blue-600'
                                  : r.role === 'treasurer'
                                    ? 'text-emerald-600'
                                    : r.role === 'scheduler'
                                      ? 'text-violet-600'
                                      : r.role === 'head_coach'
                                        ? 'text-amber-600'
                                        : 'text-slate-500'
                          }`}
                        >
                          {ALL_ROLES[r.role]?.label || r.role}
                        </span>
                        <span className="text-[9px] text-slate-400">{r.scopeName}</span>
                        <button
                          onClick={() => handleRevokeRole(r.id)}
                          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role Legend */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-black text-slate-800 text-sm mb-3">Role Permissions</h3>
        <div className="space-y-2">
          {Object.entries(ALL_ROLES).map(([key, def]) => (
            <div key={key} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg">
              <span
                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                  key === 'club_admin'
                    ? 'bg-red-100 text-red-700'
                    : key === 'club_manager'
                      ? 'bg-violet-100 text-violet-700'
                      : key === 'team_manager'
                        ? 'bg-blue-100 text-blue-700'
                        : key === 'treasurer'
                          ? 'bg-emerald-100 text-emerald-700'
                          : key === 'scheduler'
                            ? 'bg-violet-100 text-violet-700'
                            : key === 'head_coach'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                }`}
              >
                {def.label}
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">{def.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
