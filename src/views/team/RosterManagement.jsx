import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
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
  Shirt,
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup, getAge, formatDateOnly } from '../../utils/ageGroup';
import { formatPhone, phoneDigits, phoneHref } from '../../utils/phone';
import { getCompliance, isFullyCompliant } from '../../utils/compliance';
import { DOC_TYPE_LABELS, DOC_STATUS_COLORS } from '../../utils/constants';
import JerseyBadge from '../../components/JerseyBadge';
import DirectoryCard, { DetailRow, EmptyRow } from '../../components/layout/DirectoryCard';
import { DirectoryToolbar, SearchInput, FilterSelect, ToolbarButton } from '../../components/layout/DirectoryControls';
import { paginate } from '../../utils/pagination';
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
  const { t, tp } = useT();
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
          await supabaseService.setSeasonCompliance(doc.playerId, selectedSeason, 'medicalRelease', false);
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

    // Compliance filter (per selected season)
    if (complianceFilter === 'compliant') {
      list = list.filter((p) => isFullyCompliant(p, selectedSeason));
    } else if (complianceFilter === 'non-compliant') {
      list = list.filter((p) => !isFullyCompliant(p, selectedSeason));
    }

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const qDigits = phoneDigits(searchTerm);
      list = list.filter(
        (p) =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          (p.jerseyNumber && String(p.jerseyNumber).includes(q)) ||
          p.guardians?.some(
            (g) =>
              g.name?.toLowerCase().includes(q) ||
              g.email?.toLowerCase().includes(q) ||
              (qDigits && phoneDigits(g.phone).includes(qDigits)),
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
  }, [players, searchTerm, statusFilter, complianceFilter, sortField, sortDir, selectedSeason]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, complianceFilter, sortField, sortDir]);

  const {
    slice: pagedPlayers,
    page: rosterPage,
    pageCount: totalRosterPages,
    total: rosterTotal,
    from: rosterFrom,
    to: rosterTo,
  } = paginate(filteredPlayers, currentPage, ROSTER_PAGE_SIZE);

  // ── Stats ──
  const activePlayers = players.filter((p) => p.status === 'active');
  const archivedPlayers = players.filter((p) => p.status === 'archived');
  const compliantCount = activePlayers.filter((p) => isFullyCompliant(p, selectedSeason)).length;
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
      await supabaseService.setSeasonCompliance(playerId, selectedSeason, field, !currentValue);
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
        'Shirt Size',
        'Siblings',
        'Medical Release',
        'ReePlayer Waiver',
        'Club Registration',
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
      const comp = getCompliance(p, selectedSeason);
      rows.push([
        p.firstName,
        p.lastName,
        p.jerseyNumber || '',
        p.status,
        p.birthdate || '',
        getUSAgeGroup(p.birthdate, selectedSeason) || '',
        p.shirtSize || '',
        p.siblingsCount ?? '',
        comp.medicalRelease ? 'Yes' : 'No',
        comp.reePlayerWaiver ? 'Yes' : 'No',
        comp.clubRegistration ? 'Yes' : 'No',
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

  // `className` is repeated on the matching <td> so a column hides as a whole.
  const columns = [
    {
      key: 'jersey',
      label: '#',
      className: 'hidden md:table-cell',
      sortable: true,
      sortDir: sortField === 'jerseyNumber' ? sortDir : null,
      onSort: () => handleSort('jerseyNumber'),
    },
    {
      key: 'player',
      label: 'Player',
      sortable: true,
      sortDir: sortField === 'lastName' ? sortDir : null,
      onSort: () => handleSort('lastName'),
    },
    { key: 'contacts', label: 'Contacts', className: 'hidden md:table-cell' },
    { key: 'compliance', label: 'Compliance', className: 'hidden md:table-cell' },
    { key: 'seasons', label: 'Seasons', className: 'hidden md:table-cell' },
    { key: 'actions', label: '', align: 'right' },
  ];

  // ── Sort handler ──
  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs font-semibold text-muted-foreground">
        {selectedTeam?.name} · {activePlayers.length} active · {enrolledInSeason} in {selectedSeason} · {compliantCount}
        /{activePlayers.length} compliant · {archivedPlayers.length} archived
      </p>

      <DirectoryCard
        title="Player Directory"
        columns={columns}
        noun={tp('common.player', 1)}
        nounPlural={tp('common.player', 2)}
        page={rosterPage}
        pageCount={totalRosterPages}
        total={rosterTotal}
        from={rosterFrom}
        to={rosterTo}
        onPageChange={setCurrentPage}
        toolbar={
          <DirectoryToolbar>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder={t('rosterMgmt.searchPlaceholder')}
              label="Search players"
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              label="Filter by status"
              options={[
                { value: 'active', label: t('common.active') },
                { value: 'archived', label: t('common.archived') },
                { value: 'all', label: t('common.all') },
              ]}
            />
            <FilterSelect
              value={complianceFilter}
              onChange={setComplianceFilter}
              label="Filter by compliance"
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'compliant', label: t('rosterMgmt.compliant') },
                { value: 'non-compliant', label: t('rosterMgmt.nonCompliant') },
              ]}
            />
            {canEdit && (
              <>
                <ToolbarButton icon={Download} onClick={handleExportCSV}>
                  Export
                </ToolbarButton>
                <ToolbarButton icon={Upload} onClick={() => setShowBulkUpload(true)}>
                  {t('rosterMgmt.bulkUpload')}
                </ToolbarButton>
                <ToolbarButton icon={Plus} tone="primary" onClick={onAddPlayer}>
                  {t('rosterMgmt.addPlayer')}
                </ToolbarButton>
              </>
            )}
          </DirectoryToolbar>
        }
      >
        {filteredPlayers.length === 0 ? (
          <EmptyRow colSpan={6}>
            {searchTerm
              ? 'No players match your search.'
              : statusFilter === 'archived'
                ? 'No archived players.'
                : 'No players on this roster yet.'}
          </EmptyRow>
        ) : (
          pagedPlayers.map((player) => {
            const isExpanded = expandedPlayerId === player.id;
            const comp = getCompliance(player, selectedSeason);
            const missingCount = Object.values(comp).filter((v) => !v).length;
            const isCompliant = missingCount === 0;
            const enrolledSeasons = Object.keys(player.seasonProfiles || {});
            const isArchived = player.status === 'archived';

            return (
              <React.Fragment key={player.id}>
                {/* Main row — clicking anywhere toggles the detail panel */}
                <tr
                  className={`cursor-pointer border-b border-border align-middle transition-colors hover:bg-foreground/[0.03] ${isArchived ? 'opacity-60' : ''} ${isExpanded ? 'bg-foreground/[0.03]' : ''}`}
                  onClick={() => setExpandedPlayerId(isExpanded ? null : player.id)}
                >
                  {/* Jersey */}
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <JerseyBadge
                      number={player.jerseyNumber}
                      size={32}
                      color={isArchived ? 'slate' : isCompliant ? 'slate' : 'amber'}
                    />
                  </td>

                  {/* Name */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="md:hidden">
                        <JerseyBadge
                          number={player.jerseyNumber}
                          size={32}
                          color={isArchived ? 'slate' : isCompliant ? 'slate' : 'amber'}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                          {player.lastName}, {player.firstName}
                          {player.birthdate && getUSAgeGroup(player.birthdate, selectedSeason) && (
                            <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                              {getUSAgeGroup(player.birthdate, selectedSeason)}
                            </span>
                          )}
                        </p>
                        {player.birthdate && (
                          <p className="text-xs text-muted-foreground">
                            {t('playerForm.age')} {getAge(player.birthdate)} &middot; DOB{' '}
                            {formatDateOnly(player.birthdate)}
                          </p>
                        )}
                        {isArchived && (
                          <span className="text-xs font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded uppercase">
                            Archived
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Contacts (desktop) */}
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    {player.guardians?.length > 0 ? (
                      <div className="space-y-0.5">
                        {player.guardians.slice(0, 2).map((g, i) => (
                          <p key={i} className="text-xs text-muted-foreground truncate">
                            <span className="font-semibold text-foreground">{g.name}</span>
                            {g.email && <span className="text-muted-foreground"> · {g.email}</span>}
                          </p>
                        ))}
                        {player.guardians.length > 2 && (
                          <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold">
                            +{player.guardians.length - 2} more
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No contacts</p>
                    )}
                  </td>

                  {/* Compliance (desktop) */}
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    {isCompliant ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-lg">
                        <ShieldCheck size={12} /> Complete
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-lg">
                        <AlertCircle size={12} />
                        {missingCount} missing
                      </span>
                    )}
                  </td>

                  {/* Seasons (desktop) */}
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {enrolledSeasons.length > 0 ? (
                        enrolledSeasons.map((sid) => (
                          <span
                            key={sid}
                            className={`text-xs font-semibold px-1.5 py-0.5 rounded ${sid === selectedSeason ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-muted text-muted-foreground'}`}
                          >
                            {sid}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">None</span>
                      )}
                    </div>
                  </td>

                  {/* Expand indicator */}
                  <td className="px-4 py-2.5 text-right">
                    {isExpanded ? (
                      <ChevronUp size={14} className="ml-auto text-primary" />
                    ) : (
                      <ChevronDown size={14} className="ml-auto text-muted-foreground" />
                    )}
                  </td>
                </tr>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <DetailRow colSpan={6}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* ── Contacts Section ── */}
                        <div className="bg-card rounded-lg border border-border p-4">
                          <h4 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                            <UserPlus size={12} /> Guardians / Contacts
                          </h4>
                          {player.guardians?.length > 0 ? (
                            <div className="space-y-3">
                              {player.guardians.map((g, i) => (
                                <div key={g.id || i} className="space-y-1">
                                  <p className="text-sm font-semibold text-foreground">{g.name}</p>
                                  {g.email && (
                                    <a
                                      href={`mailto:${g.email}`}
                                      className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 hover:text-blue-800"
                                    >
                                      <Mail size={11} /> {g.email}
                                    </a>
                                  )}
                                  {g.phone && (
                                    <a
                                      href={phoneHref(g.phone)}
                                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                      <Phone size={11} /> {formatPhone(g.phone)}
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No guardians on file.</p>
                          )}
                        </div>

                        {/* ── Compliance Section ── */}
                        <div className="bg-card rounded-lg border border-border p-4">
                          <h4 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                            <Shield size={12} /> Compliance
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-semibold text-foreground">
                                  {t('medical.medicalRelease')}
                                </span>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {comp.medicalRelease ? t('parent.completedOnFile') : t('parent.requiredNotSubmitted')}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMedicalPlayer(player);
                                }}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                                  comp.medicalRelease
                                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                                    : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60'
                                }`}
                              >
                                {comp.medicalRelease ? t('playerModal.onFile') + ' ✎' : t('playerModal.fillOut') + ' →'}
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">ReePlayer Waiver</span>
                              {canEdit ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleComplianceToggle(player.id, 'reePlayerWaiver', comp.reePlayerWaiver);
                                  }}
                                  className={`w-8 h-5 rounded-full transition-colors relative ${comp.reePlayerWaiver ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                  <div
                                    className={`absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${comp.reePlayerWaiver ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                                  />
                                </button>
                              ) : comp.reePlayerWaiver ? (
                                <ShieldCheck size={16} className="text-emerald-700 dark:text-emerald-400" />
                              ) : (
                                <ShieldX size={16} className="text-red-400" />
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">Club Registration</span>
                              {canEdit ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleComplianceToggle(player.id, 'clubRegistration', comp.clubRegistration);
                                  }}
                                  className={`w-8 h-5 rounded-full transition-colors relative ${comp.clubRegistration ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                  <div
                                    className={`absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${comp.clubRegistration ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                                  />
                                </button>
                              ) : comp.clubRegistration ? (
                                <ShieldCheck size={16} className="text-emerald-700 dark:text-emerald-400" />
                              ) : (
                                <ShieldX size={16} className="text-red-400" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ── Season Enrollment Section ── */}
                        <div className="bg-card rounded-lg border border-border p-4">
                          <h4 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                            <Calendar size={12} /> {t('rosterMgmt.seasonEnrollment')}
                          </h4>
                          <div className="space-y-2">
                            {seasons.map((s) => {
                              const isEnrolled = !!player.seasonProfiles?.[s.id];
                              return (
                                <div key={s.id} className="flex items-center justify-between">
                                  <span
                                    className={`text-xs font-semibold ${isEnrolled ? 'text-foreground' : 'text-muted-foreground'}`}
                                  >
                                    {s.id}
                                    {s.id === selectedSeason && (
                                      <span className="text-xs text-blue-700 dark:text-blue-400 ml-1">(current)</span>
                                    )}
                                  </span>
                                  {canEdit ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSeasonToggle(player.id, s.id, isEnrolled);
                                      }}
                                      disabled={isSaving}
                                      className={`w-8 h-5 rounded-full transition-colors relative ${isEnrolled ? 'bg-blue-500' : 'bg-slate-300'} disabled:opacity-50`}
                                    >
                                      <div
                                        className={`absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${isEnrolled ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                                      />
                                    </button>
                                  ) : isEnrolled ? (
                                    <Check size={14} className="text-blue-700 dark:text-blue-400" />
                                  ) : (
                                    <X size={14} className="text-muted-foreground" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* ── Planning Section ── */}
                        <div className="bg-card rounded-lg border border-border p-4">
                          <h4 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                            <Shirt size={12} /> Planning
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">{t('playerForm.shirtSize')}</span>
                              <span className="text-xs font-semibold text-muted-foreground">
                                {player.shirtSize || '—'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">
                                {t('playerForm.siblingsCount')}
                              </span>
                              <span className="text-xs font-semibold text-muted-foreground">
                                {player.siblingsCount ?? '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Documents Section ── */}
                      <div className="bg-card rounded-lg border border-border p-4">
                        <h4 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                          <FolderOpen size={12} /> {t('parent.documents')}{' '}
                          {playerDocs[player.id] ? `(${playerDocs[player.id].length})` : ''}
                        </h4>
                        {docsLoading === player.id ? (
                          <p className="text-xs text-muted-foreground font-semibold animate-pulse py-2">
                            {t('common.loading')}...
                          </p>
                        ) : !playerDocs[player.id] || playerDocs[player.id].length === 0 ? (
                          <p className="text-xs text-muted-foreground italic py-2">{t('parent.noDocuments')}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {playerDocs[player.id].map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center gap-2 p-2 bg-background rounded-lg border border-border"
                              >
                                <FileText size={13} className="text-muted-foreground shrink-0" />
                                <div className="flex-grow min-w-0">
                                  <p className="text-xs font-semibold text-foreground truncate">{doc.title}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-xs font-bold text-muted-foreground uppercase">
                                      {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                                    </span>
                                    <span
                                      className={`text-xs font-bold uppercase px-1 py-0.5 rounded ${STATUS_COLORS[doc.status] || 'bg-muted text-muted-foreground'}`}
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
                                    className="p-1 text-muted-foreground hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-400 transition-colors"
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
                                      className="p-1 text-muted-foreground hover:text-red-700 dark:text-red-400 dark:hover:text-red-400 transition-colors"
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
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditPlayer(player);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                          >
                            <Edit size={12} /> Edit Player
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewPlayer(player);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground bg-muted rounded-lg hover:bg-muted transition-colors"
                          >
                            <Users size={12} /> Full Profile
                          </button>
                          {onViewAsParent && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewAsParent(player);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
                            >
                              <Eye size={12} /> {t('impersonation.viewAsParent')}
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchiveRestore(player);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
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
                  </DetailRow>
                )}
              </React.Fragment>
            );
          })
        )}
      </DirectoryCard>

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
