import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Search, Filter, ChevronDown, ChevronUp, Plus, Upload,
  Edit, Archive, RotateCcw, Mail, Phone, Shield, ShieldCheck, ShieldX,
  UserPlus, X, Check, AlertCircle, Download, Calendar, Trash2, Copy
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import BulkUploadModal from '../../components/BulkUploadModal';

// ── Jersey SVG (matches TeamOverviewView) ──
const JerseyBadge = ({ number, size = 36, color = 'slate' }) => {
  const colors = {
    slate:   { fill: '#0f172a', stroke: '#1e293b', text: '#ffffff' },
    blue:    { fill: '#2563eb', stroke: '#1d4ed8', text: '#ffffff' },
    amber:   { fill: '#f59e0b', stroke: '#d97706', text: '#ffffff' },
    emerald: { fill: '#059669', stroke: '#047857', text: '#ffffff' },
    red:     { fill: '#dc2626', stroke: '#b91c1c', text: '#ffffff' },
  };
  const c = colors[color] || colors.slate;
  return (
    <div className="shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
        <path d="M8 12L4 8L10 4L15 2H25L30 4L36 8L32 12V40H8V12Z" fill={c.fill} stroke={c.stroke} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 12L4 8L2 14L6 16L8 12Z" fill={c.fill} stroke={c.stroke} strokeWidth="1" strokeLinejoin="round" />
        <path d="M32 12L36 8L38 14L34 16L32 12Z" fill={c.fill} stroke={c.stroke} strokeWidth="1" strokeLinejoin="round" />
        <path d="M15 2C15 2 17 6 20 6C23 6 25 2 25 2" stroke={c.stroke} strokeWidth="1.5" fill="none" />
        <text x="20" y="29" textAnchor="middle" fill={c.text} fontSize={String(number).length > 2 ? '10' : '13'} fontWeight="900" fontFamily="system-ui, sans-serif">
          {number ?? '?'}
        </text>
      </svg>
    </div>
  );
};

