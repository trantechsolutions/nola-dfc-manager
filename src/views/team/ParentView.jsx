import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  ShieldX,
  Receipt,
  DollarSign,
  Lock,
  Unlock,
  Users,
  Calendar,
  TrendingUp,
  Clock,
  FileText,
  Heart,
  Eye,
  Trash2,
  FolderOpen,
  Upload,
  Video,
  ExternalLink,
  Edit,
  Save,
  Camera,
} from 'lucide-react';
import MedicalReleaseForm from '../../components/MedicalReleaseForm';
import GameFilmCard from '../../components/GameFilmCard';
import PlayerFilmStats from '../../components/PlayerFilmStats';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup, getAge, formatDateOnly } from '../../utils/ageGroup';
import { formatPhone, formatPhoneInput, phoneHref } from '../../utils/phone';
import { getCompliance, progressFor, EMPTY_COMPLIANCE } from '../../utils/compliance';

import { CATEGORY_LABELS, CATEGORY_TEXT_COLORS as CATEGORY_COLORS, DOC_TYPE_LABELS } from '../../utils/constants';
import PaymentOptions from '../../components/PaymentOptions';
import { isPayableAccount } from '../../utils/accounts';
import Badge from '../../components/layout/Badge';
import PanelHost from '../../components/layout/PanelHost';
import { usePanelRoute } from '../../hooks/usePanelRoute';
import { compressImageFile } from '../../utils/imageCompression';
import { PANELS } from '../../utils/panelRoute';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// The three detail panes under the season summary: the busiest first,
// reference material last.
const PARENT_TABS = [
  { id: 'account', key: 'parent.tabPayments', label: 'Payments' },
  { id: 'paperwork', key: 'parent.tabPaperwork', label: 'Paperwork' },
  { id: 'details', key: 'parent.tabDetails', label: 'Details' },
];

