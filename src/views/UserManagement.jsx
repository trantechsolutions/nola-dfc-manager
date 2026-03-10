import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserPlus, Mail, Shield, X, CheckCircle2, Clock, XCircle, 
  Search, ChevronDown, ChevronUp, Users, Send, Copy, Ban, Edit
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { ALL_ROLES, CLUB_ROLES, TEAM_ROLES, CLUB_ASSIGNABLE_ROLES } from '../utils/roles';

const ROLE_COLORS = {
  club_admin: 'bg-red-100 text-red-700', club_manager: 'bg-violet-100 text-violet-700',
  team_manager: 'bg-blue-100 text-blue-700', team_admin: 'bg-indigo-100 text-indigo-700',
  scheduler: 'bg-violet-100 text-violet-700',
  treasurer: 'bg-emerald-100 text-emerald-700', head_coach: 'bg-amber-100 text-amber-700',
  assistant_coach: 'bg-slate-100 text-slate-600', parent: 'bg-cyan-100 text-cyan-700',
};
const INV_STATUS_COLORS = {
  pending: 'bg-blue-100 text-blue-700', accepted: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-amber-100 text-amber-700', revoked: 'bg-red-100 text-red-700',
};

export default function UserManagement({ club, teams, showToast, showConfirm, refreshContext }) {
  const [activeTab, setActiveTab] = useState('directory');
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Invite form — default to team_manager (a club-assignable role)
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [invForm, setInvForm] = useState({ email: '', name: '', role: 'team_manager', teamId: '' });
  const [isSending, setIsSending] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [u, inv] = await Promise.all([
        supabaseService.getClubUsers(club.id),
        supabaseService.getInvitations(club.id),
      ]);
      setUsers(u);
      setInvitations(inv);
    } catch (e) { console.error('User mgmt fetch error', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (club?.id) fetchData(); }, [club?.id]);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!invForm.email.trim()) return;
    setIsSending(true);
    try {
      await supabaseService.createInvitation({
        clubId: club.id,
        teamId: invForm.teamId || null,
        email: invForm.email,
        role: invForm.role,
        name: invForm.name,
      });
      showToast(`Invitation sent to ${invForm.email}`);
      setShowInviteForm(false);
      setInvForm({ email: '', name: '', role: 'team_manager', teamId: '' });
      fetchData();
    } catch (err) {
      showToast(`Failed: ${err.message}`, true);
    } finally { setIsSending(false); }
  };

  const handleRevokeInvite = async (inv) => {
    const ok = await showConfirm(`Revoke invitation for ${inv.email}?`);
    if (!ok) return;
    await supabaseService.revokeInvitation(inv.id);
    showToast('Invitation revoked');
    fetchData();
  };

  const handleRevokeRole = async (userId, roleId) => {
    const ok = await showConfirm('Remove this role?');
    if (!ok) return;
    await supabaseService.revokeRole(roleId);
    showToast('Role removed');
    fetchData();
    refreshContext();
  };

  const handleToggleActive = async (userId, currentState) => {
    await supabaseService.updateUserProfile(userId, { isActive: !currentState });
    showToast(currentState ? 'User deactivated' : 'User reactivated');
    fetchData();
  };

  const copyInviteLink = (token) => {
    const url = `${window.location.origin}/#/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => showToast('Invite link copied!'));
  };

  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users;
    const q = searchTerm.toLowerCase();
    return users.filter(u => 
      u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  const pendingInvites = invitations.filter(i => i.status === 'pending');

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse">Loading users...</div>;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-black text-slate-900">User Management</h2>
          <p className="text-xs text-slate-400 font-bold">{club?.name} · {users.length} staff · {pendingInvites.length} pending invites</p>
        </div>
        <button onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-700 shadow-lg">
          <UserPlus size={14} /> Invite User
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {[{ id: 'directory', label: `Staff Directory (${users.length})` }, { id: 'invitations', label: `Invitations (${pendingInvites.length})` }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{tab.label}</button>
        ))}
      </div>

      {/* ── DIRECTORY TAB ── */}
      {activeTab === 'directory' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input type="text" placeholder="Search by name or email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {filteredUsers.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400 font-bold text-sm">
              {searchTerm ? 'No users match your search.' : 'No staff members yet. Send an invitation to get started.'}
            </div>
          ) : filteredUsers.map(user => (
            <div key={user.userId} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${user.isActive ? 'border-slate-200' : 'border-red-200 opacity-60'}`}>
              <div className="flex items-center gap-3 p-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-black text-slate-500 shrink-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>

                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-800 truncate">{user.displayName}</p>
                    {!user.isActive && <span className="text-[9px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded">INACTIVE</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium truncate">{user.email}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggleActive(user.userId, user.isActive)}
                    className={`p-1.5 rounded-lg transition-colors ${user.isActive ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                    title={user.isActive ? 'Deactivate' : 'Reactivate'}>
                    <Ban size={14} />
                  </button>
                </div>
              </div>

              {/* Roles */}
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {user.roles.map((r, i) => (
                  <div key={i} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 group">
                    {r.teamName && <span className="text-[9px] text-slate-400">{r.teamName} ·</span>}
                    <span className={`text-[9px] font-black uppercase px-1 py-0.5 rounded ${ROLE_COLORS[r.role] || 'bg-slate-100 text-slate-600'}`}>
                      {ALL_ROLES[r.role]?.label || r.role}
                    </span>
                    <button onClick={() => handleRevokeRole(user.userId, r.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── INVITATIONS TAB ── */}
      {activeTab === 'invitations' && (
        <div className="space-y-2">
          {invitations.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400 font-bold text-sm">
              No invitations sent yet.
            </div>
          ) : invitations.map(inv => (
            <div key={inv.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${INV_STATUS_COLORS[inv.status]}`}>
                {inv.status === 'pending' ? <Clock size={16} /> : inv.status === 'accepted' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-800 truncate">{inv.email}</p>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${ROLE_COLORS[inv.role] || 'bg-slate-100'}`}>{ALL_ROLES[inv.role]?.label || inv.role}</span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">
                  {inv.invitedName ? `${inv.invitedName} · ` : ''}
                  {inv.status === 'pending' ? `Expires ${new Date(inv.expiresAt).toLocaleDateString()}` : inv.status}
                  {inv.acceptedAt ? ` · Accepted ${new Date(inv.acceptedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              {inv.status === 'pending' && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => copyInviteLink(inv.token)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Copy invite link">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => handleRevokeInvite(inv)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Revoke">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── INVITE MODAL ── */}
      {showInviteForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Mail size={20} className="text-blue-600" /> Invite User</h3>
              <button onClick={() => setShowInviteForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address *</label>
                <input autoFocus required type="email" placeholder="coach@example.com" value={invForm.email} onChange={e => setInvForm({ ...invForm, email: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name (optional)</label>
                <input type="text" placeholder="First Last" value={invForm.name} onChange={e => setInvForm({ ...invForm, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role *</label>
                  <select value={invForm.role} onChange={e => setInvForm({ ...invForm, role: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold outline-none mt-1">
                    {/* Only club-assignable roles: Coach, Assistant Coach, Team Manager */}
                    {CLUB_ASSIGNABLE_ROLES.map(key => (
                      <option key={key} value={key}>{TEAM_ROLES[key]?.label || ALL_ROLES[key]?.label || key}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Team</label>
                  <select value={invForm.teamId} onChange={e => setInvForm({ ...invForm, teamId: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none mt-1">
                    <option value="">Select team...</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Role description */}
              <div className="bg-slate-50 p-3 rounded-xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">What this role can do:</p>
                <p className="text-xs text-slate-600">{ALL_ROLES[invForm.role]?.description || 'View access to their child\'s team data.'}</p>
              </div>

              <p className="text-[10px] text-slate-400">
                Team-level roles like Treasurer, Scheduler, and Team Admin are managed by the Team Manager from within the team's Team Users tab.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowInviteForm(false)} className="text-sm font-bold text-slate-500 px-4 py-2">Cancel</button>
                <button type="submit" disabled={isSending || !invForm.email.trim() || !invForm.teamId}
                  className="flex items-center gap-1.5 text-sm font-black text-white bg-blue-600 px-6 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg">
                  <Send size={14} /> {isSending ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}