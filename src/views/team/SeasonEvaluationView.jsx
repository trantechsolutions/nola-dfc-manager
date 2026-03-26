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

const EVAL_SECTIONS = [
  {
    key: 'technical',
    label: 'Technical',
    groups: [
      {
        key: 'passing',
        label: 'Passing',
        skills: [
          { key: 'passing_pace', label: 'Proper Pace' },
          { key: 'passing_accuracy', label: 'Accuracy' },
          { key: 'passing_types', label: 'Ability to utilize different types of passes' },
          { key: 'passing_driven', label: 'Ability to hit a driven ball' },
          { key: 'passing_bothfeet', label: 'Can use both feet' },
        ],
      },
      {
        key: 'receiving',
        label: 'Receiving',
        skills: [
          { key: 'receiving_feet', label: 'Good 1st touch with feet, with & w/out pressure' },
          { key: 'receiving_body', label: 'Good 1st touch with body, with & w/out pressure' },
          { key: 'receiving_awaypressure', label: 'First touch is taken away from pressure' },
        ],
      },
      {
        key: 'dribbling',
        label: 'Dribbling',
        skills: [
          { key: 'dribble_comfortable', label: 'Comfortable on the ball' },
          { key: 'dribble_takeon', label: 'Can take players on' },
          { key: 'dribble_moves', label: 'Has moves that buy time and space' },
          { key: 'dribble_shield', label: 'Can hold a player off with the ball (shield)' },
          { key: 'dribble_bothfeet', label: 'Can use both feet' },
        ],
      },
      {
        key: 'finishing',
        label: 'Finishing',
        skills: [
          { key: 'finish_accuracy', label: 'Accuracy' },
          { key: 'finish_power', label: 'Power' },
          { key: 'finish_mentality', label: 'Mentality to finish' },
          { key: 'finish_opportunities', label: 'Finishes opportunities' },
          { key: 'finish_bothfeet', label: 'Can use both feet' },
        ],
      },
      {
        key: 'heading',
        label: 'Heading',
        skills: [
          { key: 'head_defensive', label: 'Defensive headers (high and far)' },
          { key: 'head_attacking', label: 'Attacking headers (low and accurate)' },
          { key: 'head_accuracy', label: 'Accuracy' },
        ],
      },
    ],
  },
  {
    key: 'tactical',
    label: 'Tactical',
    groups: [
      {
        key: 'attacking',
        label: 'Attacking Decisions',
        skills: [
          { key: 'atk_creativity', label: 'Creativity' },
          { key: 'atk_combination', label: 'Sees and executes combination play' },
          { key: 'atk_dynamic', label: 'Is dynamic with the ball' },
          { key: 'atk_supporting', label: 'Takes up supporting positions' },
          { key: 'atk_readgame', label: 'Has ability to read game' },
          { key: 'atk_movement', label: 'Has smart movement off the ball' },
          { key: 'atk_speedofplay', label: 'Speed of play' },
        ],
      },
      {
        key: 'defending',
        label: 'Defending Decisions',
        skills: [
          { key: 'def_chase', label: 'Immediate chase if you lose the ball' },
          { key: 'def_patience', label: 'Patience in 1v1 situations' },
          { key: 'def_cover', label: 'Provides good distance/angle for cover' },
          { key: 'def_balance', label: 'Provides balance away from ball' },
        ],
      },
    ],
  },
  {
    key: 'physical',
    label: 'Physical',
    groups: [
      {
        key: 'speed',
        label: 'Speed',
        skills: [
          { key: 'phys_techspeed', label: 'Technical speed (manipulate ball at speed & maintain control)' },
          { key: 'phys_actionspeed', label: 'Speed of Action (processing info & choosing response)' },
          { key: 'phys_mentalspeed', label: 'Mental Speed (awareness of all factors/options)' },
          { key: 'phys_purespeed', label: 'Pure Speed (overcoming distance in shortest time)' },
        ],
      },
    ],
  },
  {
    key: 'psychological',
    label: 'Psychological',
    groups: [
      {
        key: 'mental',
        label: 'Mental Approach',
        skills: [
          { key: 'psych_instructions', label: 'Is willing to take instructions' },
          { key: 'psych_courageous', label: 'Is courageous & takes chances' },
          { key: 'psych_passion', label: 'Shows a passion for the game' },
          { key: 'psych_recover', label: 'Can recover after a mistake' },
          { key: 'psych_workrate', label: 'Has exemplary work rate' },
          { key: 'psych_trynew', label: 'Is willing to try new things' },
        ],
      },
    ],
  },
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
  const [evalCounts, setEvalCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [teamStaff, setTeamStaff] = useState([]);
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState(user?.id || null);

  // Load team staff for coach selector
  useEffect(() => {
    if (!selectedTeamId) return;
    const fetchStaff = async () => {
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('user_id, role, user_profiles(display_name, email)')
          .eq('team_id', selectedTeamId);
        // Also get club-level roles
        const { data: clubData } = await supabase
          .from('user_roles')
          .select('user_id, role, club_id, user_profiles(display_name, email)')
          .not('club_id', 'is', null);
        const combined = [...(data || []), ...(clubData || [])];
        const unique = {};
        for (const r of combined) {
          if (!unique[r.user_id]) {
            unique[r.user_id] = {
              userId: r.user_id,
              displayName: r.user_profiles?.display_name || r.user_profiles?.email || r.user_id,
              role: r.role,
            };
          }
        }
        setTeamStaff(Object.values(unique));
      } catch {
        /* noop */
      }
    };
    fetchStaff();
  }, [selectedTeamId]);

  // Load evaluations for the selected evaluator
  const loadEvaluations = useCallback(async () => {
    if (!selectedTeamId || !selectedSeason || !selectedEvaluatorId) return;
    setLoading(true);
    try {
      // Load evaluations for the selected evaluator
      const { data, error } = await supabase
        .from('season_evaluations')
        .select('*')
        .eq('team_id', selectedTeamId)
        .eq('season_id', selectedSeason)
        .eq('evaluator_id', selectedEvaluatorId);
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

      // Load ALL evaluations to show how many coaches have evaluated each player
      const { data: allEvals } = await supabase
        .from('season_evaluations')
        .select('player_id, evaluator_id')
        .eq('team_id', selectedTeamId)
        .eq('season_id', selectedSeason);
      const countMap = {};
      for (const ev of allEvals || []) {
        countMap[ev.player_id] = (countMap[ev.player_id] || 0) + 1;
      }
      setEvalCounts(countMap);
    } catch (e) {
      console.error('Failed to load evaluations:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, selectedSeason, selectedEvaluatorId]);

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
          evaluator_id: selectedEvaluatorId,
          ratings: ev.ratings,
          notes: ev.notes,
          overall_rating: ev.overallRating,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,team_id,season_id,evaluator_id' },
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
              evaluator_id: selectedEvaluatorId,
              ratings: ev.ratings,
              notes: ev.notes,
              overall_rating: ev.overallRating,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'player_id,team_id,season_id,evaluator_id' },
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
    for (const section of EVAL_SECTIONS) {
      content += `=== ${section.label} ===\n`;
      for (const group of section.groups) {
        content += `  ${group.label}:\n`;
        for (const skill of group.skills) {
          const rating = ev.ratings[skill.key];
          content += `    ${skill.label}: ${rating ? `${rating}/4 - ${RATING_LABELS[rating]?.label}` : 'Not rated'}\n`;
        }
      }
      content += '\n';
    }
    content += `Overall: ${ev.overallRating || 'N/A'}/4\n`;
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

      {/* Coach Selector */}
      {teamStaff.length > 0 && (
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5">
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
            {t('seasonEval.evaluatingAs', 'Evaluating as')}
          </span>
          <select
            value={selectedEvaluatorId || ''}
            onChange={(e) => setSelectedEvaluatorId(e.target.value)}
            className="flex-1 bg-transparent border-none text-sm font-bold text-blue-600 dark:text-blue-400 focus:ring-0 cursor-pointer"
          >
            {teamStaff.map((s) => (
              <option key={s.userId} value={s.userId} className="text-slate-900 dark:text-white">
                {s.displayName} ({s.role.replace('_', ' ')})
              </option>
            ))}
          </select>
        </div>
      )}

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
          const coachCount = evalCounts[player.id] || 0;
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
                    {ratedCount}/42 rated
                    {ev.overallRating && ` · Overall: ${ev.overallRating}/4`}
                    {coachCount > 0 && ` · ${coachCount} eval${coachCount > 1 ? 's' : ''}`}
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
                <div className="px-4 pb-4 space-y-5 border-t border-slate-100 dark:border-slate-800 pt-4">
                  {/* Sections: Technical, Tactical, Physical, Psychological */}
                  {EVAL_SECTIONS.map((section) => (
                    <div key={section.key} className="space-y-3">
                      <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-1">
                        {section.label}
                      </h4>
                      {section.groups.map((group) => {
                        // Compute group average
                        const groupScores = group.skills.map((s) => ev.ratings[s.key]).filter((v) => v > 0);
                        const groupAvg =
                          groupScores.length > 0
                            ? Math.round((groupScores.reduce((a, b) => a + b, 0) / groupScores.length) * 10) / 10
                            : null;
                        return (
                          <div key={group.key} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{group.label}</p>
                              {groupAvg && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-black ${RATING_LABELS[Math.round(groupAvg)]?.color || 'bg-slate-200 text-slate-600'}`}
                                >
                                  {groupAvg}
                                </span>
                              )}
                            </div>
                            {group.skills.map((skill) => (
                              <div key={skill.key} className="flex items-center gap-2">
                                <p className="flex-1 text-[11px] text-slate-600 dark:text-slate-400 leading-tight min-w-0">
                                  {skill.label}
                                </p>
                                <div className="flex gap-1 shrink-0">
                                  {[1, 2, 3, 4].map((val) => (
                                    <button
                                      key={val}
                                      onClick={() => setRating(player.id, skill.key, val)}
                                      className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all ${
                                        ev.ratings[skill.key] === val
                                          ? RATING_LABELS[val].color
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Coach's Comments */}
                  <div>
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      {t('seasonEval.coachNotes', "Coach's Comments")}
                    </p>
                    <textarea
                      value={ev.notes}
                      onChange={(e) => setNotes(player.id, e.target.value)}
                      rows={4}
                      placeholder={t(
                        'seasonEval.notesPlaceholder',
                        'Strengths, areas for improvement, overall assessment...',
                      )}
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
