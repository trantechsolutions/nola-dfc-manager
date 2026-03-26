// src/hooks/useEvaluationManager.js
// Manages evaluation session state: CRUD, scoring, placement.
import { useState, useEffect, useCallback } from 'react';
import { evaluationService } from '../services/evaluationService';

export const useEvaluationManager = (clubId, sessionId = null) => {
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [scores, setScores] = useState([]);
  const [evaluators, setEvaluators] = useState([]);
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch all sessions for the club
  const fetchSessions = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const data = await evaluationService.getSessions(clubId);
      setSessions(data);
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  // Fetch full session detail
  const fetchSessionDetail = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const [sess, cats, cands, evals, thresh] = await Promise.all([
        evaluationService.getSession(sessionId),
        evaluationService.getCategories(sessionId),
        evaluationService.getCandidates(sessionId),
        evaluationService.getEvaluators(sessionId),
        evaluationService.getThresholds(sessionId),
      ]);
      setSession(sess);
      setCategories(cats);
      setCandidates(cands);
      setEvaluators(evals);
      setThresholds(thresh);
    } catch (e) {
      console.error('Failed to fetch session detail:', e);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    fetchSessionDetail();
  }, [fetchSessionDetail]);

  // Session CRUD
  const createSession = async (data) => {
    const result = await evaluationService.createSession({ ...data, clubId });
    await fetchSessions();
    return result;
  };

  const updateSession = async (updates) => {
    await evaluationService.updateSession(sessionId, updates);
    await fetchSessionDetail();
  };

  const deleteSession = async (id) => {
    await evaluationService.deleteSession(id);
    await fetchSessions();
  };

  // Categories
  const saveCategories = async (cats) => {
    await evaluationService.saveCategories(sessionId, cats);
    const updated = await evaluationService.getCategories(sessionId);
    setCategories(updated);
  };

  // Candidates
  const importCandidates = async (candidateList) => {
    await evaluationService.importCandidates(sessionId, candidateList);
    await fetchSessionDetail();
  };

  const matchToPlayers = async () => {
    const matched = await evaluationService.matchCandidatesToPlayers(sessionId, clubId);
    await fetchSessionDetail();
    return matched;
  };

  const deleteCandidate = async (candidateId) => {
    await evaluationService.deleteCandidate(candidateId);
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
  };

  // Scoring
  const submitScore = async (scoreData) => {
    await evaluationService.saveScore(scoreData);
  };

  const submitBatchScores = async (scoreList) => {
    await evaluationService.saveBatchScores(scoreList);
  };

  const fetchScores = async (evaluatorId = null) => {
    if (!sessionId) return;
    const data = await evaluationService.getScores(sessionId, evaluatorId);
    setScores(data);
    return data;
  };

  // Evaluators
  const addEvaluator = async (userId, displayName) => {
    await evaluationService.addEvaluator(sessionId, userId, displayName);
    await fetchSessionDetail();
  };

  const removeEvaluator = async (evaluatorId) => {
    await evaluationService.removeEvaluator(evaluatorId);
    setEvaluators((prev) => prev.filter((e) => e.id !== evaluatorId));
  };

  // Thresholds
  const saveThresholds = async (thresh) => {
    await evaluationService.saveThresholds(sessionId, thresh);
    const updated = await evaluationService.getThresholds(sessionId);
    setThresholds(updated);
  };

  // Placement
  const computeScores = async () => {
    await evaluationService.computeOverallScores(sessionId);
    await fetchSessionDetail();
  };

  const autoPlace = async () => {
    const placements = await evaluationService.autoPlaceCandidates(sessionId);
    await fetchSessionDetail();
    return placements;
  };

  const manualPlace = async (candidateId, teamId) => {
    await evaluationService.updateCandidate(candidateId, {
      placedTeamId: teamId,
      placementStatus: teamId ? 'placed' : 'pending',
    });
    await fetchSessionDetail();
  };

  const finalize = async () => {
    const result = await evaluationService.finalizePlacements(sessionId, clubId);
    await fetchSessionDetail();
    return result;
  };

  return {
    // Data
    sessions,
    session,
    categories,
    candidates,
    scores,
    evaluators,
    thresholds,
    loading,

    // Session CRUD
    createSession,
    updateSession,
    deleteSession,

    // Categories
    saveCategories,

    // Candidates
    importCandidates,
    matchToPlayers,
    deleteCandidate,

    // Scoring
    submitScore,
    submitBatchScores,
    fetchScores,

    // Evaluators
    addEvaluator,
    removeEvaluator,

    // Thresholds
    saveThresholds,

    // Placement
    computeScores,
    autoPlace,
    manualPlace,
    finalize,

    // Refresh
    refreshSessions: fetchSessions,
    refreshDetail: fetchSessionDetail,
  };
};