export default function RosterManagement({
  players,
  seasons,
  selectedSeason,
  selectedTeam,
  club,
  currentTeamSeason,
  showToast,
  showConfirm,
  can,
  PERMISSIONS,
  onEditPlayer,
  onAddPlayer,
  onViewPlayer,
  refreshData,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [seasonToggles, setSeasonToggles] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [sortField, setSortField] = useState('lastName');
  const [sortDir, setSortDir] = useState('asc');
  const [complianceFilter, setComplianceFilter] = useState('all'); // all | compliant | non-compliant

  const canEdit = can(PERMISSIONS.TEAM_EDIT_ROSTER);

  // ── Filtered + sorted players ──
  const filteredPlayers = useMemo(() => {
    let list = [...players];

    // Status filter
    if (statusFilter === 'active') list = list.filter(p => p.status === 'active');
    else if (statusFilter === 'archived') list = list.filter(p => p.status === 'archived');

    // Compliance filter
    if (complianceFilter === 'compliant') list = list.filter(p => p.medicalRelease && p.reePlayerWaiver);
    else if (complianceFilter === 'non-compliant') list = list.filter(p => !p.medicalRelease || !p.reePlayerWaiver);

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        (p.jerseyNumber && String(p.jerseyNumber).includes(q)) ||
        p.guardians?.some(g =>
          g.name?.toLowerCase().includes(q) ||
          g.email?.toLowerCase().includes(q) ||
          g.phone?.includes(q)
        )
      );
    }

    // Sort
    list.sort((a, b) => {
      let aVal, bVal;
      if (sortField === 'lastName') { aVal = a.lastName?.toLowerCase() || ''; bVal = b.lastName?.toLowerCase() || ''; }
      else if (sortField === 'firstName') { aVal = a.firstName?.toLowerCase() || ''; bVal = b.firstName?.toLowerCase() || ''; }
      else if (sortField === 'jerseyNumber') { aVal = Number(a.jerseyNumber) || 999; bVal = Number(b.jerseyNumber) || 999; }
      else { aVal = a[sortField]; bVal = b[sortField]; }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [players, searchTerm, statusFilter, complianceFilter, sortField, sortDir]);

  // ── Stats ──
  const activePlayers = players.filter(p => p.status === 'active');
  const archivedPlayers = players.filter(p => p.status === 'archived');
  const compliantCount = activePlayers.filter(p => p.medicalRelease && p.reePlayerWaiver).length;
  const enrolledInSeason = activePlayers.filter(p => p.seasonProfiles?.[selectedSeason]).length;

  // ── Season toggle handling ──
  const handleSeasonToggle = async (playerId, seasonId, isEnrolled) => {
    setIsSaving(true);
    try {
      if (isEnrolled) {
        const ok = await showConfirm(`Remove this player from ${seasonId}? This will remove their season enrollment and any associated fee data for that season.`);
        if (!ok) { setIsSaving(false); return; }
        await supabaseService.removePlayerFromSeason(playerId, seasonId);
        showToast(`Removed from ${seasonId}.`);
      } else {
        await supabaseService.addPlayerToSeason(playerId, seasonId, { feeWaived: false, status: 'active' }, currentTeamSeason?.id || null);
        showToast(`Added to ${seasonId}.`);
      }
      await refreshData();
    } catch (e) {
      console.error('Season toggle failed:', e);
      showToast('Failed to update season enrollment.', true);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Compliance toggle ──
  const handleComplianceToggle = async (playerId, field, currentValue) => {
    try {
      await supabaseService.updatePlayerField(playerId, field, !currentValue);
      await refreshData();
    } catch (e) {
      showToast('Failed to update compliance.', true);
    }
  };

  // ── Archive / Restore ──
  const handleArchiveRestore = async (player) => {
    const isArchiving = player.status === 'active';
    const msg = isArchiving
      ? `Archive ${player.firstName} ${player.lastName}? They will be removed from the active roster but their data will be preserved.`
      : `Restore ${player.firstName} ${player.lastName} to the active roster?`;
    const ok = await showConfirm(msg);
    if (!ok) return;
    try {
      await supabaseService.updatePlayerField(player.id, 'status', isArchiving ? 'archived' : 'active');
      await refreshData();
      showToast(`${player.firstName} ${isArchiving ? 'archived' : 'restored'}.`);
    } catch (e) {
      showToast('Failed.', true);
    }
  };

  // ── Bulk upload complete ──
  const handleBulkUploadComplete = async () => {
    setShowBulkUpload(false);
    await refreshData();
    showToast('Roster import complete!');
  };

  // ── Export CSV ──
  const handleExportCSV = () => {
    const rows = [['First Name', 'Last Name', 'Jersey #', 'Status', 'Medical Release', 'ReePlayer Waiver', 'Guardian 1 Name', 'Guardian 1 Email', 'Guardian 1 Phone', 'Guardian 2 Name', 'Guardian 2 Email', 'Guardian 2 Phone']];
    filteredPlayers.forEach(p => {
      const g1 = p.guardians?.[0] || {};
      const g2 = p.guardians?.[1] || {};
      rows.push([
        p.firstName, p.lastName, p.jerseyNumber || '', p.status,
        p.medicalRelease ? 'Yes' : 'No', p.reePlayerWaiver ? 'Yes' : 'No',
        g1.name || '', g1.email || '', g1.phone || '',
        g2.name || '', g2.email || '', g2.phone || '',
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTeam?.name || 'roster'}_roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Sort handler ──
  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={10} className="text-slate-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-blue-600" />
      : <ChevronDown size={10} className="text-blue-600" />;
  };

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Users size={22} className="text-blue-600" /> Roster Management
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage all players, contacts, and season enrollment for {selectedTeam?.name || 'your team'}.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
              <Upload size={14} /> Import CSV
            </button>
            <button onClick={onAddPlayer}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-all shadow-sm">
              <Plus size={14} /> Add Player
            </button>
          </div>
        )}
      </div>

      {/* ── STATS ROW ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <p className="text-2xl font-black text-slate-800">{activePlayers.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Active</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <p className="text-2xl font-black text-blue-600">{enrolledInSeason}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">In {selectedSeason}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <p className={`text-2xl font-black ${compliantCount === activePlayers.length ? 'text-emerald-600' : 'text-amber-600'}`}>{compliantCount}/{activePlayers.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Compliant</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <p className="text-2xl font-black text-slate-400">{archivedPlayers.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Archived</p>
        </div>
      </div>

      {/* ── SEARCH + FILTERS ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
            <input type="text" placeholder="Search players, guardians, phone, email..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All Players</option>
            </select>
            <select value={complianceFilter} onChange={e => setComplianceFilter(e.target.value)}
              className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none">
              <option value="all">All Compliance</option>
              <option value="compliant">Compliant</option>
              <option value="non-compliant">Missing Items</option>
            </select>
          </div>
        </div>

        {/* ── TABLE HEADER ── */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-y border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <div className="col-span-1 flex items-center gap-1 cursor-pointer select-none" onClick={() => handleSort('jerseyNumber')}>
            # <SortIcon field="jerseyNumber" />
          </div>
          <div className="col-span-3 flex items-center gap-1 cursor-pointer select-none" onClick={() => handleSort('lastName')}>
            Player <SortIcon field="lastName" />
          </div>
          <div className="col-span-3">Contacts</div>
          <div className="col-span-2">Compliance</div>
          <div className="col-span-2">Seasons</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {/* ── PLAYER ROWS ── */}
        {filteredPlayers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 font-bold italic">
            {searchTerm ? 'No players match your search.' : statusFilter === 'archived' ? 'No archived players.' : 'No players on this roster yet.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPlayers.map(player => {
              const isExpanded = expandedPlayerId === player.id;
              const isCompliant = player.medicalRelease && player.reePlayerWaiver;
              const enrolledSeasons = Object.keys(player.seasonProfiles || {});
              const isArchived = player.status === 'archived';

              return (
                <div key={player.id} className={`${isArchived ? 'opacity-60' : ''}`}>
                  {/* ── Main Row ── */}
                  <div
                    className={`grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}
                    onClick={() => setExpandedPlayerId(isExpanded ? null : player.id)}
                  >
                    {/* Jersey */}
                    <div className="hidden md:flex col-span-1 items-center">
                      <JerseyBadge number={player.jerseyNumber} size={32} color={isArchived ? 'slate' : isCompliant ? 'slate' : 'amber'} />
                    </div>

                    {/* Name */}
                    <div className="col-span-1 md:col-span-3 flex items-center gap-3">
                      <div className="md:hidden">
                        <JerseyBadge number={player.jerseyNumber} size={32} color={isArchived ? 'slate' : isCompliant ? 'slate' : 'amber'} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">
                          {player.lastName}, {player.firstName}
                        </p>
                        {isArchived && (
                          <span className="text-[8px] font-black bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded uppercase">Archived</span>
                        )}
                      </div>
                    </div>

                    {/* Contacts (desktop) */}
                    <div className="hidden md:block col-span-3">
                      {player.guardians?.length > 0 ? (
                        <div className="space-y-0.5">
                          {player.guardians.slice(0, 2).map((g, i) => (
                            <p key={i} className="text-[11px] text-slate-500 truncate">
                              <span className="font-bold text-slate-600">{g.name}</span>
                              {g.email && <span className="text-slate-400"> · {g.email}</span>}
                            </p>
                          ))}
                          {player.guardians.length > 2 && (
                            <p className="text-[10px] text-blue-500 font-bold">+{player.guardians.length - 2} more</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-300 italic">No contacts</p>
                      )}
                    </div>

                    {/* Compliance (desktop) */}
                    <div className="hidden md:flex col-span-2 items-center gap-1.5">
                      {isCompliant ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                          <ShieldCheck size={12} /> Complete
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                          <AlertCircle size={12} />
                          {!player.medicalRelease && !player.reePlayerWaiver ? '2 missing' : '1 missing'}
                        </span>
                      )}
                    </div>

                    {/* Seasons (desktop) */}
                    <div className="hidden md:flex col-span-2 flex-wrap gap-1">
                      {enrolledSeasons.length > 0 ? enrolledSeasons.map(sid => (
                        <span key={sid} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${sid === selectedSeason ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          {sid}
                        </span>
                      )) : (
                        <span className="text-[10px] text-slate-300 italic">None</span>
                      )}
                    </div>

                    {/* Expand indicator */}
                    <div className="hidden md:flex col-span-1 justify-end">
                      {isExpanded ? <ChevronUp size={14} className="text-blue-500" /> : <ChevronDown size={14} className="text-slate-300" />}
                    </div>
                  </div>

                  {/* ── Expanded Detail Panel ── */}
                  {isExpanded && (
                    <div className="bg-slate-50/50 border-t border-slate-100 p-4 md:px-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* ── Contacts Section ── */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <UserPlus size={12} /> Guardians / Contacts
                          </h4>
                          {player.guardians?.length > 0 ? (
                            <div className="space-y-3">
                              {player.guardians.map((g, i) => (
                                <div key={g.id || i} className="space-y-1">
                                  <p className="text-sm font-bold text-slate-800">{g.name}</p>
                                  {g.email && (
                                    <a href={`mailto:${g.email}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800">
                                      <Mail size={11} /> {g.email}
                                    </a>
                                  )}
                                  {g.phone && (
                                    <a href={`tel:${g.phone}`} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
                                      <Phone size={11} /> {g.phone}
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic">No guardians on file.</p>
                          )}
                        </div>

                        {/* ── Compliance Section ── */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <Shield size={12} /> Compliance
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-600">Medical Release</span>
                              {canEdit ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleComplianceToggle(player.id, 'medicalRelease', player.medicalRelease); }}
                                  className={`w-8 h-5 rounded-full transition-colors relative ${player.medicalRelease ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${player.medicalRelease ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                </button>
                              ) : (
                                player.medicalRelease
                                  ? <ShieldCheck size={16} className="text-emerald-500" />
                                  : <ShieldX size={16} className="text-red-400" />
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-600">ReePlayer Waiver</span>
                              {canEdit ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleComplianceToggle(player.id, 'reePlayerWaiver', player.reePlayerWaiver); }}
                                  className={`w-8 h-5 rounded-full transition-colors relative ${player.reePlayerWaiver ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${player.reePlayerWaiver ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                </button>
                              ) : (
                                player.reePlayerWaiver
                                  ? <ShieldCheck size={16} className="text-emerald-500" />
                                  : <ShieldX size={16} className="text-red-400" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ── Season Enrollment Section ── */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <Calendar size={12} /> Season Enrollment
                          </h4>
                          <div className="space-y-2">
                            {seasons.map(s => {
                              const isEnrolled = !!player.seasonProfiles?.[s.id];
                              return (
                                <div key={s.id} className="flex items-center justify-between">
                                  <span className={`text-xs font-bold ${isEnrolled ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {s.id}
                                    {s.id === selectedSeason && <span className="text-[8px] text-blue-500 ml-1">(current)</span>}
                                  </span>
                                  {canEdit ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSeasonToggle(player.id, s.id, isEnrolled); }}
                                      disabled={isSaving}
                                      className={`w-8 h-5 rounded-full transition-colors relative ${isEnrolled ? 'bg-blue-500' : 'bg-slate-300'} disabled:opacity-50`}
                                    >
                                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isEnrolled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                    </button>
                                  ) : (
                                    isEnrolled
                                      ? <Check size={14} className="text-blue-500" />
                                      : <X size={14} className="text-slate-300" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* ── Action Buttons ── */}
                      {canEdit && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                          <button onClick={(e) => { e.stopPropagation(); onEditPlayer(player); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                            <Edit size={12} /> Edit Player
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); onViewPlayer(player); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                            <Users size={12} /> Full Profile
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleArchiveRestore(player); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                              isArchived ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-red-500 bg-red-50 hover:bg-red-100'
                            }`}>
                            {isArchived ? <><RotateCcw size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer count ── */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-[10px] font-bold text-slate-400">
          Showing {filteredPlayers.length} of {players.length} players
        </div>
      </div>

      {/* ── BULK UPLOAD MODAL ── */}
      <BulkUploadModal
        show={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onComplete={handleBulkUploadComplete}
        selectedTeam={selectedTeam}
        club={club}
        selectedSeason={selectedSeason}
        currentTeamSeason={currentTeamSeason}
        existingPlayers={players}
        showToast={showToast}
      />
    </div>
  );
}
