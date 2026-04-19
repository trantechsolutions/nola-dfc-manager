import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardCheck,
  Save,
  ChevronDown,
  ChevronRight,
  Check,
  FileText,
  Settings,
  Lock,
  UserPlus,
  X,
  Search,
} from 'lucide-react';
import { supabase } from '../../supabase';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import { getUSAgeGroup } from '../../utils/ageGroup';
import JerseyBadge from '../../components/JerseyBadge';
import { DEFAULT_EVAL_SECTIONS, RATING_LABELS, countSkills } from '../../utils/defaultEvaluationRubric';
import { hasPermission, PERMISSIONS } from '../../utils/roles';
import RubricEditor from './RubricEditor';

// Only these roles may submit evaluations (matches CLUB_EVALUATE_PLAYERS in roles.js).
const COACH_ROLES = new Set(['head_coach', 'assistant_coach', 'club_admin', 'super_admin']);

export default function SeasonEvaluationView({
  players,
  selectedSeason,
  selectedTeamId,
  teamSeasonId,
  clubId,
  showToast,
  user,
  userRoles = [],
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
  const [rubricSections, setRubricSections] = useState(DEFAULT_EVAL_SECTIONS);
  const [customRubric, setCustomRubric] = useState(null); // null = using default
  const [showRubricEditor, setShowRubricEditor] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState([]);
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [clubPlayers, setClubPlayers] = useState([]);
  const [guestPickerSearch, setGuestPickerSearch] = useState('');
  const [loadingClubPlayers, setLoadingClubPlayers] = useState(false);

  const canEvaluate = useMemo(
    () => hasPermission(userRoles, PERMISSIONS.CLUB_EVALUATE_PLAYERS, selectedTeamId),
    [userRoles, selectedTeamId],
  );
  const canManageRubric = useMemo(
    () => hasPermission(userRoles, PERMISSIONS.TEAM_MANAGE_RUBRIC, selectedTeamId),
    [userRoles, selectedTeamId],
  );

  const totalSkills = useMemo(() => countSkills(rubricSections), [rubricSections]);

  // Load custom rubric for this team (falls back to default)
  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    (async () => {
      try {
        const custom = await supabaseService.getTeamRubric(selectedTeamId);
        if (cancelled) return;
        if (custom && Array.isArray(custom.sections) && custom.sections.length > 0) {
          setCustomRubric(custom);
          setRubricSections(custom.sections);
        } else {
          setCustomRubric(null);
          setRubricSections(DEFAULT_EVAL_SECTIONS);
        }
      } catch {
        if (!cancelled) {
          setCustomRubric(null);
          setRubricSections(DEFAULT_EVAL_SECTIONS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  // Load team staff (coaches only) for evaluator selector
  useEffect(() => {
    if (!selectedTeamId) return;
    const fetchStaff = async () => {
      try {
        const { data: teamRoles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .eq('team_id', selectedTeamId);
        const { data: clubRoles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .not('club_id', 'is', null);
        const combined = [...(teamRoles || []), ...(clubRoles || [])].filter((r) => COACH_ROLES.has(r.role));
        const uniqueIds = [...new Set(combined.map((r) => r.user_id))];
        let profileMap = {};
        if (uniqueIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('user_id, display_name, email')
            .in('user_id', uniqueIds);
          for (const p of profiles || []) profileMap[p.user_id] = p;
        }
        const unique = {};
        for (const r of combined) {
          if (!unique[r.user_id]) {
            const profile = profileMap[r.user_id];
            unique[r.user_id] = {
              userId: r.user_id,
              displayName: profile?.display_name || profile?.email || r.user_id.slice(0, 8),
              role: r.role,
            };
          }
        }
        const staffList = Object.values(unique);
        setTeamStaff(staffList);
        // If the current evaluator isn't a coach, switch to the first coach (or null).
        setSelectedEvaluatorId((prev) => {
          if (prev && staffList.some((s) => s.userId === prev)) return prev;
          return staffList[0]?.userId || null;
        });
      } catch {
        /* noop */
      }
    };
    fetchStaff();
  }, [selectedTeamId]);

  // Load evaluations for the selected evaluator
  const loadEvaluations = useCallback(async () => {
    if (!selectedTeamId || !selectedSeason || !selectedEvaluatorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
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

      // Auto-load guest players: any player_id with evals for this team/season
      // that isn't on the current team's active roster.
      const rosterIds = new Set(players.map((p) => p.id));
      const guestIds = [...new Set((allEvals || []).map((e) => e.player_id))].filter((id) => !rosterIds.has(id));
      if (guestIds.length > 0 && clubId) {
        try {
          const all = await supabaseService.getPlayersByClub(clubId);
          const guests = all.filter((p) => guestIds.includes(p.id));
          setGuestPlayers((prev) => {
            const existing = new Set(prev.map((g) => g.id));
            const merged = [...prev];
            for (const g of guests) if (!existing.has(g.id)) merged.push(g);
            return merged;
          });
        } catch {
          /* noop */
        }
      }
    } catch (e) {
      console.error('Failed to load evaluations:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, selectedSeason, selectedEvaluatorId, clubId, players]);

  useEffect(() => {
    loadEvaluations();
  }, [loadEvaluations]);

  const activePlayers = useMemo(() => {
    const roster = players.filter((p) => p.status === 'active');
    const rosterIds = new Set(roster.map((p) => p.id));
    const guests = guestPlayers.filter((g) => !rosterIds.has(g.id)).map((g) => ({ ...g, isGuest: true }));
    return [...roster, ...guests];
  }, [players, guestPlayers]);

  const handleOpenGuestPicker = async () => {
    if (!clubId) {
      showToast?.('Club context unavailable', true);
      return;
    }
    setShowGuestPicker(true);
    setGuestPickerSearch('');
    setLoadingClubPlayers(true);
    try {
      const all = await supabaseService.getPlayersByClub(clubId);
      setClubPlayers(all);
    } catch {
      showToast?.('Failed to load club players', true);
    } finally {
      setLoadingClubPlayers(false);
    }
  };

  const handleAddGuest = (player) => {
    setGuestPlayers((prev) => (prev.some((g) => g.id === player.id) ? prev : [...prev, player]));
    setShowGuestPicker(false);
    setExpandedPlayer(player.id);
  };

  const handleRemoveGuest = (playerId) => {
    setGuestPlayers((prev) => prev.filter((g) => g.id !== playerId));
    if (expandedPlayer === playerId) setExpandedPlayer(null);
  };

  const getEval = (playerId) => evaluations[playerId] || { ratings: {}, notes: '', overallRating: null };

  const setRating = (playerId, category, value) => {
    setEvaluations((prev) => {
      const existing = prev[playerId] || { ratings: {}, notes: '', overallRating: null };
      const newRatings = { ...existing.ratings, [category]: value };
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
    if (!canEvaluate) {
      showToast?.('Only coaches can submit evaluations', true);
      return;
    }
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
    if (!canEvaluate) {
      showToast?.('Only coaches can submit evaluations', true);
      return;
    }
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

    let content = `Season Evaluation: ${selectedSeason}\n`;
    content += `Player: ${player.firstName} ${player.lastName} (#${player.jerseyNumber || '?'})\n\n`;
    for (const section of rubricSections) {
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck size={22} className="text-blue-500" />
            {t('seasonEval.title', 'Season Evaluations')}
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {selectedSeason} — {completedCount}/{activePlayers.length} {t('seasonEval.completed', 'completed')}
            {customRubric && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                Custom rubric
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageRubric && (
            <button
              onClick={() => setShowRubricEditor(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Add, remove, or rename sections/questions"
            >
              <Settings size={14} />
              {t('seasonEval.customizeRubric', 'Customize Rubric')}
            </button>
          )}
          {canEvaluate && clubId && (
            <button
              onClick={handleOpenGuestPicker}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Evaluate a player from another team in the club"
            >
              <UserPlus size={14} />
              {t('seasonEval.addGuestPlayer', 'Add Guest Player')}
            </button>
          )}
          {canEvaluate && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {t('seasonEval.saveAll', 'Save All')}
            </button>
          )}
        </div>
      </div>

      {/* Read-only banner for non-coaches */}
      {!canEvaluate && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <Lock size={14} className="shrink-0" />
          <span>
            {t(
              'seasonEval.viewOnlyNotice',
              'Only coaches (head coach, assistant coach) can submit evaluations. You have view-only access.',
            )}
          </span>
        </div>
      )}

      {/* Progress */}
      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${activePlayers.length > 0 ? (completedCount / activePlayers.length) * 100 : 0}%` }}
        />
      </div>

      {/* Coach Selector */}
      {canEvaluate && teamStaff.length > 0 && (
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
                    {player.isGuest && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                        title={player.teamName ? `Rostered on ${player.teamName}` : 'Guest player'}
                      >
                        Guest{player.teamName ? ` · ${player.teamName}` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {ratedCount}/{totalSkills} rated
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
                  {rubricSections.map((section) => (
                    <div key={section.key} className="space-y-3">
                      <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-1">
                        {section.label}
                      </h4>
                      {section.groups.map((group) => {
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
                                      onClick={() => canEvaluate && setRating(player.id, skill.key, val)}
                                      disabled={!canEvaluate}
                                      className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all ${
                                        ev.ratings[skill.key] === val
                                          ? RATING_LABELS[val].color
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600'
                                      } ${!canEvaluate ? 'cursor-not-allowed opacity-60' : ''}`}
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
                      readOnly={!canEvaluate}
                      rows={4}
                      placeholder={t(
                        'seasonEval.notesPlaceholder',
                        'Strengths, areas for improvement, overall assessment...',
                      )}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {canEvaluate && (
                      <button
                        onClick={() => handleSavePlayer(player.id)}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        <Save size={14} />
                        {t('seasonEval.saveEval', 'Save Evaluation')}
                      </button>
                    )}
                    <button
                      onClick={() => handleGeneratePdf(player)}
                      disabled={saving || !ev.overallRating}
                      className={`${canEvaluate ? '' : 'flex-1'} flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition-colors disabled:opacity-50`}
                    >
                      <FileText size={14} />
                      {t('seasonEval.saveToDocuments', 'Save to Documents')}
                    </button>
                    {player.isGuest && canEvaluate && !isSaved && (
                      <button
                        onClick={() => handleRemoveGuest(player.id)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-xs font-bold transition-colors"
                        title="Remove guest from list"
                      >
                        <X size={14} />
                      </button>
                    )}
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

      {showGuestPicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {t('seasonEval.pickGuestTitle', 'Add Guest Player')}
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {t('seasonEval.pickGuestHint', 'Players from other teams in the club')}
                </p>
              </div>
              <button
                onClick={() => setShowGuestPicker(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2">
                <Search size={14} className="text-slate-400" />
                <input
                  type="text"
                  value={guestPickerSearch}
                  onChange={(e) => setGuestPickerSearch(e.target.value)}
                  placeholder={t('common.search', 'Search...')}
                  className="flex-1 bg-transparent border-none text-sm text-slate-900 dark:text-white focus:ring-0 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loadingClubPlayers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-4 border-blue-200 dark:border-blue-800 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : (
                (() => {
                  const rosterIds = new Set(players.map((p) => p.id));
                  const guestIds = new Set(guestPlayers.map((g) => g.id));
                  const q = guestPickerSearch.trim().toLowerCase();
                  const list = clubPlayers
                    .filter((p) => !rosterIds.has(p.id) && !guestIds.has(p.id))
                    .filter((p) => {
                      if (!q) return true;
                      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
                      const team = (p.teamName || '').toLowerCase();
                      return name.includes(q) || team.includes(q);
                    });
                  if (list.length === 0) {
                    return (
                      <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">
                        {t('seasonEval.noGuestMatches', 'No matching club players.')}
                      </div>
                    );
                  }
                  return list.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddGuest(p)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                    >
                      <JerseyBadge number={p.jerseyNumber} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {p.firstName} {p.lastName}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          {p.teamName || t('seasonEval.noTeam', 'No team')}
                          {p.teamAgeGroup ? ` · ${p.teamAgeGroup}` : ''}
                        </p>
                      </div>
                      <UserPlus size={14} className="text-blue-500 shrink-0" />
                    </button>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      <RubricEditor
        open={showRubricEditor}
        onClose={() => setShowRubricEditor(false)}
        teamId={selectedTeamId}
        user={user}
        initialSections={customRubric ? customRubric.sections : null}
        onSaved={(nextSections) => {
          if (nextSections) {
            setCustomRubric({ sections: nextSections });
            setRubricSections(nextSections);
          } else {
            setCustomRubric(null);
            setRubricSections(DEFAULT_EVAL_SECTIONS);
          }
        }}
        showToast={showToast}
      />
    </div>
  );
}
