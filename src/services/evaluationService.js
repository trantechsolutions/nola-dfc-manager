// src/services/evaluationService.js
// All database operations for the player evaluation system.
import { supabase } from '../supabase';

export const evaluationService = {
  // ─────────────────────────────────────────
  // SESSIONS
  // ─────────────────────────────────────────

  getSessions: async (clubId) => {
    const { data, error } = await supabase
      .from('evaluation_sessions')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((s) => ({
      id: s.id,
      clubId: s.club_id,
      seasonId: s.season_id,
      name: s.name,
      description: s.description,
      status: s.status,
      scoreScale: s.score_scale,
      createdBy: s.created_by,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));
  },

  getSession: async (sessionId) => {
    const { data, error } = await supabase.from('evaluation_sessions').select('*').eq('id', sessionId).single();
    if (error) throw error;
    return {
      id: data.id,
      clubId: data.club_id,
      seasonId: data.season_id,
      name: data.name,
      description: data.description,
      status: data.status,
      scoreScale: data.score_scale,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  },

  createSession: async ({ clubId, seasonId, name, description, scoreScale, createdBy }) => {
    const { data, error } = await supabase
      .from('evaluation_sessions')
      .insert({
        club_id: clubId,
        season_id: seasonId || null,
        name,
        description: description || null,
        score_scale: scoreScale || 5,
        created_by: createdBy,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateSession: async (sessionId, updates) => {
    const row = {};
    if ('name' in updates) row.name = updates.name;
    if ('description' in updates) row.description = updates.description;
    if ('status' in updates) row.status = updates.status;
    if ('scoreScale' in updates) row.score_scale = updates.scoreScale;
    if ('seasonId' in updates) row.season_id = updates.seasonId;
    row.updated_at = new Date().toISOString();
    const { error } = await supabase.from('evaluation_sessions').update(row).eq('id', sessionId);
    if (error) throw error;
  },

  deleteSession: async (sessionId) => {
    // CASCADE handles children (categories, candidates, scores, evaluators, thresholds)
    const { error } = await supabase.from('evaluation_sessions').delete().eq('id', sessionId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // CATEGORIES (scoring rubric)
  // ─────────────────────────────────────────

  getCategories: async (sessionId) => {
    const { data, error } = await supabase
      .from('evaluation_categories')
      .select('*')
      .eq('session_id', sessionId)
      .order('sort_order');
    if (error) throw error;
    return (data || []).map((c) => ({
      id: c.id,
      sessionId: c.session_id,
      name: c.name,
      description: c.description,
      weight: Number(c.weight),
      sortOrder: c.sort_order,
    }));
  },

  saveCategories: async (sessionId, categories) => {
    // Delete existing and re-insert (simpler than diff)
    await supabase.from('evaluation_categories').delete().eq('session_id', sessionId);
    if (categories.length === 0) return;
    const rows = categories.map((c, i) => ({
      session_id: sessionId,
      name: c.name,
      description: c.description || null,
      weight: c.weight || 1,
      sort_order: i,
    }));
    const { error } = await supabase.from('evaluation_categories').insert(rows);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // CANDIDATES (players being evaluated)
  // ─────────────────────────────────────────

  getCandidates: async (sessionId) => {
    const { data, error } = await supabase
      .from('evaluation_candidates')
      .select('*, teams(name)')
      .eq('session_id', sessionId)
      .order('last_name');
    if (error) throw error;
    return (data || []).map((c) => ({
      id: c.id,
      sessionId: c.session_id,
      playerId: c.player_id,
      firstName: c.first_name,
      lastName: c.last_name,
      bibNumber: c.bib_number,
      birthdate: c.birthdate,
      gender: c.gender,
      ageGroup: c.age_group,
      position: c.position,
      notes: c.notes,
      overallScore: c.overall_score ? Number(c.overall_score) : null,
      placedTeamId: c.placed_team_id,
      placedTeamName: c.teams?.name || null,
      placementStatus: c.placement_status,
    }));
  },

  importCandidates: async (sessionId, candidates) => {
    const rows = candidates.map((c) => ({
      session_id: sessionId,
      player_id: c.playerId || null,
      first_name: c.firstName,
      last_name: c.lastName,
      bib_number: c.bibNumber || null,
      birthdate: c.birthdate || null,
      gender: c.gender || null,
      age_group: c.ageGroup || null,
      position: c.position || null,
      notes: c.notes || null,
    }));
    const { data, error } = await supabase.from('evaluation_candidates').insert(rows).select();
    if (error) throw error;
    return data;
  },

  updateCandidate: async (candidateId, updates) => {
    const row = {};
    if ('overallScore' in updates) row.overall_score = updates.overallScore;
    if ('placedTeamId' in updates) row.placed_team_id = updates.placedTeamId;
    if ('placementStatus' in updates) row.placement_status = updates.placementStatus;
    if ('notes' in updates) row.notes = updates.notes;
    if ('position' in updates) row.position = updates.position;
    if ('bibNumber' in updates) row.bib_number = updates.bibNumber;
    if ('gender' in updates) row.gender = updates.gender;
    const { error } = await supabase.from('evaluation_candidates').update(row).eq('id', candidateId);
    if (error) throw error;
  },

  deleteCandidate: async (candidateId) => {
    const { error } = await supabase.from('evaluation_candidates').delete().eq('id', candidateId);
    if (error) throw error;
  },

  // Auto-match candidates to existing players by name + birthdate
  matchCandidatesToPlayers: async (sessionId, clubId) => {
    const candidates = await evaluationService.getCandidates(sessionId);
    const { data: players } = await supabase
      .from('players')
      .select('id, first_name, last_name, birthdate')
      .eq('club_id', clubId);

    let matched = 0;
    for (const candidate of candidates) {
      if (candidate.playerId) continue; // already matched
      const match = (players || []).find(
        (p) =>
          p.first_name.toLowerCase() === candidate.firstName.toLowerCase() &&
          p.last_name.toLowerCase() === candidate.lastName.toLowerCase() &&
          (!candidate.birthdate || p.birthdate === candidate.birthdate),
      );
      if (match) {
        await supabase.from('evaluation_candidates').update({ player_id: match.id }).eq('id', candidate.id);
        matched++;
      }
    }
    return matched;
  },

  // ─────────────────────────────────────────
  // SCORES
  // ─────────────────────────────────────────

  getScores: async (sessionId, evaluatorId = null) => {
    let query = supabase
      .from('evaluation_scores')
      .select('*, evaluation_candidates!inner(session_id)')
      .eq('evaluation_candidates.session_id', sessionId);
    if (evaluatorId) query = query.eq('evaluator_id', evaluatorId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((s) => ({
      id: s.id,
      candidateId: s.candidate_id,
      categoryId: s.category_id,
      evaluatorId: s.evaluator_id,
      score: Number(s.score),
      notes: s.notes,
    }));
  },

  saveScore: async ({ candidateId, categoryId, evaluatorId, score, notes }) => {
    const { error } = await supabase.from('evaluation_scores').upsert(
      {
        candidate_id: candidateId,
        category_id: categoryId,
        evaluator_id: evaluatorId,
        score,
        notes: notes || null,
      },
      { onConflict: 'candidate_id,category_id,evaluator_id' },
    );
    if (error) throw error;
  },

  saveBatchScores: async (scores) => {
    const rows = scores.map((s) => ({
      candidate_id: s.candidateId,
      category_id: s.categoryId,
      evaluator_id: s.evaluatorId,
      score: s.score,
      notes: s.notes || null,
    }));
    const { error } = await supabase
      .from('evaluation_scores')
      .upsert(rows, { onConflict: 'candidate_id,category_id,evaluator_id' });
    if (error) throw error;
  },

  // Get aggregated scores from the view
  getAggregatedScores: async (sessionId) => {
    const { data, error } = await supabase.from('evaluation_candidate_scores').select('*').eq('session_id', sessionId);
    if (error) throw error;
    return (data || []).map((s) => ({
      candidateId: s.candidate_id,
      sessionId: s.session_id,
      categoryId: s.category_id,
      categoryName: s.category_name,
      weight: Number(s.weight),
      scoreScale: s.score_scale,
      avgScore: Number(s.avg_score),
      evaluatorCount: s.evaluator_count,
    }));
  },

  // ─────────────────────────────────────────
  // EVALUATORS
  // ─────────────────────────────────────────

  getEvaluators: async (sessionId) => {
    const { data, error } = await supabase.from('evaluation_evaluators').select('*').eq('session_id', sessionId);
    if (error) throw error;
    return (data || []).map((e) => ({
      id: e.id,
      sessionId: e.session_id,
      userId: e.user_id,
      displayName: e.display_name || 'Evaluator',
    }));
  },

  addEvaluator: async (sessionId, userId, displayName) => {
    const { error } = await supabase
      .from('evaluation_evaluators')
      .upsert(
        { session_id: sessionId, user_id: userId, display_name: displayName || null },
        { onConflict: 'session_id,user_id' },
      );
    if (error) throw error;
  },

  removeEvaluator: async (evaluatorId) => {
    const { error } = await supabase.from('evaluation_evaluators').delete().eq('id', evaluatorId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // TEAM THRESHOLDS
  // ─────────────────────────────────────────

  getThresholds: async (sessionId) => {
    const { data, error } = await supabase
      .from('evaluation_team_thresholds')
      .select('*, teams(name, age_group, tier, gender)')
      .eq('session_id', sessionId)
      .order('sort_order');
    if (error) throw error;
    return (data || []).map((t) => ({
      id: t.id,
      sessionId: t.session_id,
      teamId: t.team_id,
      teamName: t.teams?.name || '',
      teamAgeGroup: t.teams?.age_group || '',
      teamGender: t.teams?.gender || '',
      teamTier: t.teams?.tier || '',
      minScore: Number(t.min_score),
      maxRoster: t.max_roster,
      sortOrder: t.sort_order,
    }));
  },

  saveThresholds: async (sessionId, thresholds) => {
    await supabase.from('evaluation_team_thresholds').delete().eq('session_id', sessionId);
    if (thresholds.length === 0) return;
    const rows = thresholds.map((t, i) => ({
      session_id: sessionId,
      team_id: t.teamId,
      min_score: t.minScore,
      max_roster: t.maxRoster || null,
      sort_order: i,
    }));
    const { error } = await supabase.from('evaluation_team_thresholds').insert(rows);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // SCORING + PLACEMENT LOGIC
  // ─────────────────────────────────────────

  // Compute overall scores for all candidates in a session
  computeOverallScores: async (sessionId) => {
    const aggregated = await evaluationService.getAggregatedScores(sessionId);

    // Group by candidate
    const byCand = {};
    for (const s of aggregated) {
      if (!byCand[s.candidateId]) byCand[s.candidateId] = [];
      byCand[s.candidateId].push(s);
    }

    // Compute weighted average for each candidate
    for (const [candidateId, scores] of Object.entries(byCand)) {
      const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
      if (totalWeight === 0) continue;

      const weightedSum = scores.reduce((sum, s) => {
        const normalized = (s.avgScore / s.scoreScale) * 100; // normalize to 0-100
        return sum + normalized * s.weight;
      }, 0);

      const overall = Math.round((weightedSum / totalWeight) * 10) / 10; // 1 decimal
      await supabase.from('evaluation_candidates').update({ overall_score: overall }).eq('id', candidateId);
    }
  },

  // Auto-place candidates into teams based on thresholds
  autoPlaceCandidates: async (sessionId) => {
    // First compute latest scores
    await evaluationService.computeOverallScores(sessionId);

    const candidates = await evaluationService.getCandidates(sessionId);
    const thresholds = await evaluationService.getThresholds(sessionId);

    // Sort candidates by score descending
    const sorted = candidates
      .filter((c) => c.overallScore !== null)
      .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

    // Sort thresholds by sort_order (highest tier first)
    const tiers = [...thresholds].sort((a, b) => a.sortOrder - b.sortOrder);

    // Track roster counts per team
    const rosterCounts = {};
    for (const t of tiers) rosterCounts[t.teamId] = 0;

    const placements = [];

    // Gender matching helper: boys→boys team, girls→girls team, coed accepts both
    const genderMatch = (candidateGender, teamGender) => {
      if (!teamGender || !candidateGender) return true; // no gender info = allow
      const tg = teamGender.toLowerCase();
      if (tg === 'coed' || tg === 'co-ed') return true; // coed teams accept anyone
      const cg = candidateGender.toLowerCase();
      return (
        ((cg === 'boys' || cg === 'boy' || cg === 'male' || cg === 'm') &&
          (tg === 'boys' || tg === 'boy' || tg === 'male')) ||
        ((cg === 'girls' || cg === 'girl' || cg === 'female' || cg === 'f') &&
          (tg === 'girls' || tg === 'girl' || tg === 'female'))
      );
    };

    for (const candidate of sorted) {
      let placed = false;
      for (const tier of tiers) {
        if (candidate.overallScore >= tier.minScore) {
          if (tier.maxRoster && rosterCounts[tier.teamId] >= tier.maxRoster) continue;
          // Enforce gender rules
          if (!genderMatch(candidate.gender, tier.teamGender)) continue;
          placements.push({
            candidateId: candidate.id,
            teamId: tier.teamId,
            teamName: tier.teamName,
          });
          rosterCounts[tier.teamId]++;
          placed = true;
          break;
        }
      }
      if (!placed) {
        placements.push({ candidateId: candidate.id, teamId: null, teamName: null });
      }
    }

    // Write placements to DB
    for (const p of placements) {
      await supabase
        .from('evaluation_candidates')
        .update({
          placed_team_id: p.teamId,
          placement_status: p.teamId ? 'placed' : 'pending',
        })
        .eq('id', p.candidateId);
    }

    return placements;
  },

  // Finalize placements: create player records for unmatched candidates
  finalizePlacements: async (sessionId, clubId) => {
    const candidates = await evaluationService.getCandidates(sessionId);
    const placed = candidates.filter((c) => c.placementStatus === 'placed' && c.placedTeamId);
    let created = 0;

    for (const candidate of placed) {
      if (candidate.playerId) {
        // Existing player — just update their team_id
        await supabase.from('players').update({ team_id: candidate.placedTeamId }).eq('id', candidate.playerId);
      } else {
        // New player — create record
        const { data: newPlayer } = await supabase
          .from('players')
          .insert({
            first_name: candidate.firstName,
            last_name: candidate.lastName,
            birthdate: candidate.birthdate || null,
            status: 'active',
            club_id: clubId,
            team_id: candidate.placedTeamId,
          })
          .select()
          .single();

        if (newPlayer) {
          await supabase.from('evaluation_candidates').update({ player_id: newPlayer.id }).eq('id', candidate.id);
          created++;
        }
      }
    }

    // Mark session as completed
    await evaluationService.updateSession(sessionId, { status: 'completed' });

    return { placed: placed.length, created };
  },
};