function getProgressColor(pct) {
  if (pct >= 100)
    return {
      bar: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    };
  if (pct >= 75)
    return { bar: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' };
  if (pct >= 25)
    return { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' };
  return { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' };
}

export default function ParentView({
  players: propPlayers,
  transactions: propTransactions,
  calculatePlayerFinancials,
  formatMoney,
  teams = [],
  seasons = [],
  selectedSeason,
  setSelectedSeason,
  currentSeasonData,
  clubId,
  onRefresh,
  showToast,
  showConfirm,
  user,
  accounts = [],
  isReadOnly = false,
  // Season compliance index — see utils/compliance.js.
  compliance = EMPTY_COMPLIANCE,
  // Teams this user keeps stats for (the scorekeeper role) — they may have no player of their own.
  scorekeeperTeamIds = [],
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState('account');
  // The medical form is a panel of its own here, so it gets a URL. The upload
  // form below stays in state — it is an inline disclosure, not an overlay.
  const { panel, openPanel, closePanel } = usePanelRoute();
  const showMedicalForm = panel === PANELS.MEDICAL;
  const [playerDocs, setPlayerDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDocType, setUploadDocType] = useState('medical_release');
  const [uploading, setUploading] = useState(false);

  // ── PLAYER INFO EDIT (parent self-service: birthdate, shirt size,
  // siblings, guardian phones — see sql/add_guardian_self_service_rpc.sql) ──
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ birthdate: '', shirtSize: '', siblingsCount: '', guardianPhones: {} });

  // ── SELF-SUFFICIENT DATA FETCH for parents ──
  // If props come in empty (timing issue), fetch directly
  const [selfPlayers, setSelfPlayers] = useState([]);
  const [selfTransactions, setSelfTransactions] = useState([]);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const email = user?.email;
    if (!email || (propPlayers && propPlayers.length > 0)) return;
    if (bootstrapped) return;

    const bootstrap = async () => {
      try {
        const pData = await supabaseService.getPlayersByGuardianEmail(email);
        if (pData.length === 0) return;
        setSelfPlayers(pData);

        const teamId = pData[0].teamId;
        const profiles = pData[0].seasonProfiles || {};
        const latestSeason = Object.keys(profiles).sort((a, b) => b.localeCompare(a))[0];

        if (latestSeason && setSelectedSeason) {
          setSelectedSeason(latestSeason);
        }

        if (teamId && latestSeason) {
          const ts = await supabaseService.getTeamSeason(teamId, latestSeason);
          if (ts?.id) {
            const txs = await supabaseService.getTransactionsByTeamSeason(ts.id);
            setSelfTransactions(txs);
          }
        }
        setBootstrapped(true);
      } catch (e) {
        console.warn('ParentView bootstrap failed:', e.message);
      }
    };
    bootstrap();
  }, [user?.email, propPlayers, bootstrapped, setSelectedSeason]);

  // Use prop data if available, otherwise use self-fetched data
  const players = propPlayers && propPlayers.length > 0 ? propPlayers : selfPlayers;
  const transactions = propTransactions && propTransactions.length > 0 ? propTransactions : selfTransactions;

  // ── ACTIVE PLAYER ──
  const activePlayer = players && players.length > 0 ? players[selectedIndex] : null;
  const financials = calculatePlayerFinancials(activePlayer, transactions);

  // Finalization: prefer per-player value from DB view, fall back to currentSeasonData prop
  const isFinalized = financials.isFinalized || currentSeasonData?.isFinalized || false;
  const isDraft = !isFinalized;

  const paidPercent =
    financials.baseFee > 0
      ? Math.min(100, Math.round(((financials.baseFee - financials.remainingBalance) / financials.baseFee) * 100))
      : 100;
  const progressColors = getProgressColor(paidPercent);

  // Accounts the team has published as payment methods — see isPayableAccount.
  const payableAccounts = useMemo(() => accounts.filter(isPayableAccount), [accounts]);

  // ── PLAYER'S TEAM ──
  const playerTeam = useMemo(() => {
    if (!activePlayer?.teamId || teams.length === 0) return null;
    return teams.find((t) => t.id === activePlayer.teamId) || null;
  }, [activePlayer, teams]);

  // ── AVAILABLE SEASONS for this player (seasons they have a profile for) ──
  const playerSeasons = useMemo(() => {
    if (!activePlayer?.seasonProfiles) return seasons;
    const playerSeasonIds = Object.keys(activePlayer.seasonProfiles);
    const available = seasons.filter((s) => playerSeasonIds.includes(s.id));
    return available.length > 0 ? available : seasons;
  }, [activePlayer, seasons]);

  // Auto-default to the latest season the player is enrolled in
  useEffect(() => {
    if (playerSeasons.length > 0 && setSelectedSeason) {
      const currentlySelected = playerSeasons.find((s) => s.id === selectedSeason);
      if (!currentlySelected) {
        // Pick the latest season (sorted descending by ID e.g. "2025-2026" > "2024-2025")
        const sorted = [...playerSeasons].sort((a, b) => b.id.localeCompare(a.id));
        setSelectedSeason(sorted[0].id);
      }
    }
  }, [playerSeasons, selectedSeason, setSelectedSeason]);

  // ── SIBLING CHECK ──
  const multipleTeams = useMemo(() => {
    const teamIds = new Set(players.map((p) => p.teamId).filter(Boolean));
    return teamIds.size > 1;
  }, [players]);

  // ── SPONSORSHIP / FUNDRAISING ROW KINDS ──
  // A deposit is recorded against the player who brought the money in, and
  // distributing it writes a second row — same title — for the share applied to
  // that player's balance. Both land in this list, so "Friends Of" shows up once
  // per deposit and once per credit and reads like the same transaction logged
  // twice. Only the credit rows carry a batch id, and only they are counted by
  // the player_financials view, so that is the line the labels draw.
  const RAISED = 'raised';
  const APPLIED = 'applied';
  const txKind = (tx) => {
    if (!['SPO', 'FUN'].includes(tx.category)) return null;
    return tx.waterfallBatchId ? APPLIED : RAISED;
  };

  // ── PLAYER-SPECIFIC TRANSACTIONS ──
  const playerTransactions = useMemo(() => {
    if (!activePlayer) return [];
    const fullName = `${activePlayer.firstName} ${activePlayer.lastName}`.toLowerCase();
    return transactions
      .filter((tx) => {
        // Filter by season
        if (selectedSeason && tx.seasonId && tx.seasonId !== selectedSeason) return false;
        // Filter by player
        if (tx.playerId === activePlayer.id) return true;
        return (tx.playerName || '').toLowerCase() === fullName;
      })
      .filter((tx) => tx.cleared)
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
  }, [activePlayer, transactions, selectedSeason]);

  // ── PLAYER DOCUMENTS ──
  const fetchPlayerDocs = useCallback(async () => {
    if (!activePlayer?.id) return;
    setDocsLoading(true);
    try {
      const docs = await supabaseService.getPlayerDocuments(activePlayer.id);
      setPlayerDocs(docs);
    } catch (e) {
      console.error('Failed to fetch documents', e);
    } finally {
      setDocsLoading(false);
    }
  }, [activePlayer?.id]);

  useEffect(() => {
    fetchPlayerDocs();
  }, [fetchPlayerDocs]);

  // Documents are fetched once per player, then narrowed to the season in
  // view — legacy docs with no season_id are excluded rather than shown
  // for every season.
  const seasonDocs = useMemo(
    () => playerDocs.filter((d) => d.seasonId === selectedSeason),
    [playerDocs, selectedSeason],
  );

  // Exit edit mode when the selected child changes so stale form values
  // never leak from one player into another.
  useEffect(() => {
    setEditingInfo(false);
  }, [activePlayer?.id]);

  // ── EMPTY STATE (after all hooks) ──
  if (!players || players.length === 0 || !activePlayer)
    return (
      <div className="max-w-lg mx-auto mt-12 text-center p-10 bg-card rounded-lg border border-border shadow-sm">
        <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
          <ShieldX size={28} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">{t('parent.noPlayers')}</h3>
        <p className="text-muted-foreground font-medium text-sm leading-relaxed">{t('parent.noPlayersMsg')}</p>
        {scorekeeperTeamIds.length > 0 && (
          <div className="mt-6 space-y-3 text-left">
            {scorekeeperTeamIds.map((id) => (
              <GameFilmCard key={id} teamId={id} />
            ))}
          </div>
        )}
      </div>
    );

  const handleUploadDoc = async () => {
    if (!uploadFile || !activePlayer?.id) return;
    setUploading(true);
    try {
      // Camera photos arrive at full sensor resolution; downscale before upload
      // so parents on cell data aren't pushing 8MB per document.
      const file = await compressImageFile(uploadFile);
      if (file.size > MAX_UPLOAD_BYTES) {
        showToast?.(t('parent.docTooLarge'), true);
        return;
      }
      await supabaseService.uploadDocument(file, activePlayer.id, {
        clubId: clubId || null,
        teamId: activePlayer.teamId || null,
        seasonId: selectedSeason || null,
        docType: uploadDocType,
        title: `${DOC_TYPE_LABELS[uploadDocType] || uploadDocType} - ${file.name}`,
      });
      if (uploadDocType === 'medical_release') {
        await supabaseService.setSeasonCompliance(activePlayer.id, selectedSeason, 'medicalRelease', true);
        onRefresh?.();
      }
      showToast?.(t('parent.docUploaded'));
      setUploadFile(null);
      setUploadDocType('medical_release');
      setShowUploadForm(false);
      fetchPlayerDocs();
    } catch (err) {
      console.error('Upload failed:', err);
      showToast?.(t('parent.docUploadFail'), true);
    } finally {
      setUploading(false);
    }
  };

  const handleViewDoc = async (filePath) => {
    try {
      const url = await supabaseService.getDocumentUrl(filePath);
      if (url) window.open(url, '_blank');
      else showToast?.(t('parent.docOpenFail'), true);
    } catch {
      showToast?.(t('parent.docOpenFail'), true);
    }
  };

  const handleDeleteDoc = async (doc) => {
    const ok = await showConfirm?.(t('parent.docDeleteConfirm', { title: doc.title }));
    if (!ok) return;
    try {
      await supabaseService.deleteDocument(doc.id, doc.filePath);
      if (doc.docType === 'medical_release') {
        const remaining = playerDocs.filter(
          (d) => d.id !== doc.id && d.docType === 'medical_release' && ['uploaded', 'verified'].includes(d.status),
        );
        if (remaining.length === 0) {
          await supabaseService.setSeasonCompliance(activePlayer.id, selectedSeason, 'medicalRelease', false);
          onRefresh?.();
        }
      }
      showToast?.(t('parent.docDeleted'));
      fetchPlayerDocs();
    } catch {
      showToast?.(t('parent.docDeleteFail'), true);
    }
  };

  const startEditInfo = () => {
    setInfoForm({
      birthdate: activePlayer.birthdate || '',
      shirtSize: activePlayer.shirtSize || '',
      siblingsCount: activePlayer.siblingsCount ?? '',
      guardianPhones: Object.fromEntries((activePlayer.guardians || []).map((g) => [g.id, g.phone || ''])),
    });
    setEditingInfo(true);
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    try {
      await supabaseService.updateOwnPlayerDetails(activePlayer.id, {
        birthdate: infoForm.birthdate,
        shirtSize: infoForm.shirtSize,
        siblingsCount: infoForm.siblingsCount,
      });

      const phoneUpdates = (activePlayer.guardians || [])
        .filter((g) => (infoForm.guardianPhones[g.id] || '') !== (g.phone || ''))
        .map((g) => supabaseService.updateGuardianPhone(g.id, infoForm.guardianPhones[g.id]));
      if (phoneUpdates.length > 0) await Promise.all(phoneUpdates);

      setEditingInfo(false);
      onRefresh?.();
      showToast?.(t('common.saved', 'Saved'));
    } catch (e) {
      showToast?.(e.message || 'Failed to save', true);
    } finally {
      setSavingInfo(false);
    }
  };

  // ── COMPLIANCE (per selected season) ──
  // The season checklist defines this now, so the summary lists whatever the
  // team actually asked for rather than three fixed rows. `parentComp` still
  // reads the raw flags for the Paperwork tab's medical / ReePlayer sections.
  const parentComp = getCompliance(activePlayer, selectedSeason);
  const parentProgress = progressFor(compliance, activePlayer?.id);
  const outstandingKeys = new Set(parentProgress.outstanding.map((item) => item.key));
  const complianceItems = compliance.requiredItems.map((item) => ({
    label: item.label,
    done: !outstandingKeys.has(item.key),
  }));
  const isFullyCompliant = parentProgress.complete;
  // Same gate as the Payment Options panel: nothing to pay into until the
  // budget is final, and nothing to pay once settled or waived.
  const canPay =
    isFinalized &&
    financials.remainingBalance > 0 &&
    !financials.isWaived &&
    !!(playerTeam?.paymentInfo || payableAccounts.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── CHILD SWITCHER (always on top) ── */}
      {players.length > 1 && (
        <div className="flex gap-2 rounded-md bg-muted p-1">
          {players.map((p, index) => {
            const pTeam = teams.find((t) => t.id === p.teamId);
            return (
              <button
                key={p.id}
                onClick={() => setSelectedIndex(index)}
                className={`flex-1 rounded-md px-3 py-2.5 text-xs font-bold transition-all ${
                  selectedIndex === index ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <span className="block">
                  #{p.jerseyNumber || '?'} {p.firstName}
                </span>
                {multipleTeams && pTeam && (
                  <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">{pTeam.name}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── WHO ── the child this page is about, in the team's colour */}
      <header className="flex items-center gap-4">
        <span
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full font-numeral text-4xl font-bold tabular-nums"
          style={{
            backgroundColor: 'var(--team)',
            color: 'var(--team-foreground)',
            boxShadow: 'inset 0 0 0 1px var(--team-edge)',
          }}
          aria-label={`${t('parent.jerseyNum')} ${activePlayer.jerseyNumber || '?'}`}
        >
          {activePlayer.jerseyNumber || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold tracking-tight text-foreground">
            {activePlayer.firstName} {activePlayer.lastName}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {playerTeam?.name || t('common.team')}
            {activePlayer.birthdate && getUSAgeGroup(activePlayer.birthdate, selectedSeason) && (
              <>, {getUSAgeGroup(activePlayer.birthdate, selectedSeason)}</>
            )}
          </p>
        </div>
        {playerSeasons.length > 1 && (
          <select
            value={selectedSeason || ''}
            onChange={(e) => setSelectedSeason(e.target.value)}
            aria-label={t('common.season', 'Season')}
            className="shrink-0 rounded-md border border-input bg-card px-2 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
          >
            {playerSeasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id}
              </option>
            ))}
          </select>
        )}
      </header>

      {/* ── THIS SEASON ── the two things a parent comes to check: what is
          owed, and whether any paperwork is outstanding. Each answers in a
          sentence first and offers the next step beside it. */}
      <section
        aria-label={t('parent.thisSeason', 'This season')}
        className="divide-y divide-border rounded-lg border border-border bg-card"
      >
        <div className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t('parent.remainingBalance')}</p>
              <p
                className={`mt-0.5 text-3xl font-bold tracking-tight tabular-nums ${
                  financials.remainingBalance <= 0 ? 'text-success' : 'text-foreground'
                }`}
              >
                {formatMoney(Math.max(0, financials.remainingBalance))}
              </p>
            </div>
            <dl className="flex gap-6 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('parent.seasonFee')}</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {formatMoney(financials.baseFee)}
                  {isDraft && financials.baseFee > 0 && (
                    <span className="ml-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {t('parent.est')}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('parent.paid', 'Paid')}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{formatMoney(financials.totalPaid || 0)}</dd>
              </div>
            </dl>
          </div>

          {financials.baseFee > 0 && !financials.isWaived && (
            <>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={paidPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('parent.paidPercent', { n: paidPercent })}
              >
                <div className={`h-full rounded-full ${progressColors.bar}`} style={{ width: `${paidPercent}%` }} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {financials.remainingBalance <= 0 ? t('parent.fullyPaid') : t('parent.paidPercent', { n: paidPercent })}
              </p>
            </>
          )}

          {canPay && (
            <button
              type="button"
              onClick={() => {
                setTab('account');
                requestAnimationFrame(() =>
                  document.getElementById('payment-options')?.scrollIntoView({
                    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                    block: 'start',
                  }),
                );
              }}
              className="mt-4 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {t('parent.payNow', 'Pay balance')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{t('parent.tabPaperwork', 'Paperwork')}</p>
            {complianceItems.length === 0 || isFullyCompliant ? (
              <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-success">
                <ShieldCheck size={16} aria-hidden="true" />
                {complianceItems.length === 0 ? t('parent.noRequirements') : t('parent.allComplete')}
              </p>
            ) : (
              <>
                <p className="mt-0.5 font-semibold text-foreground">
                  {complianceItems.filter((c) => !c.done).length} {t('parent.missing', 'missing')}
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {complianceItems
                    .filter((c) => !c.done)
                    .map((item) => (
                      <li key={item.label}>
                        <Badge tone="warning">{item.label}</Badge>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
          {!isFullyCompliant && complianceItems.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/checklist')}
              className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {t('parent.openChecklist', 'Open checklist')}
            </button>
          )}
        </div>
      </section>

      {/* ── DETAIL ── plain tabs; each pane is reference, not the headline */}
      <div>
        <div role="tablist" className="flex gap-1 border-b border-border">
          {PARENT_TABS.map((pt) => {
            const isActive = tab === pt.id;
            return (
              <button
                key={pt.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(pt.id)}
                className={`relative -mb-px px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(pt.key, pt.label)}
                {isActive && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
        <div role="tabpanel">
          {tab === 'account' && (
            <div className="space-y-4 pt-5">
              {/* Payment Progress (visual breakdown) — only worth showing once
                    there's an actual mix of payments/credits to break down; the
                    Balance Hero above already covers the plain 0%-paid case */}
              {financials.baseFee > 0 &&
                !financials.isWaived &&
                financials.totalPaid + financials.fundraising + financials.sponsorships + financials.credits > 0 && (
                  <div className="bg-card p-5 rounded-lg border border-border shadow-sm">
                    <h3 className="font-semibold text-foreground mb-4 text-xs flex items-center gap-2">
                      <TrendingUp size={14} className="text-muted-foreground" /> {t('parent.paymentProgress')}
                    </h3>
                    <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-blue-500 rounded-l-full transition-all duration-700"
                        style={{ width: `${Math.min(100, (financials.totalPaid / financials.baseFee) * 100)}%` }}
                      />
                      {financials.fundraising + financials.sponsorships + financials.credits > 0 && (
                        <div
                          className="absolute inset-y-0 bg-emerald-400 transition-all duration-700"
                          style={{
                            left: `${Math.min(100, (financials.totalPaid / financials.baseFee) * 100)}%`,
                            width: `${Math.min(100 - (financials.totalPaid / financials.baseFee) * 100, ((financials.fundraising + financials.sponsorships + financials.credits) / financials.baseFee) * 100)}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs font-semibold text-muted-foreground">
                      {financials.totalPaid > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> {t('parent.feesPaid')} (
                          {formatMoney(financials.totalPaid)})
                        </span>
                      )}
                      {financials.fundraising > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> {t('nav.fundraising')} (
                          {formatMoney(financials.fundraising)})
                        </span>
                      )}
                      {financials.sponsorships > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-violet-400" /> {t('categories.sponsorship')} (
                          {formatMoney(financials.sponsorships)})
                        </span>
                      )}
                      {financials.credits > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> {t('categories.credit')} (
                          {formatMoney(financials.credits)})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              {/* Budget Status — single source of truth for draft/finalized state;
                    also explains why Payment Options is or isn't shown below */}
              <div
                className={`p-4 rounded-lg border shadow-sm ${isFinalized ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200' : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200'}`}
              >
                <div className="flex items-center gap-3">
                  {isFinalized ? (
                    <Lock size={18} className="text-emerald-700 dark:text-emerald-400" />
                  ) : (
                    <Unlock size={18} className="text-amber-700 dark:text-amber-400" />
                  )}
                  <div>
                    <p
                      className={`text-sm font-bold ${isFinalized ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'}`}
                    >
                      {financials.isWaived
                        ? t('parent.feeWaived')
                        : isFinalized
                          ? t('parent.budgetFinalized')
                          : t('parent.budgetDraft')}
                    </p>
                    <p
                      className={`text-xs font-medium ${isFinalized ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}
                    >
                      {financials.isWaived
                        ? t('parent.feeWaivedMsg')
                        : isFinalized
                          ? t('parent.budgetFinalizedMsg')
                          : t('parent.budgetDraftMsg', { amount: formatMoney(financials.baseFee) })}
                    </p>
                    {isDraft && !financials.isWaived && financials.remainingBalance > 0 && (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-1">
                        {t('parent.paymentsUnavailableDraft')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* Payment Options — withheld until the budget is finalized, since the
                    fee (and therefore the balance owed) is still subject to change */}
              {isFinalized &&
                financials.remainingBalance > 0 &&
                !financials.isWaived &&
                (playerTeam?.paymentInfo || payableAccounts.length > 0) && (
                  <div id="payment-options" className="scroll-mt-20">
                    <PaymentOptions
                      paymentInfo={playerTeam?.paymentInfo || ''}
                      accounts={payableAccounts}
                      playerName={`${activePlayer.firstName} ${activePlayer.lastName}`}
                      firstName={activePlayer.firstName}
                      lastName={activePlayer.lastName}
                      teamName={playerTeam?.name || ''}
                      remainingBalance={financials.remainingBalance}
                      baseFee={financials.baseFee}
                      totalPaid={financials.totalPaid}
                      formatMoney={formatMoney}
                      showToast={showToast}
                    />
                  </div>
                )}
              {/* Fee Breakdown */}
              <div className="bg-card p-5 rounded-lg border border-border shadow-sm">
                <h3 className="font-semibold text-foreground mb-4 text-xs flex items-center gap-2">
                  <DollarSign size={14} className="text-muted-foreground" /> {t('parent.feeBreakdown')}
                </h3>
                <div className="space-y-0">
                  {[
                    {
                      label: t('parent.baseFee'),
                      value: financials.baseFee,
                      color: 'text-foreground',
                      show: true,
                      sign: '',
                    },
                    {
                      label: t('parent.teamFeesPaid'),
                      value: financials.totalPaid,
                      color: 'text-emerald-700 dark:text-emerald-400',
                      show: financials.totalPaid > 0,
                      sign: '-',
                    },
                    {
                      label: t('parent.fundraisingApplied'),
                      value: financials.fundraising,
                      color: 'text-emerald-700 dark:text-emerald-400',
                      show: financials.fundraising > 0,
                      sign: '-',
                    },
                    {
                      label: t('parent.sponsorshipsApplied'),
                      value: financials.sponsorships,
                      color: 'text-violet-700 dark:text-violet-400',
                      show: financials.sponsorships > 0,
                      sign: '-',
                    },
                    {
                      label: t('parent.creditsDiscounts'),
                      value: financials.credits,
                      color: 'text-cyan-600',
                      show: financials.credits > 0,
                      sign: '-',
                    },
                  ]
                    .filter((r) => r.show)
                    .map((row, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center py-3 border-b border-border last:border-0"
                      >
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                        <span className={`font-semibold text-sm ${row.color}`}>
                          {row.sign}
                          {formatMoney(row.value)}
                        </span>
                      </div>
                    ))}
                  <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-border">
                    <span className="text-sm font-bold text-foreground">{t('parent.remainingBalance')}</span>
                    <span
                      className={`text-lg font-bold ${financials.remainingBalance <= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
                    >
                      {financials.remainingBalance <= 0 ? formatMoney(0) : formatMoney(financials.remainingBalance)}
                    </span>
                  </div>
                </div>
              </div>
              {/* Transactions */}
              <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border">
                  <h3 className="font-semibold text-foreground text-xs flex items-center gap-2">
                    <Receipt size={14} className="text-muted-foreground" /> {t('parent.transactions')} (
                    {playerTransactions.length})
                  </h3>
                  {playerTransactions.some((tx) => txKind(tx) === RAISED) && (
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      {t('parent.txRaisedNote', { applied: t('parent.txApplied') })}
                    </p>
                  )}
                </div>

                {playerTransactions.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground font-semibold text-sm">
                    {t('parent.noTransactions')}
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                    {playerTransactions.map((tx) => {
                      const catLabel = CATEGORY_LABELS[tx.category] || tx.category || '';
                      const catColor = CATEGORY_COLORS[tx.category] || 'text-muted-foreground';
                      const kind = txKind(tx);
                      const isRaised = kind === RAISED;
                      // A deposit is not a credit to this player, so it does not
                      // get the green treatment that says "this came off your fee".
                      const isPositive = tx.amount > 0 && !isRaised;

                      return (
                        <div
                          key={tx.id}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-background/50 transition-colors"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isPositive ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-background'
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp size={14} className="text-emerald-700 dark:text-emerald-400" />
                            ) : (
                              <Receipt size={14} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-grow min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{tx.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-xs font-bold uppercase ${catColor}`}>{catLabel}</span>
                              <span className="text-xs text-muted-foreground">
                                {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : ''}
                              </span>
                              {kind && (
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                    isRaised
                                      ? 'bg-muted text-muted-foreground'
                                      : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {t(isRaised ? 'parent.txRaised' : 'parent.txApplied')}
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={`font-bold text-sm shrink-0 ${
                              isPositive
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : isRaised
                                  ? 'text-muted-foreground'
                                  : 'text-foreground'
                            }`}
                          >
                            {isPositive ? '+' : ''}
                            {formatMoney(tx.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'paperwork' && (
            <div className="space-y-4 pt-5">
              {/* The season checklist used to sit here. It has its own nav
                    entry now (ParentChecklistView) so parents aren't three
                    clicks from the one surface they're asked to act on. */}

              {/* Medical Release Form */}
              <div
                className={`p-4 rounded-lg border shadow-sm ${
                  parentComp.medicalRelease
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200'
                    : 'bg-red-50 dark:bg-red-900/30 border-red-200'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      parentComp.medicalRelease
                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                        : 'bg-red-100 dark:bg-red-900/30'
                    }`}
                  >
                    <Heart
                      size={18}
                      className={
                        parentComp.medicalRelease
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{t('parent.medicalForm')}</p>
                    <p
                      className={`text-xs font-medium ${
                        parentComp.medicalRelease
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {parentComp.medicalRelease ? t('parent.completedOnFile') : t('parent.requiredNotSubmitted')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openPanel(PANELS.MEDICAL)}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    parentComp.medicalRelease
                      ? 'bg-card text-foreground hover:bg-background border border-border'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  <FileText size={13} />
                  {parentComp.medicalRelease ? t('parent.viewUpdateForm') : t('parent.completeForm')}
                </button>
              </div>

              <PanelHost>
                <MedicalReleaseForm
                  show={showMedicalForm}
                  onClose={closePanel}
                  player={activePlayer}
                  clubId={clubId}
                  seasonId={selectedSeason}
                  onCompleted={() => {
                    onRefresh?.();
                    fetchPlayerDocs();
                  }}
                />
              </PanelHost>
              {/* ReePlayer — sign-up link stays until staff confirms the account
                    via the ReePlayer Waiver toggle; fan link is always shown */}
              {(playerTeam?.reeplayerFanLink || (playerTeam?.reeplayerPlayerLink && !parentComp.reePlayerWaiver)) && (
                <div className="bg-card p-4 rounded-lg border border-border shadow-sm space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center shrink-0">
                      <Video size={18} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm font-bold text-foreground">{t('parent.reeplayer')}</p>
                  </div>
                  {playerTeam.reeplayerPlayerLink && !parentComp.reePlayerWaiver && (
                    <a
                      href={playerTeam.reeplayerPlayerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <ExternalLink size={13} />
                      {t('parent.reeplayerPlayerSignup')}
                    </a>
                  )}
                  {playerTeam.reeplayerFanLink && (
                    <a
                      href={playerTeam.reeplayerFanLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-card text-foreground hover:bg-background border border-border transition-colors"
                    >
                      <ExternalLink size={13} />
                      {t('parent.reeplayerFan')}
                    </a>
                  )}
                </div>
              )}
              {/* Documents */}
              <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground text-xs flex items-center gap-2">
                      <FolderOpen size={14} className="text-muted-foreground" /> {t('parent.documents')} (
                      {seasonDocs.length})
                    </h3>
                    <button
                      onClick={() => setShowUploadForm((v) => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <Upload size={13} />
                      {t('parent.uploadDoc')}
                    </button>
                  </div>
                </div>

                {/* Inline upload form */}
                {showUploadForm && (
                  <div className="p-5 border-b border-border bg-background space-y-3">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground block mb-1">
                        {t('parent.selectFile')}
                      </label>
                      <input
                        type="file"
                        accept="image/*,.pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={(e) => setUploadFile(e.target.files[0] || null)}
                        className="block w-full text-sm text-foreground
                            file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                            file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 dark:text-blue-300
                            dark:file:bg-blue-900/30 dark:file:text-blue-300
                            hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                            file:cursor-pointer file:transition-colors"
                      />
                      {/* Separate camera entry point. `capture` on the picker above
                            would force the camera and hide the photo library, so the
                            two paths stay distinct. Hidden on desktop, where it just
                            opens the same file dialog. */}
                      <label className="sm:hidden mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-muted text-foreground hover:bg-muted/80 cursor-pointer transition-colors">
                        <Camera size={14} />
                        {t('parent.takePhoto')}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => setUploadFile(e.target.files[0] || null)}
                        />
                      </label>
                    </div>
                    {uploadFile && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground block mb-1">
                            {t('parent.docType')}
                          </label>
                          <select
                            value={uploadDocType}
                            onChange={(e) => setUploadDocType(e.target.value)}
                            className="w-full border border-border rounded-lg p-2.5 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="medical_release">{DOC_TYPE_LABELS.medical_release}</option>
                            <option value="birth_certificate">{DOC_TYPE_LABELS.birth_certificate}</option>
                            <option value="insurance_card">{DOC_TYPE_LABELS.insurance_card}</option>
                            <option value="player_photo">{DOC_TYPE_LABELS.player_photo}</option>
                            <option value="other">{DOC_TYPE_LABELS.other}</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleUploadDoc}
                            disabled={uploading}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {uploading ? t('parent.uploading') : t('parent.submitUpload')}
                          </button>
                          <button
                            onClick={() => {
                              setShowUploadForm(false);
                              setUploadFile(null);
                              setUploadDocType('medical_release');
                            }}
                            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {docsLoading ? (
                  <div className="p-10 text-center text-muted-foreground font-semibold text-sm animate-pulse">
                    {t('common.loading')}...
                  </div>
                ) : seasonDocs.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground font-semibold text-sm">
                    {t('parent.noDocuments')}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {seasonDocs.map((doc) => {
                      const statusColor =
                        {
                          uploaded: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                          verified: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
                          expired: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                          rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                        }[doc.status] || 'bg-muted text-muted-foreground';

                      return (
                        <div
                          key={doc.id}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-background/50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shrink-0">
                            <FileText size={14} className="text-muted-foreground" />
                          </div>
                          <div className="flex-grow min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{doc.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-bold text-muted-foreground uppercase">
                                {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                              </span>
                              <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${statusColor}`}>
                                {doc.status}
                              </span>
                              {doc.fileSize && (
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(doc.fileSize / 1024)}KB
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleViewDoc(doc.filePath)}
                              className="p-1.5 text-muted-foreground hover:text-blue-700 dark:text-blue-400 transition-colors"
                              title={t('common.view')}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteDoc(doc)}
                              className="p-1.5 text-muted-foreground hover:text-red-700 dark:text-red-400 transition-colors"
                              title={t('common.delete')}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'details' && (
            <div className="space-y-4 pt-5">
              {/* Player Info */}
              <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground text-xs">{t('parent.playerInfo')}</h3>
                  {!isReadOnly &&
                    (editingInfo ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingInfo(false)}
                          disabled={savingInfo}
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={handleSaveInfo}
                          disabled={savingInfo}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          <Save size={12} /> {savingInfo ? t('common.saving') : t('common.save')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startEditInfo}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 transition-colors"
                      >
                        <Edit size={12} /> {t('common.edit')}
                      </button>
                    ))}
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('parent.jerseyNum')}</span>
                    <span className="text-sm font-bold text-foreground">{activePlayer.jerseyNumber || '—'}</span>
                  </div>

                  {/* Birthdate — editable */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('playerForm.birthdate')}</span>
                    {editingInfo ? (
                      <input
                        type="date"
                        value={infoForm.birthdate}
                        onChange={(e) => setInfoForm((f) => ({ ...f, birthdate: e.target.value }))}
                        className="border border-border rounded-lg px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-foreground">
                        {activePlayer.birthdate ? formatDateOnly(activePlayer.birthdate) : '—'}
                      </span>
                    )}
                  </div>
                  {!editingInfo && activePlayer.birthdate && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{t('playerForm.ageGroup')}</span>
                      <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        {getUSAgeGroup(activePlayer.birthdate, selectedSeason) || '—'} ({t('playerForm.age')}{' '}
                        {getAge(activePlayer.birthdate)})
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('common.status')}</span>
                    <span
                      className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                        activePlayer.status === 'active'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {activePlayer.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('parent.compliance')}</span>
                    <span
                      className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                        isFullyCompliant
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {isFullyCompliant ? t('parent.complete') : t('parent.incomplete')}
                    </span>
                  </div>

                  {/* Shirt Size — editable */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('playerForm.shirtSize')}</span>
                    {editingInfo ? (
                      <select
                        value={infoForm.shirtSize}
                        onChange={(e) => setInfoForm((f) => ({ ...f, shirtSize: e.target.value }))}
                        className="border border-border rounded-lg px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">{t('playerForm.selectShirtSize')}</option>
                        <optgroup label={t('playerForm.youthSizes')}>
                          <option value="YXS">YXS</option>
                          <option value="YS">YS</option>
                          <option value="YM">YM</option>
                          <option value="YL">YL</option>
                          <option value="YXL">YXL</option>
                        </optgroup>
                        <optgroup label={t('playerForm.adultSizes')}>
                          <option value="AS">AS</option>
                          <option value="AM">AM</option>
                          <option value="AL">AL</option>
                          <option value="AXL">AXL</option>
                          <option value="AXXL">AXXL</option>
                        </optgroup>
                      </select>
                    ) : (
                      <span className="text-sm font-semibold text-foreground">{activePlayer.shirtSize || '—'}</span>
                    )}
                  </div>

                  {/* Siblings — editable */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('playerForm.siblingsCount')}</span>
                    {editingInfo ? (
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={infoForm.siblingsCount}
                        onChange={(e) => setInfoForm((f) => ({ ...f, siblingsCount: e.target.value }))}
                        className="w-16 border border-border rounded-lg px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring text-right"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-foreground">{activePlayer.siblingsCount ?? '—'}</span>
                    )}
                  </div>

                  {activePlayer.guardians?.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-bold text-muted-foreground mb-2">{t('playerModal.guardians')}</p>
                      {activePlayer.guardians.map((g, i) => (
                        <div key={g.id || i} className="flex justify-between items-center py-1 gap-2">
                          <span className="text-sm text-foreground">{g.name}</span>
                          {editingInfo ? (
                            <input
                              type="tel"
                              value={infoForm.guardianPhones[g.id] ?? ''}
                              onChange={(e) =>
                                setInfoForm((f) => ({
                                  ...f,
                                  guardianPhones: { ...f.guardianPhones, [g.id]: formatPhoneInput(e.target.value) },
                                }))
                              }
                              className="w-36 border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                            />
                          ) : (
                            g.phone && (
                              <a
                                href={phoneHref(g.phone)}
                                className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800"
                              >
                                {formatPhone(g.phone)}
                              </a>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── GAME FILM ── the team's film site, opened already unlocked for this
          account, and this child's season numbers from it */}
      <GameFilmCard teamId={playerTeam?.id} />
      <PlayerFilmStats playerId={activePlayer.id} seasonId={selectedSeason} className="bg-card" />
    </div>
  );
}
