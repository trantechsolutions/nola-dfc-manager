import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, Shield, Search, CheckCircle2, XCircle,
  X, ChevronDown, ChevronUp, Mail, Phone, User
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { TEAM_ROLES, ALL_ROLES } from '../utils/roles';

const ROLE_COLORS = {
  team_manager: 'bg-blue-100 text-blue-700',
  scheduler: 'bg-violet-100 text-violet-700',
  treasurer: 'bg-emerald-100 text-emerald-700',
  head_coach: 'bg-amber-100 text-amber-700',
  assistant_coach: 'bg-slate-100 text-slate-600',
};

// Roles a team manager can assign (no club-level roles)
const ASSIGNABLE_ROLES = ['assistant_coach', 'head_coach', 'scheduler'];

export default function TeamUserManagement({ selectedTeam, showToast, showConfirm }) {
  const [guardians, setGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | with-account | no-account | has-role
  const [assigningFor, setAssigningFor] = useState(null); // guardian email
  const [assignRole, setAssignRole] = useState('assistant_coach');
  const [isSaving, setIsSaving] = useState(false);

  const fetchGuardians = async () => {
    if (!selectedTeam?.id) return;
    setLoading(true);
    try {
      const data = await supabaseService.getTeamGuardiansWithStatus(selectedTeam.id);
      setGuardians(data);
    } catch (e) {
      console.error('Failed to fetch guardians:', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchGuardians(); }, [selectedTeam?.id]);

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
    } finally { setIsSaving(false); }
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

  const filtered = useMemo(() => {
    let result = guardians;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(q) || g.email.includes(q));
    }
    if (filterStatus === 'with-account') result = result.filter(g => g.hasAccount);
    if (filterStatus === 'no-account') result = result.filter(g => !g.hasAccount);
    if (filterStatus === 'has-role') result = result.filter(g => g.roles.length > 0);
    return result;
  }, [guardians, searchTerm, filterStatus]);

  const withAccount = guardians.filter(g => g.hasAccount).length;
  const withRoles = guardians.filter(g => g.roles.length > 0).length;

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse">Loading team users...</div>;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-slate-900">Team Users</h2>
        <p className="text-xs text-slate-400 font-bold">{selectedTeam?.name} · {guardians.length} guardians · {withAccount} with accounts · {withRoles} with roles</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <Users size={16} className="text-blue-600 mx-auto" />
          <p className="text-xl font-black text-slate-900 mt-1">{guardians.length}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Guardians</p>
        </div>
        <div className={`p-4 rounded-2xl border shadow-sm text-center ${withAccount === guardians.length ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
          <CheckCircle2 size={16} className={withAccount === guardians.length ? 'text-emerald-600 mx-auto' : 'text-slate-400 mx-auto'} />
          <p className="text-xl font-black mt-1">{withAccount}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Have Accounts</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <Shield size={16} className="text-violet-600 mx-auto" />
          <p className="text-xl font-black text-slate-900 mt-1">{withRoles}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Have Roles</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input type="text" placeholder="Search by name or email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'with-account', label: 'Has Account' },
            { id: 'no-account', label: 'No Account' },
            { id: 'has-role', label: 'Has Role' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${filterStatus === f.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Guardian List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400 font-bold text-sm">
            {searchTerm || filterStatus !== 'all' ? 'No guardians match your filters.' : 'No guardians found for this team.'}
          </div>
        ) : filtered.map(g => {
          const isExpanded = assigningFor === g.email;

          return (
            <div key={g.email} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${g.hasAccount ? 'border-slate-200' : 'border-slate-100 opacity-75'}`}>
              <div className="flex items-center gap-3 p-4">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${g.hasAccount ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                  {g.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-800 truncate">{g.name}</p>
                    {g.hasAccount ? (
                      <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">Account</span>
                    ) : (
                      <span className="text-[8px] font-black bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase">No Account</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium mt-0.5">
                    <span className="flex items-center gap-1 truncate"><Mail size={10} /> {g.email}</span>
                    {g.phone && <span className="flex items-center gap-1"><Phone size={10} /> {g.phone}</span>}
                  </div>
                  {/* Children */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {g.players.map(p => (
                      <span key={p.id} className="text-[9px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        #{p.jersey || '?'} {p.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Roles + assign button */}
                <div className="flex items-center gap-2 shrink-0">
                  {g.roles.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {g.roles.map(r => (
                        <div key={r.id} className="inline-flex items-center gap-1 group">
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${ROLE_COLORS[r.role] || 'bg-slate-100 text-slate-600'}`}>
                            {ALL_ROLES[r.role]?.label || r.role}
                          </span>
                          <button onClick={() => handleRevokeRole(g, r.id, r.role)}
                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {g.hasAccount && (
                    <button onClick={() => setAssigningFor(isExpanded ? null : g.email)}
                      className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-slate-200 text-slate-600' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                      title="Assign role">
                      {isExpanded ? <ChevronUp size={14} /> : <UserPlus size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Assign role form */}
              {isExpanded && (
                <div className="border-t border-slate-100 p-4 bg-blue-50/50 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 shrink-0">Assign:</span>
                  <select value={assignRole} onChange={e => setAssignRole(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none flex-grow">
                    {ASSIGNABLE_ROLES.map(key => (
                      <option key={key} value={key}>{TEAM_ROLES[key]?.label}</option>
                    ))}
                  </select>
                  <button onClick={() => handleAssignRole(g)} disabled={isSaving}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-black rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0">
                    Assign
                  </button>
                  <button onClick={() => setAssigningFor(null)} className="text-slate-400 hover:text-slate-600 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help text */}
      <div className="bg-slate-50 p-4 rounded-xl text-[11px] text-slate-400 leading-relaxed">
        <p className="font-bold text-slate-500 mb-1">How this works:</p>
        <p>This list shows all guardians linked to players on your roster. Guardians with a <span className="font-bold text-emerald-600">green "Account" badge</span> have signed up and can be assigned team roles. Those without accounts need to create one first — share the login page link with them. For full user management and invitations, contact a club administrator.</p>
      </div>
    </div>
  );
}