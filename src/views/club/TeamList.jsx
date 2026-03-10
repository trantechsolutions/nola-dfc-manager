import React, { useState, useEffect } from 'react';
import { 
  Plus, Users, Settings, Trash2, Edit, ChevronDown, ChevronUp,
  Shield, UserPlus, Calendar, X, CheckCircle2, Save
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { ALL_ROLES, TEAM_ROLES, CLUB_ASSIGNABLE_ROLES } from '../../utils/roles';

export default function TeamList({ club, teams, onSelectTeam, formatMoney, showToast, showConfirm, refreshContext }) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [teamRoles, setTeamRoles] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // New team form
  const [newTeam, setNewTeam] = useState({ name: '', ageGroup: '', gender: 'boys', tier: 'competitive', icalUrl: '', colorPrimary: '#1e293b' });

  // Inline team name editing
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingName, setEditingName] = useState('');

  // Invite form
  const [showInvite, setShowInvite] = useState(null); // teamId or null
  const [inviteRole, setInviteRole] = useState('team_manager');
  const [inviteEmail, setInviteEmail] = useState('');

  // Fetch roles for expanded team
  useEffect(() => {
    if (expandedTeam && !teamRoles[expandedTeam]) {
      supabaseService.getTeamRoles(expandedTeam).then(roles => {
        setTeamRoles(prev => ({ ...prev, [expandedTeam]: roles }));
      }).catch(console.error);
    }
  }, [expandedTeam]);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeam.name.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.createTeam({ ...newTeam, clubId: club.id });
      setShowCreateForm(false);
      setNewTeam({ name: '', ageGroup: '', gender: 'boys', tier: 'competitive', icalUrl: '', colorPrimary: '#1e293b' });
      await refreshContext();
      if (showToast) showToast(`Team "${newTeam.name}" created.`);
    } catch (e) {
      if (showToast) showToast('Failed to create team.', true);
    } finally { setIsSaving(false); }
  };

  const handleDeleteTeam = async (team) => {
    const ok = await showConfirm(`Delete "${team.name}"? This removes the team and all its season data, roster assignments, and transactions. This cannot be undone.`);
    if (!ok) return;
    setIsSaving(true);
    try {
      await supabaseService.updateTeam(team.id, { status: 'archived' });
      await refreshContext();
      if (showToast) showToast(`"${team.name}" archived.`);
    } catch (e) {
      if (showToast) showToast('Failed.', true);
    } finally { setIsSaving(false); }
  };

  const handleSaveTeamName = async (teamId) => {
    if (!editingName.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.updateTeam(teamId, { name: editingName.trim() });
      await refreshContext();
      setEditingTeamId(null);
      setEditingName('');
      if (showToast) showToast('Team name updated.');
    } catch (e) {
      if (showToast) showToast('Failed to update name.', true);
    } finally { setIsSaving(false); }
  };

  const handleAssignRole = async (teamId) => {
    if (!inviteEmail.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.assignRoleByEmail(inviteEmail.trim(), inviteRole, { teamId });
      setShowInvite(null);
      setInviteEmail('');
      setTeamRoles(prev => ({ ...prev, [teamId]: null })); // force refetch
      setExpandedTeam(null);
      setTimeout(() => setExpandedTeam(teamId), 50);
      if (showToast) showToast('Role assigned.');
    } catch (e) {
      if (showToast) showToast(e.message || 'Assignment failed.', true);
    } finally { setIsSaving(false); }
  };

  const handleRevokeRole = async (roleId, teamId) => {
    const ok = await showConfirm('Remove this role assignment?');
    if (!ok) return;
    try {
      await supabaseService.revokeRole(roleId);
      setTeamRoles(prev => ({ ...prev, [teamId]: prev[teamId]?.filter(r => r.id !== roleId) }));
      if (showToast) showToast('Role removed.');
    } catch (e) {
      if (showToast) showToast('Failed.', true);
    }
  };

  const COLORS = ['#1e293b','#2563eb','#059669','#dc2626','#7c3aed','#d97706','#0891b2','#be185d'];

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Teams</h2>
          <p className="text-xs text-slate-400 font-bold">{club?.name} · {teams.length} team{teams.length !== 1 && 's'}</p>
        </div>
        <button onClick={() => setShowCreateForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-slate-800 shadow-lg transition-all">
          <Plus size={14} /> Add Team
        </button>
      </div>

      {/* Team Cards */}
      <div className="space-y-3">
        {teams.map(team => {
          const isExpanded = expandedTeam === team.id;
          const roles = teamRoles[team.id] || [];
          const isEditingThis = editingTeamId === team.id;

          return (
            <div key={team.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                {/* Color dot */}
                <div className="w-3 h-12 rounded-full shrink-0" style={{ backgroundColor: team.colorPrimary || '#1e293b' }} />

                {/* Info */}
                <div className="flex-grow min-w-0">
                  {isEditingThis ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveTeamName(team.id); if (e.key === 'Escape') { setEditingTeamId(null); setEditingName(''); } }}
                        className="font-black text-slate-900 text-sm border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 flex-grow"
                      />
                      <button onClick={() => handleSaveTeamName(team.id)} disabled={isSaving}
                        className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                        <Save size={16} />
                      </button>
                      <button onClick={() => { setEditingTeamId(null); setEditingName(''); }}
                        className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="cursor-pointer" onClick={() => onSelectTeam(team.id)}>
                      <h3 className="font-black text-slate-900 text-sm">{team.name}</h3>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium mt-0.5">
                        <span>{team.ageGroup}</span>
                        <span>{team.gender}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${team.tier === 'competitive' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{team.tier}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingTeamId(team.id); setEditingName(team.name); }}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    title="Edit team name"
                  >
                    <Edit size={14} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setExpandedTeam(isExpanded ? null : team.id); }}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all" title="Manage roles">
                    <Settings size={14} />
                    {isExpanded ? <ChevronUp size={10} className="ml-0.5 inline" /> : <ChevronDown size={10} className="ml-0.5 inline" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team); }}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Archive team">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Expanded: Role Management */}
              {isExpanded && (
                <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                  <div className="space-y-3">
                    {/* Header with assign button */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Team Roles</p>
                      <button onClick={() => setShowInvite(showInvite === team.id ? null : team.id)}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                        <UserPlus size={12} /> Assign Role
                      </button>
                    </div>

                    {roles === null ? (
                      <p className="text-xs text-slate-400 animate-pulse">Loading...</p>
                    ) : roles.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">No roles assigned to this team yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {roles.map(r => (
                          <div key={r.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${r.isClubLevel ? 'bg-violet-50/50 border-violet-100' : 'bg-white border-slate-100'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                r.role === 'club_admin' ? 'bg-red-100 text-red-700' :
                                r.role === 'club_manager' ? 'bg-violet-100 text-violet-700' :
                                r.role === 'team_manager' ? 'bg-blue-100 text-blue-700' :
                                r.role === 'team_admin' ? 'bg-indigo-100 text-indigo-700' :
                                r.role === 'treasurer' ? 'bg-emerald-100 text-emerald-700' :
                                r.role === 'scheduler' ? 'bg-violet-100 text-violet-700' :
                                r.role === 'head_coach' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>{ALL_ROLES[r.role]?.label || r.role}</span>
                              <span className="text-[10px] text-slate-500 truncate">{r.displayName || r.email || r.userId.slice(0, 8) + '...'}</span>
                              {r.isClubLevel && <span className="text-[8px] font-bold text-violet-400 uppercase shrink-0">via club</span>}
                            </div>
                            {/* Only allow revoking direct team roles, not inherited club roles */}
                            {!r.isClubLevel ? (
                              <button onClick={() => handleRevokeRole(r.id, team.id)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                                <X size={12} />
                              </button>
                            ) : (
                              <span className="text-[8px] text-slate-300 shrink-0" title="Manage in Club Settings">🔒</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Invite form — only CLUB_ASSIGNABLE_ROLES (coach, assist coach, team manager) */}
                    {showInvite === team.id && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                        <p className="text-[10px] font-bold text-blue-700">Assign a coach or team manager by their login email</p>
                        <div className="flex gap-2">
                          <input type="email" placeholder="coach@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                            className="flex-grow bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                          <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                            className="bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                            {CLUB_ASSIGNABLE_ROLES.map(key => (
                              <option key={key} value={key}>{TEAM_ROLES[key]?.label || key}</option>
                            ))}
                          </select>
                        </div>
                        <p className="text-[9px] text-slate-400">User must have an existing account. If they don't, use the Invite flow in Club → Users instead.</p>
                        <div className="flex gap-2">
                          <button onClick={() => setShowInvite(null)} className="text-xs font-bold text-slate-500 px-3 py-1.5">Cancel</button>
                          <button onClick={() => handleAssignRole(team.id)} disabled={isSaving || !inviteEmail.trim()}
                            className="text-xs font-black text-white bg-blue-600 px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            Assign
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Team Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-black text-slate-800 mb-4">Create Team</h3>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Team Name</label>
                <input autoFocus required type="text" placeholder="e.g. 2014 Boys White"
                  value={newTeam.name} onChange={e => setNewTeam({...newTeam, name: e.target.value})}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Age Group</label>
                  <input type="text" placeholder="U11" value={newTeam.ageGroup} onChange={e => setNewTeam({...newTeam, ageGroup: e.target.value})}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none mt-1" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gender</label>
                  <select value={newTeam.gender} onChange={e => setNewTeam({...newTeam, gender: e.target.value})}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none mt-1">
                    <option value="boys">Boys</option><option value="girls">Girls</option><option value="coed">Coed</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tier</label>
                  <select value={newTeam.tier} onChange={e => setNewTeam({...newTeam, tier: e.target.value})}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none mt-1">
                    <option value="competitive">Competitive</option><option value="recreational">Recreational</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Team Color</label>
                <div className="flex gap-2 mt-1.5">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setNewTeam({...newTeam, colorPrimary: c})}
                      className={`w-8 h-8 rounded-lg transition-all ${newTeam.colorPrimary === c ? 'ring-2 ring-blue-500 ring-offset-2 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">iCal URL (optional)</label>
                <input type="url" placeholder="https://..." value={newTeam.icalUrl} onChange={e => setNewTeam({...newTeam, icalUrl: e.target.value})}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none mt-1" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateForm(false)} className="text-sm font-bold text-slate-500 px-4 py-2">Cancel</button>
                <button type="submit" disabled={isSaving || !newTeam.name.trim()}
                  className="text-sm font-black text-white bg-slate-900 px-6 py-2 rounded-xl hover:bg-slate-800 disabled:opacity-50 shadow-lg">
                  {isSaving ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}