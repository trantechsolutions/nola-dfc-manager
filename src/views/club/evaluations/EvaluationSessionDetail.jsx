import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Upload,
  ClipboardList,
  BarChart3,
  MapPin,
  Plus,
  Trash2,
  Save,
  Check,
  X,
  Users,
  RefreshCw,
  Zap,
  Download,
} from 'lucide-react';
import { useT } from '../../../i18n/I18nContext';
import { useEvaluationManager } from '../../../hooks/useEvaluationManager';
import { supabaseService } from '../../../services/supabaseService';
import { getUSAgeGroup } from '../../../utils/ageGroup';

const TABS = [
  { key: 'setup', icon: Settings, labelKey: 'evaluations.tabs.setup', fallback: 'Setup' },
  { key: 'roster', icon: ClipboardList, labelKey: 'evaluations.tabs.roster', fallback: 'Roster' },
  { key: 'scoring', icon: Users, labelKey: 'evaluations.tabs.scoring', fallback: 'Scoring' },
  { key: 'results', icon: BarChart3, labelKey: 'evaluations.tabs.results', fallback: 'Results' },
  { key: 'placement', icon: MapPin, labelKey: 'evaluations.tabs.placement', fallback: 'Placement' },
];

const STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  scoring: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  finalized: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
};

