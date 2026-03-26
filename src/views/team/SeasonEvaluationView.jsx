import { useState, useEffect, useMemo, useCallback } from 'react';
import { ClipboardCheck, Save, ChevronDown, ChevronRight, Check, FileText } from 'lucide-react';
import { supabase } from '../../supabase';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup } from '../../utils/ageGroup';
import JerseyBadge from '../../components/JerseyBadge';

const RATING_LABELS = {
  1: { label: 'Excellent', color: 'bg-emerald-500 text-white' },
  2: { label: 'Good', color: 'bg-blue-500 text-white' },
  3: { label: 'Needs Improvement', color: 'bg-amber-500 text-white' },
  4: { label: 'Below Expectations', color: 'bg-red-500 text-white' },
};

const DEFAULT_CATEGORIES = [
  { key: 'technical', label: 'Technical Skills' },
  { key: 'tactical', label: 'Tactical Awareness' },
  { key: 'physical', label: 'Physical Fitness' },
  { key: 'attitude', label: 'Attitude & Effort' },
  { key: 'teamwork', label: 'Teamwork' },
  { key: 'coachability', label: 'Coachability' },
];

export default function SeasonEvaluationView({
  players,
  selectedSeason,
  selectedTeamId,
  teamSeasonId,
  showToast,
  user,
}) {
  const { t } = useT();
  const [evaluations, setEvaluations] = useState({});
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedPlayers, setSavedPlayers] = useState(new Set());
  const [loading, setLoading] = useState(true);

  // Load existing evaluations from DB
  const loadEvaluations = useCallback(async () => {
    if (!selectedTeamId || !selectedSeason) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('season_evaluations')
        .select('*')
        .eq('team_id', selectedTeamId)
        .eq('season_id', selectedSeason);
      if (error) throw error;

      const evalMap = {};
      const saved = new Set();
      for (const ev of data || []) {
        evalMap[ev.player_id] = {
          ratings: ev.ratings || {},
          notes: ev.notes || '',
          overallRating: ev.overall_rating,
        };
        saved.add(ev.player_id);
      }
      setEvaluations(evalMap);
      setSavedPlayers(saved);
    } catch (e) {
      console.error('Failed to load evaluations:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, selectedSeason]);

  useEffect(() => {
    loadEvaluations();
  }, [loadEvaluations]);

  const activePlayers = useMemo(() => {
    return players.filter((p) => p.status === 'active');
  }, [players]);

  const getEval = (playerId) => evaluations[playerId] || { ratings: {}, notes: '', overallRating: null };

  const setRating = (playerId, category, value) => {
    setEvaluations((prev) => {
      const existing = prev[playerId] || { ratings: {}, notes: '', overallRating: null };
      const newRatings = { ...existing.ratings, [category]: value };
      // Compute overall as average
      const values = Object.values(newRatings).filter((v) => v > 0);
      const overall =
        values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
      return { ...prev, [playerId]: { ...existing, ratings: newRatings, overallRating: overall } };
    });
  };

  const setNotes = (playerId, notes) => {
    setEvaluations((prev) => {
      const existing = prev[playerId] || { ratings: {}, notes: '', overallRating: null };
      return { ...prev, [playerId]: { ...existing, notes } };
    });
  };

  const handleSavePlayer = async (playerId) => {
    const ev = getEval(playerId);
    setSaving(true);
    try {
      await supabase.from('season_evaluations').upsert(
        {
          player_id: playerId,
          team_id: selectedTeamId,
          season_id: selectedSeason,
          team_season_id: teamSeasonId || null,
          evaluator_id: user?.id,
          ratings: ev.ratings,
          notes: ev.notes,
          overall_rating: ev.overallRating,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,team_id,season_id' },
      );
      setSavedPlayers((prev) => new Set([...prev, playerId]));
      showToast?.('Evaluation saved');
    } catch (e) {
      showToast?.(`Save failed: ${e.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    let count = 0;
    try {
      for (const player of activePlayers) {
        const ev = getEval(player.id);
        if (Object.keys(ev.ratings).length > 0 || ev.notes) {
          await supabase.from('season_evaluations').upsert(
            {
              player_id: player.id,
              team_id: selectedTeamId,
              season_id: selectedSeason,
              team_season_id: teamSeasonId || null,
              evaluator_id: user?.id,
              ratings: ev.ratings,
              notes: ev.notes,
              overall_rating: ev.overallRating,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'player_id,team_id,season_id' },
          );
          count++;
        }
      }
      setSavedPlayers(
        new Set(
          activePlayers
            .filter((p) => {
              const ev = getEval(p.id);
              return Object.keys(ev.ratings).length > 0 || ev.notes;
            })
            .map((p) => p.id),
        ),
      );
      showToast?.(`${count} evaluation(s) saved`);
    } catch (e) {
      showToast?.(`Save failed: ${e.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePdf = async (player) => {
    const ev = getEval(player.id);
    if (!ev.overallRating && Object.keys(ev.ratings).length === 0) {
      showToast?.('No evaluation data to export', true);
      return;
    }

    // Build a text summary and save as a document
    let content = `Season Evaluation: ${selectedSeason}\n`;
    content += `Player: ${player.firstName} ${player.lastName} (#${player.jerseyNumber || '?'})\n\n`;
    for (const cat of DEFAULT_CATEGORIES) {
      const rating = ev.ratings[cat.key];
      content += `${cat.label}: ${rating ? `${rating}/4 - ${RATING_LABELS[rating]?.label}` : 'Not rated'}\n`;
    }
    content += `\nOverall: ${ev.overallRating || 'N/A'}/4\n`;
    if (ev.notes) content += `\nCoach Notes:\n${ev.notes}\n`;

    try {
      // Save as a document record linked to the player
      await supabaseService.uploadDocumentRecord({
        playerId: player.id,
        teamId: selectedTeamId,
        clubId: player.clubId,
        seasonId: selectedSeason,
        docType: 'season_evaluation',
        title: `${selectedSeason} Season Evaluation`,
        fileName: `eval_${selectedSeason}_${player.lastName}.txt`,
        mimeType: 'text/plain',
        fileSize: content.length,
        status: 'verified',
        verifiedBy: user?.id,
      });
      showToast?.(`Evaluation saved to ${player.firstName}'s documents`);
    } catch (e) {
      showToast?.(`Failed to save document: ${e.message}`, true);
    }
  };

  const completedCount = activePlayers.filter((p) => savedPlayers.has(p.id)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-800 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck size={22} className="text-blue-500" />
            {t('seasonEval.title', 'Season Evaluations')}
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {selectedSeason} — {completedCount}/{activePlayers.length} {t('seasonEval.completed', 'completed')}
          </p>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {t('seasonEval.saveAll', 'Save All')}
        </button>
      </div>

      {/* Progress */}
      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${activePlayers.length > 0 ? (completedCount / activePlayers.length) * 100 : 0}%` }}
        />
      </div>

      {/* Rating Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(RATING_LABELS).map(([val, info]) => (
          <span key={val} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${info.color}`}>
            {val} = {info.label}
          </span>
        ))}
      </div>

      {/* Player List */}
      <div className="space-y-2">
        {activePlayers.map((player) => {
          const ev = getEval(player.id);
          const isExpanded = expandedPlayer === player.id;
          const isSaved = savedPlayers.has(player.id);
          const ratedCount = Object.values(ev.ratings).filter((v) => v > 0).length;
          const ageGroup = player.birthdate && selectedSeason ? getUSAgeGroup(player.birthdate, selectedSeason) : null;

          return (
            <div
              key={player.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all ${
                isSaved ? 'border-emerald-200 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {/* Player Header */}
              <button
                onClick={() => setExpandedPlayer(isExpanded ? null : player.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <JerseyBadge number={player.jerseyNumber} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {player.firstName} {player.lastName}
                    </p>
                    {ageGroup && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {ageGroup}
                      </span>
                    )}
                    {isSaved && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-0.5">
                        <Check size={10} /> Saved
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {ratedCount}/{DEFAULT_CATEGORIES.length} rated
                    {ev.overallRating && ` · Overall: ${ev.overallRating}/4`}
                  </p>
                </div>
                {ev.overallRating && (
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${
                      RATING_LABELS[Math.round(ev.overallRating)]?.color || 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {ev.overallRating}
                  </span>
                )}
                {isExpanded ? (
                  <ChevronDown size={16} className="text-slate-400" />
                ) : (
                  <ChevronRight size={16} className="text-slate-400" />
                )}
              </button>

              {/* Expanded Evaluation Form */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                  {/* Category Ratings */}
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <div key={cat.key}>
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">{cat.label}</p>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map((val) => (
                          <button
                            key={val}
                            onClick={() => setRating(player.id, cat.key, val)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                              ev.ratings[cat.key] === val
                                ? RATING_LABELS[val].color + ' shadow-md'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Notes */}
                  <div>
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      {t('seasonEval.coachNotes', 'Coach Notes')}
                    </p>
                    <textarea
                      value={ev.notes}
                      onChange={(e) => setNotes(player.id, e.target.value)}
                      rows={3}
                      placeholder={t('seasonEval.notesPlaceholder', 'Strengths, areas for improvement, comments...')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSavePlayer(player.id)}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      <Save size={14} />
                      {t('seasonEval.saveEval', 'Save Evaluation')}
                    </button>
                    <button
                      onClick={() => handleGeneratePdf(player)}
                      disabled={saving || !ev.overallRating}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      <FileText size={14} />
                      {t('seasonEval.saveToDocuments', 'Save to Documents')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {activePlayers.length === 0 && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
          {t('seasonEval.noPlayers', 'No active players to evaluate.')}
        </div>
      )}
    </div>
  );
}
