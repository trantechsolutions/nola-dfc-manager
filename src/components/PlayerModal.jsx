import React, { useState, useEffect, useCallback } from 'react';
import { Eye, FileText, Trash2, FolderOpen } from 'lucide-react';
import MedicalReleaseForm from './MedicalReleaseForm';
import { supabaseService } from '../services/supabaseService';
import { useT } from '../i18n/I18nContext';
import { getUSAgeGroup, getAge } from '../utils/ageGroup';
import { DOC_TYPE_LABELS, DOC_STATUS_COLORS } from '../utils/constants';

const STATUS_COLORS = DOC_STATUS_COLORS;

export default function PlayerModal({
  player,
  selectedSeason,
  stats,
  onClose,
  onToggleCompliance,
  formatMoney,
  clubId,
  onRefresh,
  onViewAsParent,
  showToast,
  showConfirm,
}) {
  const { t } = useT();
  const [showMedicalForm, setShowMedicalForm] = useState(false);
  const [playerDocs, setPlayerDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const fetchPlayerDocs = useCallback(async () => {
    if (!player?.id) return;
    setDocsLoading(true);
    try {
      const docs = await supabaseService.getPlayerDocuments(player.id);
      setPlayerDocs(docs);
    } catch (e) {
      console.error('Failed to fetch documents', e);
    } finally {
      setDocsLoading(false);
    }
  }, [player?.id]);

  useEffect(() => {
    fetchPlayerDocs();
  }, [fetchPlayerDocs]);

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
          await supabaseService.updatePlayerField(player.id, 'medicalRelease', false);
          onRefresh?.();
        }
      }
      showToast?.(t('parent.docDeleted'));
      fetchPlayerDocs();
    } catch {
      showToast?.(t('parent.docDeleteFail'), true);
    }
  };

  if (!player) return null;

  // stats comes directly from the player_financials VIEW — no calculation needed
  const fin = stats || {
    baseFee: 0,
    totalPaid: 0,
    fundraising: 0,
    sponsorships: 0,
    credits: 0,
    remainingBalance: 0,
    feeWaived: false,
  };
  const isWaived = fin.feeWaived || player.seasonProfiles?.[selectedSeason]?.feeWaived === true;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl dark:shadow-none w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-800 dark:bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center bg-white text-slate-900 font-black h-8 w-8 rounded-full text-sm">
              {player.jerseyNumber || '-'}
            </span>
            <div className="flex flex-col">
              <h3 className="font-bold text-lg leading-tight flex items-center gap-2">
                {player.firstName} {player.lastName}
                {player.birthdate && getUSAgeGroup(player.birthdate, selectedSeason) && (
                  <span className="text-[9px] font-black bg-blue-500/30 text-blue-200 px-1.5 py-0.5 rounded-full">
                    {getUSAgeGroup(player.birthdate, selectedSeason)}
                  </span>
                )}
              </h3>
              {player.birthdate && (
                <span className="text-[10px] text-slate-400 mt-0.5">
                  {t('playerForm.age')} {getAge(player.birthdate)} &middot; DOB{' '}
                  {new Date(player.birthdate).toLocaleDateString()}
                </span>
              )}
              {isWaived && (
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest mt-0.5">
                  {t('playerModal.feeWaived')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onViewAsParent && (
              <button
                onClick={() => {
                  onClose();
                  onViewAsParent(player);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-slate-300 hover:text-white transition-colors"
                title="View as this player's parent"
              >
                <Eye size={12} /> {t('impersonation.viewAsParent')}
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-xl">
              &times;
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {/* Compliance Section */}
          <div className="mb-6 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {t('playerModal.playerSetup')}
            </h4>
            <div className="space-y-3">
              {/* Waiver — read-only, derived from uploaded documents */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">
                    {t('playerModal.medicalRelease')}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">{t('playerModal.medicalAuto')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMedicalForm(true)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                      player.medicalRelease
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-red-100 text-red-600 hover:bg-red-200'
                    }`}
                  >
                    {player.medicalRelease ? t('playerModal.onFile') + ' ✎' : t('playerModal.fillOut') + ' →'}
                  </button>
                </div>
              </div>
              {/* ReePlayer — manual switch, indicates account creation */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">
                    {t('playerModal.reeplayerAccount')}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">{t('playerModal.reeplayerHelp')}</p>
                </div>
                <button
                  onClick={() => onToggleCompliance(player.id, 'reePlayerWaiver', player.reePlayerWaiver)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${player.reePlayerWaiver ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${player.reePlayerWaiver ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Guardians */}
          {player.guardians?.length > 0 && (
            <div className="mb-6 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                {t('playerModal.guardians')}
              </h4>
              <div className="space-y-2">
                {player.guardians.map((g, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-bold text-slate-800 dark:text-white">{g.name}</p>
                    {g.email && <p className="text-slate-500 text-xs">{g.email}</p>}
                    {g.phone && <p className="text-slate-500 text-xs">{g.phone}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Summary — straight from player_financials view */}
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {t('playerModal.financialSummary')}
            </h4>

            {/* Balance Display */}
            <div className="text-center mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {isWaived ? t('playerModal.feeWaived') : t('playerModal.remainingBalance')}
              </p>
              <span
                className={`text-3xl font-black ${fin.remainingBalance > 0 && !isWaived ? 'text-red-500' : 'text-emerald-600'}`}
              >
                {isWaived ? formatMoney(0) : formatMoney(fin.remainingBalance)}
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none mt-4">
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 uppercase text-xs tracking-widest">
                {t('playerModal.feeBreakdown')}
              </h3>

              {isWaived && (
                <div className="bg-amber-50 text-amber-700 p-3 rounded-xl mb-4 text-xs font-bold border border-amber-200 flex items-center gap-2">
                  ⚠️ {t('playerModal.waivedMessage', { season: selectedSeason })}
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500">{t('playerModal.baseFee')}</span>
                  <span className={`font-bold ${isWaived ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                    {formatMoney(fin.baseFee)}
                  </span>
                </div>

                {fin.totalPaid > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-slate-500">{t('playerModal.teamFeesPaid')}</span>
                    <span className="font-bold text-emerald-600">-{formatMoney(fin.totalPaid)}</span>
                  </div>
                )}

                {fin.fundraising > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-slate-500">{t('playerModal.fundraisingApplied')}</span>
                    <span className="font-bold text-emerald-600">-{formatMoney(fin.fundraising)}</span>
                  </div>
                )}

                {fin.sponsorships > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-slate-500">{t('playerModal.sponsorshipsApplied')}</span>
                    <span className="font-bold text-emerald-600">-{formatMoney(fin.sponsorships)}</span>
                  </div>
                )}

                {fin.credits > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-slate-500 font-bold">{t('playerModal.creditsDiscounts')}</span>
                    <span className="font-bold text-blue-600">-{formatMoney(fin.credits)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Documents Section */}
          <div className="mt-6 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FolderOpen size={13} /> {t('parent.documents')} ({playerDocs.length})
            </h4>

            {docsLoading ? (
              <p className="text-xs text-slate-300 font-bold animate-pulse py-2">{t('common.loading')}...</p>
            ) : playerDocs.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">{t('parent.noDocuments')}</p>
            ) : (
              <div className="space-y-1.5">
                {playerDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700"
                  >
                    <FileText size={14} className="text-slate-400 shrink-0" />
                    <div className="flex-grow min-w-0">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase">
                          {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${STATUS_COLORS[doc.status] || 'bg-slate-100 text-slate-500'}`}
                        >
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
                        className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                        title={t('common.view')}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteDoc(doc)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <MedicalReleaseForm
          show={showMedicalForm}
          onClose={() => setShowMedicalForm(false)}
          player={player}
          clubId={clubId}
          seasonId={selectedSeason}
          onCompleted={() => {
            onRefresh?.();
            fetchPlayerDocs();
          }}
        />
      </div>
    </div>
  );
}
