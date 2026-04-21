import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldX,
  Receipt,
  AlertCircle,
  ChevronDown,
  DollarSign,
  Lock,
  Unlock,
  Users,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle2,
  FileText,
  Heart,
  Eye,
  Trash2,
  FolderOpen,
  Upload,
} from 'lucide-react';
import MedicalReleaseForm from '../../components/MedicalReleaseForm';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup, getAge } from '../../utils/ageGroup';

import { CATEGORY_LABELS, CATEGORY_TEXT_COLORS as CATEGORY_COLORS, DOC_TYPE_LABELS } from '../../utils/constants';
import PaymentOptions from '../../components/PaymentOptions';

function getProgressColor(pct) {
  if (pct >= 100)
    return { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' };
  if (pct >= 75) return { bar: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' };
  if (pct >= 25) return { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' };
  return { bar: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/30' };
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
}) {
  const { t } = useT();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showMedicalForm, setShowMedicalForm] = useState(false);
  const [playerDocs, setPlayerDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDocType, setUploadDocType] = useState('medical_release');
  const [uploading, setUploading] = useState(false);

  // ── SELF-SUFFICIENT DATA FETCH for parents ──
  // If props come in empty (timing issue), fetch directly
  const [selfPlayers, setSelfPlayers] = useState([]);
  const [selfTransactions, setSelfTransactions] = useState([]);
  const [selfFinancials, setSelfFinancials] = useState({});
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
            try {
              const fin = await supabaseService.getPlayerFinancials(latestSeason, ts.id);
              setSelfFinancials(fin);
            } catch {
              /* noop */
            }
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

  // ── EMPTY STATE (after all hooks) ──
  if (!players || players.length === 0 || !activePlayer)
    return (
      <div className="max-w-lg mx-auto mt-12 text-center p-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
        <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
          <ShieldX size={28} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">{t('parent.noPlayers')}</h3>
        <p className="text-slate-500 font-medium text-sm leading-relaxed">{t('parent.noPlayersMsg')}</p>
      </div>
    );

  const handleUploadDoc = async () => {
    if (!uploadFile || !activePlayer?.id) return;
    setUploading(true);
    try {
      await supabaseService.uploadDocument(uploadFile, activePlayer.id, {
        clubId: clubId || null,
        teamId: activePlayer.teamId || null,
        seasonId: selectedSeason || null,
        docType: uploadDocType,
        title: `${DOC_TYPE_LABELS[uploadDocType] || uploadDocType} - ${uploadFile.name}`,
      });
      showToast?.(t('parent.docUploaded', 'Document uploaded successfully'));
      setUploadFile(null);
      setUploadDocType('medical_release');
      setShowUploadForm(false);
      fetchPlayerDocs();
    } catch (err) {
      console.error('Upload failed:', err);
      showToast?.(t('parent.docUploadFail', 'Failed to upload document'), true);
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
          await supabaseService.updatePlayerField(activePlayer.id, 'medicalRelease', false);
          onRefresh?.();
        }
      }
      showToast?.(t('parent.docDeleted'));
      fetchPlayerDocs();
    } catch {
      showToast?.(t('parent.docDeleteFail'), true);
    }
  };

  // ── COMPLIANCE ITEMS ──
  const complianceItems = [
    { label: t('medical.medicalRelease'), done: activePlayer.medicalRelease },
    { label: t('medical.reeplayerWaiver'), done: activePlayer.reePlayerWaiver },
  ];
  const isFullyCompliant = complianceItems.every((c) => c.done);

  return (
    <div className="pb-24 md:pb-6">
      {/* ── CHILD SWITCHER (always on top) ── */}
      {players.length > 1 && (
        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-5">
          {players.map((p, index) => {
            const pTeam = teams.find((t) => t.id === p.teamId);
            return (
              <button
                key={p.id}
                onClick={() => setSelectedIndex(index)}
                className={`flex-1 py-2.5 px-3 rounded-lg font-black text-xs transition-all ${
                  selectedIndex === index
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm dark:shadow-none'
                    : 'text-slate-500'
                }`}
              >
                <span className="block">
                  #{p.jerseyNumber || '?'} {p.firstName}
                </span>
                {multipleTeams && pTeam && (
                  <span className="block text-[9px] font-bold text-slate-400 mt-0.5">{pTeam.name}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── SEASON SELECTOR ── */}
      {playerSeasons.length > 1 && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 mb-5">
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {t('common.season', 'Season')}
          </span>
          <select
            value={selectedSeason || ''}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="bg-transparent border-none text-sm font-bold text-blue-600 dark:text-blue-400 focus:ring-0 cursor-pointer text-right"
          >
            {playerSeasons.map((s) => (
              <option key={s.id} value={s.id} className="text-slate-900 dark:text-white">
                {s.name || s.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── DESKTOP: 2-column | MOBILE: stacked ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* ════════ LEFT COLUMN (2/5 width on desktop) ════════ */}
        <div className="md:col-span-2 space-y-4">
          {/* Player Card */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl overflow-hidden shadow-xl dark:shadow-none">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl font-black">
                  {activePlayer.jerseyNumber || '?'}
                </div>
                <div>
                  <h2 className="text-xl font-black flex items-center gap-2">
                    {activePlayer.firstName} {activePlayer.lastName}
                    {activePlayer.birthdate && getUSAgeGroup(activePlayer.birthdate, selectedSeason) && (
                      <span className="text-[10px] font-black bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full">
                        {getUSAgeGroup(activePlayer.birthdate, selectedSeason)}
                      </span>
                    )}
                  </h2>
                  {activePlayer.birthdate && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {t('playerForm.age')} {getAge(activePlayer.birthdate)} &middot; DOB{' '}
                      {new Date(activePlayer.birthdate).toLocaleDateString()}
                    </p>
                  )}
                  {playerTeam && (
                    <p className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: playerTeam.colorPrimary || '#3b82f6' }}
                      />
                      {playerTeam.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Compliance badges */}
              <div className="flex gap-2">
                {complianceItems.map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black ${
                      item.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {item.done ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Balance Hero */}
          <div
            className={`p-6 rounded-2xl border shadow-sm dark:shadow-none ${progressColors.bg} border-slate-200 dark:border-slate-700`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t('parent.remainingBalance')}
                </p>
                <p
                  className={`text-3xl font-black tracking-tight mt-1 ${
                    financials.remainingBalance <= 0 ? 'text-emerald-600' : progressColors.text
                  }`}
                >
                  {financials.remainingBalance <= 0 ? formatMoney(0) : formatMoney(financials.remainingBalance)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t('parent.seasonFee')}
                </p>
                <p className="text-xl font-black text-slate-800 dark:text-white mt-1">
                  {formatMoney(financials.baseFee)}
                  {isDraft && financials.baseFee > 0 && (
                    <span className="text-[9px] text-amber-500 font-bold ml-1">{t('parent.est')}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-3 bg-white/80 dark:bg-slate-700/80 rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${progressColors.bar}`}
                style={{ width: `${paidPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400">
              <span>{t('parent.paidPercent', { n: paidPercent })}</span>
              <span>
                {financials.remainingBalance <= 0
                  ? t('parent.fullyPaid')
                  : t('parent.remaining', { amount: formatMoney(financials.remainingBalance) })}
              </span>
            </div>
          </div>

          {/* Payment Progress (visual breakdown) */}
          {financials.baseFee > 0 && !financials.isWaived && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-xs uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} className="text-slate-400" /> {t('parent.paymentProgress')}
              </h3>
              <div className="relative h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
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
              <div className="flex flex-wrap gap-4 mt-3 text-[10px] font-bold text-slate-400">
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

          {/* Payment Options */}
          {financials.remainingBalance > 0 &&
            !financials.isWaived &&
            (playerTeam?.paymentInfo || accounts.length > 0) && (
              <PaymentOptions
                paymentInfo={playerTeam?.paymentInfo || ''}
                accounts={accounts}
                playerName={`${activePlayer.firstName} ${activePlayer.lastName}`}
                remainingBalance={financials.remainingBalance}
                formatMoney={formatMoney}
                showToast={showToast}
              />
            )}

          {/* Season + Team Selector */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none space-y-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t('common.season')}
              </label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full mt-1 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm font-bold text-slate-800 dark:text-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              >
                {playerSeasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </div>
            {playerTeam && (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t('common.team')}
                </label>
                <div className="mt-1 flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: playerTeam.colorPrimary || '#1e293b' }}
                  />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{playerTeam.name}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">
                    {playerTeam.ageGroup} · {playerTeam.gender}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Budget Status Card */}
          <div
            className={`p-4 rounded-2xl border shadow-sm dark:shadow-none ${isFinalized ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200' : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200'}`}
          >
            <div className="flex items-center gap-3">
              {isFinalized ? (
                <Lock size={18} className="text-emerald-600" />
              ) : (
                <Unlock size={18} className="text-amber-600" />
              )}
              <div>
                <p className={`text-sm font-black ${isFinalized ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {financials.isWaived
                    ? t('parent.feeWaived')
                    : isFinalized
                      ? t('parent.budgetFinalized')
                      : t('parent.budgetDraft')}
                </p>
                <p className={`text-[11px] font-medium ${isFinalized ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {financials.isWaived
                    ? t('parent.feeWaivedMsg')
                    : isFinalized
                      ? t('parent.budgetFinalizedMsg')
                      : t('parent.budgetDraftMsg', { amount: formatMoney(financials.baseFee) })}
                </p>
              </div>
            </div>
          </div>

          {/* Medical Release Form */}
          <div
            className={`p-4 rounded-2xl border shadow-sm dark:shadow-none ${
              activePlayer.medicalRelease
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200'
                : 'bg-red-50 dark:bg-red-900/30 border-red-200'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  activePlayer.medicalRelease
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : 'bg-red-100 dark:bg-red-900/30'
                }`}
              >
                <Heart size={18} className={activePlayer.medicalRelease ? 'text-emerald-600' : 'text-red-500'} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-white">{t('parent.medicalForm')}</p>
                <p
                  className={`text-[11px] font-medium ${
                    activePlayer.medicalRelease ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {activePlayer.medicalRelease ? t('parent.completedOnFile') : t('parent.requiredNotSubmitted')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowMedicalForm(true)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                activePlayer.medicalRelease
                  ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              <FileText size={13} />
              {activePlayer.medicalRelease ? t('parent.viewUpdateForm') : t('parent.completeForm')}
            </button>
          </div>

          <MedicalReleaseForm
            show={showMedicalForm}
            onClose={() => setShowMedicalForm(false)}
            player={activePlayer}
            clubId={clubId}
            seasonId={selectedSeason}
            onCompleted={() => {
              onRefresh?.();
              fetchPlayerDocs();
            }}
          />

          {/* Documents */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-widest flex items-center gap-2">
                  <FolderOpen size={14} className="text-slate-400" /> {t('parent.documents')} ({playerDocs.length})
                </h3>
                <button
                  onClick={() => setShowUploadForm((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Upload size={13} />
                  {t('parent.uploadDoc', 'Upload Document')}
                </button>
              </div>
            </div>

            {/* Inline upload form */}
            {showUploadForm && (
              <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    {t('parent.selectFile', 'Select File')}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => setUploadFile(e.target.files[0] || null)}
                    className="block w-full text-sm text-slate-600 dark:text-slate-300
                      file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                      file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700
                      dark:file:bg-blue-900/30 dark:file:text-blue-300
                      hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                      file:cursor-pointer file:transition-colors"
                  />
                </div>
                {uploadFile && (
                  <>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                        {t('parent.docType', 'Document Type')}
                      </label>
                      <select
                        value={uploadDocType}
                        onChange={(e) => setUploadDocType(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm font-bold text-slate-800 dark:text-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {uploading ? t('common.saving', 'Uploading...') : t('parent.submitUpload', 'Upload')}
                      </button>
                      <button
                        onClick={() => {
                          setShowUploadForm(false);
                          setUploadFile(null);
                          setUploadDocType('medical_release');
                        }}
                        className="px-4 py-2.5 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        {t('common.cancel', 'Cancel')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {docsLoading ? (
              <div className="p-10 text-center text-slate-300 font-bold text-sm animate-pulse">
                {t('common.loading')}...
              </div>
            ) : playerDocs.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-bold text-sm">{t('parent.noDocuments')}</div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-700">
                {playerDocs.map((doc) => {
                  const statusColor =
                    {
                      uploaded: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                      verified: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
                      expired: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                      rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                    }[doc.status] || 'bg-slate-100 dark:bg-slate-800 text-slate-500';

                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <FileText size={14} className="text-slate-400" />
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{doc.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-black text-slate-400 uppercase">
                            {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${statusColor}`}>
                            {doc.status}
                          </span>
                          {doc.fileSize && (
                            <span className="text-[10px] text-slate-400">{Math.round(doc.fileSize / 1024)}KB</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleViewDoc(doc.filePath)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                          title={t('common.view')}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteDoc(doc)}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
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

        {/* ════════ RIGHT COLUMN (3/5 width on desktop) ════════ */}
        <div className="md:col-span-3 space-y-4">
          {/* Player Info */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
            <h3 className="font-bold text-slate-800 dark:text-white mb-3 text-xs uppercase tracking-widest">
              {t('parent.playerInfo')}
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">{t('parent.jerseyNum')}</span>
                <span className="text-sm font-black text-slate-800 dark:text-white">
                  {activePlayer.jerseyNumber || '—'}
                </span>
              </div>
              {activePlayer.birthdate && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">{t('playerForm.birthdate')}</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {new Date(activePlayer.birthdate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">{t('playerForm.ageGroup')}</span>
                    <span className="text-xs font-black bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                      {getUSAgeGroup(activePlayer.birthdate, selectedSeason) || '—'} ({t('playerForm.age')}{' '}
                      {getAge(activePlayer.birthdate)})
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">{t('common.status')}</span>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                    activePlayer.status === 'active'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {activePlayer.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">{t('parent.compliance')}</span>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                    isFullyCompliant
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600'
                  }`}
                >
                  {isFullyCompliant ? t('parent.complete') : t('parent.incomplete')}
                </span>
              </div>
              {activePlayer.guardians?.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    {t('playerModal.guardians')}
                  </p>
                  {activePlayer.guardians.map((g, i) => (
                    <div key={i} className="flex justify-between items-center py-1">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{g.name}</span>
                      {g.phone && (
                        <a href={`tel:${g.phone}`} className="text-[10px] font-bold text-blue-600 hover:text-blue-800">
                          {g.phone}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Fee Breakdown */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
            <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-xs uppercase tracking-widest flex items-center gap-2">
              <DollarSign size={14} className="text-slate-400" /> {t('parent.feeBreakdown')}
            </h3>
            <div className="space-y-0">
              {[
                {
                  label: t('parent.baseFee'),
                  value: financials.baseFee,
                  color: 'text-slate-800 dark:text-white',
                  show: true,
                  sign: '',
                },
                {
                  label: t('parent.teamFeesPaid'),
                  value: financials.totalPaid,
                  color: 'text-emerald-600',
                  show: financials.totalPaid > 0,
                  sign: '-',
                },
                {
                  label: t('parent.fundraisingApplied'),
                  value: financials.fundraising,
                  color: 'text-emerald-600',
                  show: financials.fundraising > 0,
                  sign: '-',
                },
                {
                  label: t('parent.sponsorshipsApplied'),
                  value: financials.sponsorships,
                  color: 'text-violet-600',
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
                    className="flex justify-between items-center py-3 border-b border-slate-50 dark:border-slate-700 last:border-0"
                  >
                    <span className="text-sm text-slate-500">{row.label}</span>
                    <span className={`font-bold text-sm ${row.color}`}>
                      {row.sign}
                      {formatMoney(row.value)}
                    </span>
                  </div>
                ))}
              <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-slate-200 dark:border-slate-700">
                <span className="text-sm font-black text-slate-800 dark:text-white">
                  {t('parent.remainingBalance')}
                </span>
                <span
                  className={`text-lg font-black ${financials.remainingBalance <= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                >
                  {financials.remainingBalance <= 0 ? formatMoney(0) : formatMoney(financials.remainingBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-widest flex items-center gap-2">
                <Receipt size={14} className="text-slate-400" /> {t('parent.transactions')} ({playerTransactions.length}
                )
              </h3>
            </div>

            {playerTransactions.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-bold text-sm">{t('parent.noTransactions')}</div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                {playerTransactions.map((tx) => {
                  const catLabel = CATEGORY_LABELS[tx.category] || tx.category || '';
                  const catColor = CATEGORY_COLORS[tx.category] || 'text-slate-500';
                  const isPositive = tx.amount > 0;

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isPositive ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-slate-50 dark:bg-slate-800'
                        }`}
                      >
                        {isPositive ? (
                          <TrendingUp size={14} className="text-emerald-500" />
                        ) : (
                          <Receipt size={14} className="text-slate-400" />
                        )}
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{tx.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-black uppercase ${catColor}`}>{catLabel}</span>
                          <span className="text-[10px] text-slate-400">
                            {tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : ''}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`font-black text-sm shrink-0 ${isPositive ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-300'}`}
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
      </div>
    </div>
  );
}