function scoreColor(score, scale) {
  const pct = (score / scale) * 100;
  if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreColorBg(score, scale) {
  const pct = (score / scale) * 100;
  if (pct >= 80) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
  if (pct >= 60) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
  return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
}

export default function EvaluationSessionDetail({ sessionId, club, teams, seasons, user, showToast, showConfirm }) {
  const { t } = useT();
  const mgr = useEvaluationManager(club.id, sessionId);
  const {
    session,
    categories,
    candidates,
    scores,
    evaluators,
    thresholds,
    loading,
    updateSession,
    saveCategories,
    importCandidates,
    matchToPlayers,
    deleteCandidate,
    submitScore,
    fetchScores,
    addEvaluator,
    removeEvaluator,
    saveThresholds,
    computeScores,
    autoPlace,
    manualPlace,
    finalize,
  } = mgr;

  const [activeTab, setActiveTab] = useState('setup');

  // ---- Setup state ----
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editScale, setEditScale] = useState(5);
  const [editCategories, setEditCategories] = useState([]);
  const [newEvaluatorId, setNewEvaluatorId] = useState('');
  const [editThresholds, setEditThresholds] = useState([]);

  // ---- Roster state ----
  const [csvPreview, setCsvPreview] = useState(null);
  const fileInputRef = useRef(null);
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [clubPlayers, setClubPlayers] = useState([]);
  const [clubPickerSearch, setClubPickerSearch] = useState('');
  const [selectedClubPlayerIds, setSelectedClubPlayerIds] = useState(new Set());

  // ---- Scoring state ----
  const [localScores, setLocalScores] = useState({});

  // Sync from hook data
  useEffect(() => {
    if (session) {
      setEditName(session.name || '');
      setEditDesc(session.description || '');
      setEditScale(session.scoreScale || 5);
    }
  }, [session]);

  useEffect(() => {
    setEditCategories(categories.map((c) => ({ ...c })));
  }, [categories]);

  useEffect(() => {
    if (teams && teams.length) {
      const existing = new Map(thresholds.map((th) => [th.teamId, th]));
      setEditThresholds(
        teams.map((tm) => ({
          teamId: tm.id,
          teamName: tm.name,
          minScore: existing.get(tm.id)?.minScore ?? 0,
          maxRoster: existing.get(tm.id)?.maxRoster ?? 20,
        })),
      );
    }
  }, [teams, thresholds]);

  // Load scores when switching to scoring tab
  useEffect(() => {
    if (activeTab === 'scoring' || activeTab === 'results') {
      fetchScores();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build local score lookup
  useEffect(() => {
    const map = {};
    scores.forEach((s) => {
      const key = `${s.candidateId}_${s.categoryId}_${s.evaluatorId}`;
      map[key] = s.score;
    });
    setLocalScores(map);
  }, [scores]);

  // ---- Handlers ----

  const handleSaveSetup = async () => {
    try {
      await updateSession({ name: editName, description: editDesc, scoreScale: editScale });
      showToast?.(t('evaluations.saved', 'Session updated.'));
    } catch {
      showToast?.(t('evaluations.saveFailed', 'Save failed.'), true);
    }
  };

  const handleSaveCategories = async () => {
    try {
      await saveCategories(editCategories.map(({ id, name, weight }) => ({ id, name, weight: Number(weight) || 1 })));
      showToast?.(t('evaluations.categoriesSaved', 'Categories saved.'));
    } catch {
      showToast?.(t('evaluations.saveFailed', 'Save failed.'), true);
    }
  };

  const handleAddCategory = () => {
    setEditCategories((prev) => [...prev, { id: null, name: '', weight: 1 }]);
  };

  const handleRemoveCategory = (idx) => {
    setEditCategories((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateCategory = (idx, field, value) => {
    setEditCategories((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const handleAddEvaluator = async () => {
    if (!newEvaluatorId.trim()) return;
    try {
      await addEvaluator(newEvaluatorId.trim(), newEvaluatorId.trim());
      setNewEvaluatorId('');
      showToast?.(t('evaluations.evaluatorAdded', 'Evaluator added.'));
    } catch {
      showToast?.(t('evaluations.evaluatorFailed', 'Failed to add evaluator.'), true);
    }
  };

  const handleRemoveEvaluator = async (evalId) => {
    try {
      await removeEvaluator(evalId);
      showToast?.(t('evaluations.evaluatorRemoved', 'Evaluator removed.'));
    } catch {
      showToast?.(t('evaluations.evaluatorFailed', 'Failed to remove evaluator.'), true);
    }
  };

  const handleSaveThresholds = async () => {
    try {
      await saveThresholds(editThresholds);
      showToast?.(t('evaluations.thresholdsSaved', 'Thresholds saved.'));
    } catch {
      showToast?.(t('evaluations.saveFailed', 'Save failed.'), true);
    }
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        showToast?.(t('evaluations.csvEmpty', 'CSV file is empty or has no data rows.'), true);
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const rows = lines
        .slice(1)
        .map((line) => {
          const cols = line.split(',').map((c) => c.trim());
          const row = {};
          headers.forEach((h, i) => {
            row[h] = cols[i] || '';
          });
          return {
            firstName: row['first name'] || row['firstname'] || '',
            lastName: row['last name'] || row['lastname'] || '',
            bibNumber: parseInt(row['bib'] || row['bib number'] || row['bib#'] || '', 10) || null,
            birthdate: row['birthdate'] || row['dob'] || '',
            gender: row['gender'] || row['sex'] || '',
            ageGroup: row['age group'] || row['agegroup'] || '',
            position: row['position'] || '',
            notes: row['notes'] || '',
          };
        })
        .filter((r) => r.firstName || r.lastName);
      setCsvPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!csvPreview?.length) return;
    try {
      await importCandidates(csvPreview);
      setCsvPreview(null);
      showToast?.(t('evaluations.imported', 'Candidates imported.'));
    } catch {
      showToast?.(t('evaluations.importFailed', 'Import failed.'), true);
    }
  };

  const handleOpenClubPicker = async () => {
    try {
      const players = await supabaseService.getPlayersByClub(club.id);
      // Filter out players already added as candidates
      const existingPlayerIds = new Set(candidates.filter((c) => c.playerId).map((c) => c.playerId));
      setClubPlayers(players.filter((p) => !existingPlayerIds.has(p.id)));
      setSelectedClubPlayerIds(new Set());
      setClubPickerSearch('');
      setShowClubPicker(true);
    } catch (e) {
      showToast?.('Failed to load club players', true);
    }
  };

  const handleAddClubPlayers = async () => {
    if (selectedClubPlayerIds.size === 0) return;
    const toAdd = clubPlayers
      .filter((p) => selectedClubPlayerIds.has(p.id))
      .map((p) => {
        // Derive gender from the player's team if available
        const playerTeam = teams.find((t) => t.id === p.teamId);
        const gender = playerTeam?.gender || '';
        return {
          playerId: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          birthdate: p.birthdate || '',
          gender,
          ageGroup: p.birthdate && session?.seasonId ? getUSAgeGroup(p.birthdate, session.seasonId) : '',
          position: '',
          notes: '',
          bibNumber: null,
        };
      });
    try {
      await importCandidates(toAdd);
      setShowClubPicker(false);
      showToast?.(`${toAdd.length} player(s) added from club roster`);
    } catch {
      showToast?.('Failed to add players', true);
    }
  };

  const toggleClubPlayer = (id) => {
    setSelectedClubPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteCandidate = async (id) => {
    const ok = await showConfirm?.(t('evaluations.confirmDeleteCandidate', 'Remove this candidate?'));
    if (!ok) return;
    try {
      await deleteCandidate(id);
      showToast?.(t('evaluations.candidateDeleted', 'Candidate removed.'));
    } catch {
      showToast?.(t('evaluations.deleteFailed', 'Delete failed.'), true);
    }
  };

  const handleSubmitScore = async (candidateId, categoryId, score) => {
    const key = `${candidateId}_${categoryId}_${user.id}`;
    setLocalScores((prev) => ({ ...prev, [key]: score }));
    try {
      await submitScore({ candidateId, categoryId, evaluatorId: user.id, score });
    } catch {
      showToast?.(t('evaluations.scoreFailed', 'Failed to save score.'), true);
    }
  };

  const handleComputeScores = async () => {
    try {
      await computeScores();
      showToast?.(t('evaluations.scoresComputed', 'Scores computed.'));
    } catch {
      showToast?.(t('evaluations.computeFailed', 'Compute failed.'), true);
    }
  };

  const handleAutoPlace = async () => {
    try {
      const result = await autoPlace();
      showToast?.(t('evaluations.autoPlaced', 'Auto-placement complete.'));
    } catch {
      showToast?.(t('evaluations.placementFailed', 'Placement failed.'), true);
    }
  };

  const handleFinalize = async () => {
    const ok = await showConfirm?.(
      t(
        'evaluations.confirmFinalize',
        'Finalize all placements? This will create player records and cannot be undone.',
      ),
    );
    if (!ok) return;
    try {
      const result = await finalize();
      showToast?.(t('evaluations.finalized', 'Placements finalized!'));
    } catch {
      showToast?.(t('evaluations.finalizeFailed', 'Finalization failed.'), true);
    }
  };

  const handleManualPlace = async (candidateId, teamId) => {
    try {
      await manualPlace(candidateId, teamId || null);
    } catch {
      showToast?.(t('evaluations.placementFailed', 'Placement failed.'), true);
    }
  };

  // ---- Computed ----
  const scale = session?.scoreScale || editScale || 5;

  const scoredCount = candidates.filter((c) => {
    return categories.every((cat) => {
      const key = `${c.id}_${cat.id}_${user.id}`;
      return localScores[key] !== undefined;
    });
  }).length;

  const placedCount = candidates.filter((c) => c.placementStatus === 'placed').length;
  const unplacedCount = candidates.length - placedCount;
  const newPlayersCount = candidates.filter((c) => c.placementStatus === 'placed' && !c.matchedPlayerId).length;

  // ---- Loading ----
  if (loading && !session) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={24} className="animate-spin text-indigo-500 dark:text-indigo-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        {t('evaluations.sessionNotFound', 'Session not found.')}
      </div>
    );
  }

  // ================= RENDER =================

  return (
    <div className="space-y-5">
      {/* ---- Header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{session.name}</h3>
          <span
            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[session.status] || STATUS_COLORS.draft}`}
          >
            {session.status || 'draft'}
          </span>
        </div>
        {loading && <RefreshCw size={16} className="animate-spin text-slate-400 dark:text-slate-500" />}
      </div>

      {/* ---- Tab Bar ---- */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
        {TABS.map(({ key, icon: Icon, labelKey, fallback }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === key
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon size={16} />
            <span className="hidden sm:inline">{t(labelKey, fallback)}</span>
          </button>
        ))}
      </div>

      {/* ---- Tab Content ---- */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        {activeTab === 'setup' && renderSetupTab()}
        {activeTab === 'roster' && renderRosterTab()}
        {activeTab === 'scoring' && renderScoringTab()}
        {activeTab === 'results' && renderResultsTab()}
        {activeTab === 'placement' && renderPlacementTab()}
      </div>
    </div>
  );

  // ===================================================================
  //  TAB 1: SETUP
  // ===================================================================
  function renderSetupTab() {
    return (
      <div className="space-y-8">
        {/* Session info */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {t('evaluations.sessionInfo', 'Session Info')}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t('evaluations.sessionName', 'Session Name')}
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t('evaluations.scoreScale', 'Score Scale')}
              </label>
              <div className="flex gap-2">
                {[5, 10].map((s) => (
                  <button
                    key={s}
                    onClick={() => setEditScale(s)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      editScale === s
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    1–{s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t('evaluations.description', 'Description')}
            </label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleSaveSetup}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
          >
            <Save size={16} />
            {t('common.save', 'Save')}
          </button>
        </section>

        {/* Categories */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {t('evaluations.scoringCategories', 'Scoring Categories')}
          </h4>
          <div className="space-y-2">
            {editCategories.map((cat, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  value={cat.name}
                  onChange={(e) => handleUpdateCategory(idx, 'name', e.target.value)}
                  placeholder={t('evaluations.categoryName', 'Category name')}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <input
                  type="number"
                  min={1}
                  value={cat.weight}
                  onChange={(e) => handleUpdateCategory(idx, 'weight', e.target.value)}
                  className="w-20 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center"
                  placeholder={t('evaluations.weight', 'Weight')}
                />
                <button
                  onClick={() => handleRemoveCategory(idx)}
                  className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddCategory}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              {t('evaluations.addCategory', 'Add Category')}
            </button>
            <button
              onClick={handleSaveCategories}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
            >
              <Save size={16} />
              {t('evaluations.saveCategories', 'Save Categories')}
            </button>
          </div>
        </section>

        {/* Evaluators */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {t('evaluations.evaluators', 'Evaluators')}
          </h4>
          <div className="space-y-2">
            {evaluators.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2"
              >
                <span className="text-sm text-slate-700 dark:text-slate-300">{ev.displayName || ev.userId}</span>
                <button
                  onClick={() => handleRemoveEvaluator(ev.id)}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {evaluators.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                {t('evaluations.noEvaluators', 'No evaluators added yet.')}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newEvaluatorId}
              onChange={(e) => setNewEvaluatorId(e.target.value)}
              placeholder={t('evaluations.evaluatorId', 'User ID')}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              onClick={handleAddEvaluator}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              {t('common.add', 'Add')}
            </button>
          </div>
        </section>

        {/* Team Thresholds */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {t('evaluations.teamThresholds', 'Team Thresholds')}
          </h4>
          <div className="space-y-2">
            {editThresholds.map((th, idx) => (
              <div
                key={th.teamId}
                className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3"
              >
                <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">{th.teamName}</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 dark:text-slate-400">
                    {t('evaluations.minScore', 'Min Score')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={th.minScore}
                    onChange={(e) =>
                      setEditThresholds((prev) =>
                        prev.map((t, i) => (i === idx ? { ...t, minScore: Number(e.target.value) } : t)),
                      )
                    }
                    className="w-20 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm text-slate-900 dark:text-white text-center"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 dark:text-slate-400">
                    {t('evaluations.maxRoster', 'Max Roster')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={th.maxRoster}
                    onChange={(e) =>
                      setEditThresholds((prev) =>
                        prev.map((t, i) => (i === idx ? { ...t, maxRoster: Number(e.target.value) } : t)),
                      )
                    }
                    className="w-20 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm text-slate-900 dark:text-white text-center"
                  />
                </div>
              </div>
            ))}
            {editThresholds.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                {t('evaluations.noTeams', 'No teams available.')}
              </p>
            )}
          </div>
          {editThresholds.length > 0 && (
            <button
              onClick={handleSaveThresholds}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
            >
              <Save size={16} />
              {t('evaluations.saveThresholds', 'Save Thresholds')}
            </button>
          )}
        </section>
      </div>
    );
  }

  // ===================================================================
  //  TAB 2: ROSTER
  // ===================================================================
  function renderRosterTab() {
    return (
      <div className="space-y-6">
        {/* Template + Import Actions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800 dark:text-white">
              {t('evaluations.importRoster', 'Import Roster')}
            </h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const template =
                    'First Name,Last Name,Bib,Birthdate,Gender,Age Group,Position,Notes\nJohn,Doe,1,2012-05-15,Boys,U14,Forward,\nJane,Smith,2,2013-01-20,Girls,U13,Midfielder,';
                  const blob = new Blob([template], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'evaluation_roster_template.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium transition-colors"
              >
                <Download size={14} />
                {t('evaluations.downloadTemplate', 'Download Template')}
              </button>
              <button
                onClick={handleOpenClubPicker}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
              >
                <Users size={14} />
                {t('evaluations.addFromClub', 'Add from Club')}
              </button>
              <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleCsvUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
              >
                <Upload size={14} />
                {t('evaluations.importCsv', 'Import CSV')}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {t(
              'evaluations.importHint',
              'CSV columns: First Name, Last Name, Bib, Birthdate (YYYY-MM-DD), Gender (Boys/Girls), Age Group, Position, Notes. Gender enforces team placement rules — boys can only be placed on boys teams, girls on girls teams, coed teams accept both.',
            )}
          </p>
          {candidates.length > 0 && (
            <button
              onClick={async () => {
                try {
                  const result = await matchToPlayers();
                  showToast?.(t('evaluations.matchComplete', `Matched ${result} candidate(s) to existing players.`));
                } catch {
                  showToast?.(t('evaluations.matchFailed', 'Match failed.'), true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/30 text-xs font-medium transition-colors"
            >
              <RefreshCw size={14} />
              {t('evaluations.matchToPlayers', 'Match to Existing Players')}
            </button>
          )}
        </div>

        {/* CSV Preview */}
        {csvPreview && (
          <div className="space-y-3 border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {t('evaluations.csvPreview', 'CSV Preview')} — {csvPreview.length} {t('evaluations.rows', 'rows')}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase">
                    <th className="px-3 py-2">{t('evaluations.firstName', 'First Name')}</th>
                    <th className="px-3 py-2">{t('evaluations.lastName', 'Last Name')}</th>
                    <th className="px-3 py-2">Bib</th>
                    <th className="px-3 py-2">{t('evaluations.birthdate', 'Birthdate')}</th>
                    <th className="px-3 py-2">{t('evaluations.ageGroup', 'Age Group')}</th>
                    <th className="px-3 py-2">{t('evaluations.position', 'Position')}</th>
                    <th className="px-3 py-2">{t('evaluations.notes', 'Notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="border-t border-amber-200 dark:border-amber-700/50">
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.firstName}</td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.lastName}</td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.bibNumber || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.birthdate}</td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.ageGroup}</td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.position}</td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvPreview.length > 10 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 px-3">
                  ...{t('evaluations.andMore', 'and {{n}} more', { n: csvPreview.length - 10 })}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
              >
                <Check size={16} />
                {t('evaluations.confirmImport', 'Confirm Import')}
              </button>
              <button
                onClick={() => setCsvPreview(null)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-medium transition-colors"
              >
                <X size={16} />
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Candidate List */}
        <div className="space-y-2">
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic py-4 text-center">
              {t('evaluations.noCandidates', 'No candidates yet. Import from CSV to get started.')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2">{t('evaluations.name', 'Name')}</th>
                    <th className="px-3 py-2">{t('evaluations.ageGroup', 'Age Group')}</th>
                    <th className="px-3 py-2">{t('evaluations.position', 'Position')}</th>
                    <th className="px-3 py-2">{t('evaluations.matchStatus', 'Match Status')}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-medium">
                        {c.bibNumber && (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-black mr-2">
                            {c.bibNumber}
                          </span>
                        )}
                        {c.firstName} {c.lastName}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{c.ageGroup || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{c.position || '—'}</td>
                      <td className="px-3 py-2">
                        {c.matchedPlayerId ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check size={12} /> {t('evaluations.linked', 'Linked')}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {t('evaluations.unlinked', 'Unlinked')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleDeleteCandidate(c.id)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Club Player Picker Modal */}
        {showClubPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowClubPicker(false)} />
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users size={16} className="text-blue-500" />
                  {t('evaluations.addFromClub', 'Add from Club Roster')}
                  {selectedClubPlayerIds.size > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold">
                      {selectedClubPlayerIds.size} selected
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setShowClubPicker(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                <input
                  type="text"
                  placeholder="Search players..."
                  value={clubPickerSearch}
                  onChange={(e) => setClubPickerSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {clubPlayers
                  .filter((p) => {
                    if (!clubPickerSearch) return true;
                    const q = clubPickerSearch.toLowerCase();
                    return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q);
                  })
                  .map((p) => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedClubPlayerIds.has(p.id)
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedClubPlayerIds.has(p.id)}
                        onChange={() => toggleClubPlayer(p.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {p.firstName} {p.lastName}
                          {p.jerseyNumber && (
                            <span className="ml-1.5 text-[10px] text-slate-400">#{p.jerseyNumber}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {p.teamName || 'Unassigned'}
                          {p.status === 'prospect' && ' · Prospect'}
                        </p>
                      </div>
                    </label>
                  ))}
                {clubPlayers.length === 0 && (
                  <p className="text-center py-8 text-sm text-slate-400">No club players available to add.</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setShowClubPicker(false)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddClubPlayers}
                  disabled={selectedClubPlayerIds.size === 0}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                >
                  Add {selectedClubPlayerIds.size || ''} Player{selectedClubPlayerIds.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===================================================================
  //  TAB 3: SCORING
  // ===================================================================
  function renderScoringTab() {
    return (
      <div className="space-y-6">
        {/* Progress */}
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('evaluations.progress', 'Progress')}
          </span>
          <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
            {scoredCount} / {candidates.length} {t('evaluations.candidatesScored', 'candidates scored')}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all"
            style={{ width: `${candidates.length ? (scoredCount / candidates.length) * 100 : 0}%` }}
          />
        </div>

        {categories.length === 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400 italic">
            {t('evaluations.noCategoriesWarning', 'No scoring categories defined. Set them up in the Setup tab.')}
          </p>
        )}

        {/* Candidate scoring cards */}
        <div className="space-y-4">
          {candidates.map((c) => (
            <div key={c.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
              <h5 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                {c.bibNumber && (
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-black">
                    {c.bibNumber}
                  </span>
                )}
                <span>
                  {c.firstName} {c.lastName}
                </span>
                {c.ageGroup && (
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({c.ageGroup})</span>
                )}
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categories.map((cat) => {
                  const key = `${c.id}_${cat.id}_${user.id}`;
                  const currentScore = localScores[key];
                  return (
                    <div key={cat.id} className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{cat.name}</span>
                      <div className="flex gap-1 flex-wrap">
                        {Array.from({ length: scale }, (_, i) => i + 1).map((val) => (
                          <button
                            key={val}
                            onClick={() => handleSubmitScore(c.id, cat.id, val)}
                            className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                              currentScore === val
                                ? 'bg-indigo-500 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {candidates.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">
            {t('evaluations.noCandidatesToScore', 'No candidates to score. Add candidates in the Roster tab.')}
          </p>
        )}
      </div>
    );
  }

  // ===================================================================
  //  TAB 4: RESULTS
  // ===================================================================
  function renderResultsTab() {
    const sorted = [...candidates].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));

    return (
      <div className="space-y-5">
        <div className="flex justify-end">
          <button
            onClick={handleComputeScores}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
          >
            <Zap size={16} />
            {t('evaluations.computeScores', 'Compute Scores')}
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">
            {t('evaluations.noResults', 'No results yet.')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">{t('evaluations.name', 'Name')}</th>
                  {categories.map((cat) => (
                    <th key={cat.id} className="px-3 py-2 text-center">
                      {cat.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center">{t('evaluations.overall', 'Overall')}</th>
                  <th className="px-3 py-2 text-center">{t('evaluations.evaluatorCount', 'Evaluators')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, idx) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                      {c.bibNumber && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black mr-1.5">
                          {c.bibNumber}
                        </span>
                      )}
                      {c.firstName} {c.lastName}
                    </td>
                    {categories.map((cat) => {
                      const catScore = c.categoryScores?.[cat.id];
                      return (
                        <td key={cat.id} className="px-3 py-2 text-center">
                          {catScore != null ? (
                            <span className={`font-semibold ${scoreColor(catScore, scale)}`}>
                              {catScore.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      {c.overallScore != null ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${scoreColorBg(c.overallScore, scale)}`}
                        >
                          {c.overallScore.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                      {c.evaluatorCount ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ===================================================================
  //  TAB 5: PLACEMENT
  // ===================================================================
  function renderPlacementTab() {
    const sorted = [...candidates].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));

    return (
      <div className="space-y-6">
        {/* Thresholds summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {editThresholds.map((th) => (
            <div key={th.teamId} className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{th.teamName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('evaluations.minScore', 'Min Score')}: {th.minScore} | {t('evaluations.maxRoster', 'Max Roster')}:{' '}
                {th.maxRoster}
              </p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAutoPlace}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
          >
            <Zap size={16} />
            {t('evaluations.autoPlace', 'Auto-Place')}
          </button>
          <button
            onClick={handleFinalize}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
          >
            <Check size={16} />
            {t('evaluations.finalize', 'Finalize')}
          </button>
        </div>

        {/* Placement stats */}
        <div className="flex gap-4 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{placedCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('evaluations.placed', 'Placed')}</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{unplacedCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('evaluations.unplaced', 'Unplaced')}</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{newPlayersCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('evaluations.newPlayers', 'New Players')}</p>
          </div>
        </div>

        {/* Candidate placement list */}
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">
            {t('evaluations.noCandidates', 'No candidates yet.')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">{t('evaluations.name', 'Name')}</th>
                  <th className="px-3 py-2 text-center">{t('evaluations.overall', 'Overall')}</th>
                  <th className="px-3 py-2">{t('evaluations.assignedTeam', 'Assigned Team')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                      {c.bibNumber && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black mr-1.5">
                          {c.bibNumber}
                        </span>
                      )}
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.overallScore != null ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${scoreColorBg(c.overallScore, scale)}`}
                        >
                          {c.overallScore.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={c.placedTeamId || ''}
                        onChange={(e) => handleManualPlace(c.id, e.target.value)}
                        className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="">{t('evaluations.unassigned', '— Unassigned —')}</option>
                        {teams.map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {tm.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
}
