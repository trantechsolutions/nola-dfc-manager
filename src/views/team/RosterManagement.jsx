import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Plus,
  Upload,
  Edit,
  Archive,
  RotateCcw,
  Mail,
  Phone,
  Shield,
  ShieldCheck,
  ShieldX,
  UserPlus,
  X,
  Check,
  AlertCircle,
  Download,
  Calendar,
  Trash2,
  Copy,
  Eye,
  FileText,
  FolderOpen,
  Heart,
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup, getAge } from '../../utils/ageGroup';
import { DOC_TYPE_LABELS, DOC_STATUS_COLORS } from '../../utils/constants';
import JerseyBadge from '../../components/JerseyBadge';
import BulkUploadModal from '../../components/BulkUploadModal';
import MedicalReleaseForm from '../../components/MedicalReleaseForm';

const STATUS_COLORS = DOC_STATUS_COLORS;

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
  onViewAsParent,
  refreshData,
}) {
  const { t } = useT();
  const [searchTerm, setSearchTerm] = useState('');
  const ROSTER_PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sortField, setSortField] = useState('lastName');
  const [sortDir, setSortDir] = useState('asc');
  const [complianceFilter, setComplianceFilter] = useState('all'); // all | compliant | non-compliant
  const [playerDocs, setPlayerDocs] = useState({}); // { playerId: docs[] }
  const [medicalPlayer, setMedicalPlayer] = useState(null); // player to show medical form for
  const [docsLoading, setDocsLoading] = useState(null); // playerId currently loading

  const canEdit = can(PERMISSIONS.TEAM_EDIT_ROSTER);

  // ── Fetch docs when a player row is expanded ──
  const loadPlayerDocs = useCallback(async (playerId, _force = false) => {
    if (!playerId) return;
    setDocsLoading(playerId);
    try {
      const docs = await supabaseService.getPlayerDocuments(playerId);
      setPlayerDocs((prev) => ({ ...prev, [playerId]: docs }));
    } catch (e) {
      console.error('Failed to fetch documents', e);
    } finally {
      setDocsLoading(null);
    }
  }, []);

  // Fetch docs when expanded player changes (only if not cached)
  useEffect(() => {
    if (expandedPlayerId && !playerDocs[expandedPlayerId]) loadPlayerDocs(expandedPlayerId);
  }, [expandedPlayerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewDoc = async (filePath) => {
    try {
      const url = await supabaseService.getDocumentUrl(filePath);
      if (url) window.open(url, '_blank');
      else showToast?.('Failed to open document', true);
    } catch {
      showToast?.('Failed to open document', true);
    }
  };

  const handleDeleteDoc = async (doc) => {
    const ok = await showConfirm?.(`Delete "${doc.title}"?`);
    if (!ok) return;
    try {
      await supabaseService.deleteDocument(doc.id, doc.filePath);
      if (doc.docType === 'medical_release') {
        const existing = playerDocs[doc.playerId] || [];
        const remaining = existing.filter(
          (d) => d.id !== doc.id && d.docType === 'medical_release' && ['uploaded', 'verified'].includes(d.status),
        );
        if (remaining.length === 0) {
          await supabaseService.updatePlayerField(doc.playerId, 'medicalRelease', false);
          await refreshData();
        }
      }
      showToast?.('Document deleted');
      loadPlayerDocs(doc.playerId);
    } catch {
      showToast?.('Failed to delete document', true);
    }
  };

  // ── Filtered + sorted players ──
  const filteredPlayers = useMemo(() => {
    let list = [...players];

    // Status filter
    if (statusFilter === 'active') list = list.filter((p) => p.status === 'active');
    else if (statusFilter === 'archived') list = list.filter((p) => p.status === 'archived');

    // Compliance filter
    if (complianceFilter === 'compliant') list = list.filter((p) => p.medicalRelease && p.reePlayerWaiver);
    else if (complianceFilter === 'non-compliant') list = list.filter((p) => !p.medicalRelease || !p.reePlayerWaiver);

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          (p.jerseyNumber && String(p.jerseyNumber).includes(q)) ||
          p.guardians?.some(
            (g) => g.name?.toLowerCase().includes(q) || g.email?.toLowerCase().includes(q) || g.phone?.includes(q),
          ),
      );
    }

    // Sort
    list.sort((a, b) => {
      let aVal, bVal;
      if (sortField === 'lastName') {
        aVal = a.lastName?.toLowerCase() || '';
        bVal = b.lastName?.toLowerCase() || '';
      } else if (sortField === 'firstName') {
        aVal = a.firstName?.toLowerCase() || '';
        bVal = b.firstName?.toLowerCase() || '';
      } else if (sortField === 'jerseyNumber') {
        aVal = Number(a.jerseyNumber) || 999;
        bVal = Number(b.jerseyNumber) || 999;
      } else {
        aVal = a[sortField];
        bVal = b[sortField];
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [players, searchTerm, statusFilter, complianceFilter, sortField, sortDir]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, complianceFilter, sortField, sortDir]);

  const totalRosterPages = Math.ceil(filteredPlayers.length / ROSTER_PAGE_SIZE);
  const pagedPlayers = filteredPlayers.slice((currentPage - 1) * ROSTER_PAGE_SIZE, currentPage * ROSTER_PAGE_SIZE);

  // ── Stats ──
  const activePlayers = players.filter((p) => p.status === 'active');
  const archivedPlayers = players.filter((p) => p.status === 'archived');
  const compliantCount = activePlayers.filter((p) => p.medicalRelease && p.reePlayerWaiver).length;
  const enrolledInSeason = activePlayers.filter((p) => p.seasonProfiles?.[selectedSeason]).length;

  // ── Season toggle handling ──
  const handleSeasonToggle = async (playerId, seasonId, isEnrolled) => {
    setIsSaving(true);
    try {
      if (isEnrolled) {
        const ok = await showConfirm(t('rosterMgmt.removeFromSeason', { season: seasonId }));
        if (!ok) {
          setIsSaving(false);
          return;
        }
        await supabaseService.removePlayerFromSeason(playerId, seasonId);
        showToast(t('rosterMgmt.removedFromSeason', { season: seasonId }));
      } else {
        await supabaseService.addPlayerToSeason(
          playerId,
          seasonId,
          { feeWaived: false, status: 'active' },
          currentTeamSeason?.id || null,
        );
        showToast(t('rosterMgmt.addedToSeason', { season: seasonId }));
      }
      await refreshData();
    } catch (e) {
      console.error('Season toggle failed:', e);
      showToast(t('rosterMgmt.enrollmentFailed'), true);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Compliance toggle ──
  const handleComplianceToggle = async (playerId, field, currentValue) => {
    try {
      await supabaseService.updatePlayerField(playerId, field, !currentValue);
      await refreshData();
    } catch {
      showToast('Failed to update compliance.', true);
    }
  };

  // ── Archive / Restore ──
  const handleArchiveRestore = async (player) => {
    const isArchiving = player.status === 'active';
    const name = `${player.firstName} ${player.lastName}`;
    const msg = isArchiving ? t('rosterMgmt.archiveConfirm', { name }) : t('rosterMgmt.restoreConfirm', { name });
    const ok = await showConfirm(msg);
    if (!ok) return;
    try {
      await supabaseService.updatePlayerField(player.id, 'status', isArchiving ? 'archived' : 'active');
      await refreshData();
      showToast(`${player.firstName} ${isArchiving ? 'archived' : 'restored'}.`);
    } catch {
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
    const rows = [
      [
        'First Name',
        'Last Name',
        'Jersey #',
        'Status',
        'Date of Birth',
        'Age Group',
        'Medical Release',
        'ReePlayer Waiver',
        'Guardian 1 Name',
        'Guardian 1 Email',
        'Guardian 1 Phone',
        'Guardian 2 Name',
        'Guardian 2 Email',
        'Guardian 2 Phone',
      ],
    ];
    filteredPlayers.forEach((p) => {
      const g1 = p.guardians?.[0] || {};
      const g2 = p.guardians?.[1] || {};
      rows.push([
        p.firstName,
        p.lastName,
        p.jerseyNumber || '',
        p.status,
        p.birthdate || '',
        getUSAgeGroup(p.birthdate, selectedSeason) || '',
        p.medicalRelease ? 'Yes' : 'No',
        p.reePlayerWaiver ? 'Yes' : 'No',
        g1.name || '',
        g1.email || '',
        g1.phone || '',
        g2.name || '',
        g2.email || '',
        g2.phone || '',
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
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
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={10} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={10} className="text-blue-600" />
    ) : (
      <ChevronDown size={10} className="text-blue-600" />
    );
  };

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={22} className="text-blue-600" /> Roster Management
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Manage all players, contacts, and season enrollment for {selectedTeam?.name || 'your team'}.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              <Upload size={14} /> {t('rosterMgmt.bulkUpload')}
            </button>
            <button
              onClick={onAddPlayer}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-slate-900 dark:bg-blue-600 rounded-xl hover:bg-slate-800 dark:hover:bg-blue-700 transition-all shadow-sm dark:shadow-none"
            >
              <Plus size={14} /> {t('rosterMgmt.addPlayer')}
            </button>
          </div>
        )}
      </div>

      {/* ── STATS ROW ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-center">
          <p className="text-2xl font-black text-slate-800 dark:text-white">{activePlayers.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Active</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-center">
          <p className="text-2xl font-black text-blue-600">{enrolledInSeason}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">In {selectedSeason}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-center">
          <p
            className={`text-2xl font-black ${compliantCount === activePlayers.length ? 'text-emerald-600' : 'text-amber-600'}`}
          >
            {compliantCount}/{activePlayers.length}
          </p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Compliant</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-center">
          <p className="text-2xl font-black text-slate-400 dark:text-slate-500">{archivedPlayers.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Archived</p>
        </div>
      </div>

      {/* ── SEARCH + FILTERS ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-2.5 text-slate-300 dark:text-slate-600" size={16} />
            <input
              type="text"
              placeholder={t('rosterMgmt.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 outline-none"
            >
              <option value="active">{t('common.active')}</option>
              <option value="archived">{t('common.archived')}</option>
              <option value="all">{t('common.all')}</option>
            </select>
            <select
              value={complianceFilter}
              onChange={(e) => setComplianceFilter(e.target.value)}
              className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 outline-none"
            >
              <option value="all">{t('common.all')}</option>
              <option value="compliant">{t('rosterMgmt.compliant')}</option>
              <option value="non-compliant">{t('rosterMgmt.nonCompliant')}</option>
            </select>
          </div>
        </div>

        {/* ── TABLE HEADER ── */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 border-y border-slate-100 dark:border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <div
            className="col-span-1 flex items-center gap-1 cursor-pointer select-none"
            onClick={() => handleSort('jerseyNumber')}
          >
            # <SortIcon field="jerseyNumber" />
          </div>
          <div
            className="col-span-3 flex items-center gap-1 cursor-pointer select-none"
            onClick={() => handleSort('lastName')}
          >
            Player <SortIcon field="lastName" />
          </div>
          <div className="col-span-3">Contacts</div>
          <div className="col-span-2">Compliance</div>
          <div className="col-span-2">Seasons</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {/* ── PLAYER ROWS ── */}
        {filteredPlayers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-bold italic">
            {searchTerm
              ? 'No players match your search.'
              : statusFilter === 'archived'
                ? 'No archived players.'
                : 'No players on this roster yet.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {pagedPlayers.map((player) => {
              const isExpanded = expandedPlayerId === player.id;
              const isCompliant = player.medicalRelease && player.reePlayerWaiver;
              const enrolledSeasons = Object.keys(player.seasonProfiles || {});
              const isArchived = player.status === 'archived';

              return (
                <div key={player.id} className={`${isArchived ? 'opacity-60' : ''}`}>
                  {/* ── Main Row ── */}
                  <div
                    className={`grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors ${isExpanded ? 'bg-blue-50/30 dark:bg-blue-900/20' : ''}`}
                    onClick={() => setExpandedPlayerId(isExpanded ? null : player.id)}
                  >
                    {/* Jersey */}
                    <div className="hidden md:flex col-span-1 items-center">
                      <JerseyBadge
                        number={player.jerseyNumber}
                        size={32}
                        color={isArchived ? 'slate' : isCompliant ? 'slate' : 'amber'}
                      />
                    </div>

                    {/* Name */}
                    <div className="col-span-1 md:col-span-3 flex items-center gap-3">
                      <div className="md:hidden">
                        <JerseyBadge
                          number={player.jerseyNumber}
                          size={32}
                          color={isArchived ? 'slate' : isCompliant ? 'slate' : 'amber'}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate flex items-center gap-2">
                          {player.lastName}, {player.firstName}
                          {player.birthdate && getUSAgeGroup(player.birthdate, selectedSeason) && (
                            <span className="text-[9px] font-black bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                              {getUSAgeGroup(player.birthdate, selectedSeason)}
                            </span>
                          )}
                        </p>
                        {player.birthdate && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {t('playerForm.age')} {getAge(player.birthdate)} &middot; DOB{' '}
                            {new Date(player.birthdate).toLocaleDateString()}
                          </p>
                        )}
                        {isArchived && (
                          <span className="text-[8px] font-black bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded uppercase">
                            Archived
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contacts (desktop) */}
                    <div className="hidden md:block col-span-3">
                      {player.guardians?.length > 0 ? (
                        <div className="space-y-0.5">
                          {player.guardians.slice(0, 2).map((g, i) => (
                            <p key={i} className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              <span className="font-bold text-slate-600 dark:text-slate-300">{g.name}</span>
                              {g.email && <span className="text-slate-400 dark:text-slate-500"> · {g.email}</span>}
                            </p>
                          ))}
                          {player.guardians.length > 2 && (
                            <p className="text-[10px] text-blue-500 font-bold">+{player.guardians.length - 2} more</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-300 dark:text-slate-600 italic">No contacts</p>
                      )}
                    </div>

                    {/* Compliance (desktop) */}
                    <div className="hidden md:flex col-span-2 items-center gap-1.5">
                      {isCompliant ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-lg">
                          <ShieldCheck size={12} /> Complete
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-lg">
                          <AlertCircle size={12} />
                          {!player.medicalRelease && !player.reePlayerWaiver ? '2 missing' : '1 missing'}
                        </span>
                      )}
                    </div>

                    {/* Seasons (desktop) */}
                    <div className="hidden md:flex col-span-2 flex-wrap gap-1">
                      {enrolledSeasons.length > 0 ? (
                        enrolledSeasons.map((sid) => (
                          <span
                            key={sid}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${sid === selectedSeason ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
                          >
                            {sid}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 italic">None</span>
                      )}
                    </div>

                    {/* Expand indicator */}
                    <div className="hidden md:flex col-span-1 justify-end">
                      {isExpanded ? (
                        <ChevronUp size={14} className="text-blue-500" />
                      ) : (
                        <ChevronDown size={14} className="text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </div>

                  {/* ── Expanded Detail Panel ── */}
                  {isExpanded && (
                    <div className="bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 p-4 md:px-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* ── Contacts Section ── */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <UserPlus size={12} /> Guardians / Contacts
                          </h4>
                          {player.guardians?.length > 0 ? (
                            <div className="space-y-3">
                              {player.guardians.map((g, i) => (
                                <div key={g.id || i} className="space-y-1">
                                  <p className="text-sm font-bold text-slate-800 dark:text-white">{g.name}</p>
                                  {g.email && (
                                    <a
                                      href={`mailto:${g.email}`}
                                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                                    >
                                      <Mail size={11} /> {g.email}
                                    </a>
                                  )}
                                  {g.phone && (
                                    <a
                                      href={`tel:${g.phone}`}
                                      className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    >
                                      <Phone size={11} /> {g.phone}
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No guardians on file.</p>
                          )}
                        </div>

                        {/* ── Compliance Section ── */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <Shield size={12} /> Compliance
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                  {t('medical.medicalRelease')}
                                </span>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                  {player.medicalRelease
                                    ? t('parent.completedOnFile')
                                    : t('parent.requiredNotSubmitted')}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMedicalPlayer(player);
                                }}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                                  player.medicalRelease
                                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                                    : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60'
                                }`}
                              >
                                {player.medicalRelease
                                  ? t('playerModal.onFile') + ' ✎'
                                  : t('playerModal.fillOut') + ' →'}
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                ReePlayer Waiver
                              </span>
                              {canEdit ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleComplianceToggle(player.id, 'reePlayerWaiver', player.reePlayerWaiver);
                                  }}
                                  className={`w-8 h-5 rounded-full transition-colors relative ${player.reePlayerWaiver ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                                >
                                  <div
                                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${player.reePlayerWaiver ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                                  />
                                </button>
                              ) : player.reePlayerWaiver ? (
                                <ShieldCheck size={16} className="text-emerald-500" />
                              ) : (
                                <ShieldX size={16} className="text-red-400" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ── Season Enrollment Section ── */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <Calendar size={12} /> {t('rosterMgmt.seasonEnrollment')}
                          </h4>
                          <div className="space-y-2">
                            {seasons.map((s) => {
                              const isEnrolled = !!player.seasonProfiles?.[s.id];
                              return (
                                <div key={s.id} className="flex items-center justify-between">
                                  <span
                                    className={`text-xs font-bold ${isEnrolled ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}
                                  >
                                    {s.id}
                                    {s.id === selectedSeason && (
                                      <span className="text-[8px] text-blue-500 ml-1">(current)</span>
                                    )}
                                  </span>
                                  {canEdit ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSeasonToggle(player.id, s.id, isEnrolled);
                                      }}
                                      disabled={isSaving}
                                      className={`w-8 h-5 rounded-full transition-colors relative ${isEnrolled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'} disabled:opacity-50`}
                                    >
                                      <div
                                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isEnrolled ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                                      />
                                    </button>
                                  ) : isEnrolled ? (
                                    <Check size={14} className="text-blue-500" />
                                  ) : (
                                    <X size={14} className="text-slate-300 dark:text-slate-600" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* ── Documents Section ── */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <FolderOpen size={12} /> {t('parent.documents')}{' '}
                          {playerDocs[player.id] ? `(${playerDocs[player.id].length})` : ''}
                        </h4>
                        {docsLoading === player.id ? (
                          <p className="text-xs text-slate-300 dark:text-slate-600 font-bold animate-pulse py-2">
                            {t('common.loading')}...
                          </p>
                        ) : !playerDocs[player.id] || playerDocs[player.id].length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2">
                            {t('parent.noDocuments')}
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {playerDocs[player.id].map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700"
                              >
                                <FileText size={13} className="text-slate-400 shrink-0" />
                                <div className="flex-grow min-w-0">
                                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                                    {doc.title}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">
                                      {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                                    </span>
                                    <span
                                      className={`text-[8px] font-black uppercase px-1 py-0.5 rounded ${STATUS_COLORS[doc.status] || 'bg-slate-100 text-slate-500'}`}
                                    >
                                      {doc.status}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewDoc(doc.filePath);
                                    }}
                                    className="p-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    title={t('common.view')}
                                  >
                                    <Eye size={13} />
                                  </button>
                                  {canEdit && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteDoc(doc);
                                      }}
                                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                      title={t('common.delete')}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ── Action Buttons ── */}
                      {canEdit && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditPlayer(player);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                          >
                            <Edit size={12} /> Edit Player
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewPlayer(player);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Users size={12} /> Full Profile
                          </button>
                          {onViewAsParent && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewAsParent(player);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
                            >
                              <Eye size={12} /> {t('impersonation.viewAsParent')}
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchiveRestore(player);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                              isArchived
                                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                                : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50'
                            }`}
                          >
                            {isArchived ? (
                              <>
                                <RotateCcw size={12} /> Restore
                              </>
                            ) : (
                              <>
                                <Archive size={12} /> Archive
                              </>
                            )}
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

        {/* ── Footer count + pagination ── */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400">
            Showing {Math.min((currentPage - 1) * ROSTER_PAGE_SIZE + 1, filteredPlayers.length)}–
            {Math.min(currentPage * ROSTER_PAGE_SIZE, filteredPlayers.length)} of {filteredPlayers.length}{' '}
            {filteredPlayers.length === 1 ? t('common.player') : t('common.players')}
          </span>
          {totalRosterPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs font-bold text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:text-blue-500 transition-colors"
              >
                ‹ Prev
              </button>
              <span className="text-[10px] font-bold text-slate-400">
                {currentPage} / {totalRosterPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalRosterPages, p + 1))}
                disabled={currentPage === totalRosterPages}
                className="px-2 py-1 text-xs font-bold text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:text-blue-500 transition-colors"
              >
                Next ›
              </button>
            </div>
          )}
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

      {/* ── MEDICAL RELEASE FORM MODAL ── */}
      <MedicalReleaseForm
        show={!!medicalPlayer}
        onClose={() => setMedicalPlayer(null)}
        player={medicalPlayer}
        clubId={club?.id}
        seasonId={selectedSeason}
        onCompleted={() => {
          setMedicalPlayer(null);
          refreshData();
          if (medicalPlayer) loadPlayerDocs(medicalPlayer.id);
        }}
      />
    </div>
  );
}
