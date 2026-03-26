import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardCheck, Check, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { useT } from '../../../i18n/I18nContext';
import { evaluationService } from '../../../services/evaluationService';

/**
 * EvaluatorScoringView — Blind evaluation interface.
 * Shows bib numbers only (no player names).
 * Evaluators score each candidate against defined categories.
 */
export default function EvaluatorScoringView({ user, showToast }) {
  const { sessionId } = useParams();
  const { t } = useT();
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [scores, setScores] = useState({}); // { candidateId: { categoryId: score } }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!sessionId || !user?.id) return;
    setLoading(true);
    try {
      const [sess, cats, cands, existingScores] = await Promise.all([
        evaluationService.getSession(sessionId),
        evaluationService.getCategories(sessionId),
        evaluationService.getCandidates(sessionId),
        evaluationService.getScores(sessionId, user.id),
      ]);
      setSession(sess);
      setCategories(cats);
      // Sort by bib number for evaluator
      setCandidates(cands.sort((a, b) => (a.bibNumber || 999) - (b.bibNumber || 999)));

      // Build local score map from existing scores
      const scoreMap = {};
      for (const s of existingScores) {
        if (!scoreMap[s.candidateId]) scoreMap[s.candidateId] = {};
        scoreMap[s.candidateId][s.categoryId] = s.score;
      }
      setScores(scoreMap);
    } catch (e) {
      console.error('Failed to load evaluation data:', e);
    } finally {
      setLoading(false);
    }
  }, [sessionId, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentCandidate = candidates[currentIndex];
  const candidateScores = currentCandidate ? scores[currentCandidate.id] || {} : {};
  const scale = session?.scoreScale || 5;

  const scoredCount = candidates.filter((c) => {
    const cs = scores[c.id];
    return cs && categories.every((cat) => cs[cat.id] !== undefined);
  }).length;

  const setScore = (categoryId, value) => {
    setScores((prev) => ({
      ...prev,
      [currentCandidate.id]: {
        ...(prev[currentCandidate.id] || {}),
        [categoryId]: value,
      },
    }));
  };

  const handleSaveCurrentScores = async () => {
    if (!currentCandidate) return;
    setSaving(true);
    try {
      const scoreList = categories
        .filter((cat) => candidateScores[cat.id] !== undefined)
        .map((cat) => ({
          candidateId: currentCandidate.id,
          categoryId: cat.id,
          evaluatorId: user.id,
          score: candidateScores[cat.id],
        }));
      if (scoreList.length > 0) {
        await evaluationService.saveBatchScores(scoreList);
      }
      showToast?.(`Bib #${currentCandidate.bibNumber} saved`);
    } catch {
      showToast?.('Failed to save scores', true);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndNext = async () => {
    await handleSaveCurrentScores();
    if (currentIndex < candidates.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <div className="text-center py-12 text-slate-500 dark:text-slate-400">Session not found.</div>;
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center justify-center gap-2">
          <ClipboardCheck size={20} className="text-indigo-500" />
          {session.name}
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          {t('evaluations.blindScoring', 'Blind Evaluation')} — {scoredCount}/{candidates.length}{' '}
          {t('evaluations.completed', 'completed')}
        </p>
        {/* Progress bar */}
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${candidates.length > 0 ? (scoredCount / candidates.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          {t('evaluations.noCandidates', 'No candidates to evaluate.')}
        </div>
      ) : (
        <>
          {/* Bib Navigator */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-2xl font-black">
                {currentCandidate?.bibNumber || '?'}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest font-bold">
                Bib #{currentCandidate?.bibNumber} — {currentIndex + 1} of {candidates.length}
              </p>
            </div>

            <button
              onClick={() => setCurrentIndex(Math.min(candidates.length - 1, currentIndex + 1))}
              disabled={currentIndex === candidates.length - 1}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Bib Quick Select */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {candidates.map((c, i) => {
              const isScored = scores[c.id] && categories.every((cat) => scores[c.id]?.[cat.id] !== undefined);
              return (
                <button
                  key={c.id}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                    i === currentIndex
                      ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-700'
                      : isScored
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {c.bibNumber}
                </button>
              );
            })}
          </div>

          {/* Scoring Cards */}
          <div className="space-y-3">
            {categories.map((cat) => {
              const currentScore = candidateScores[cat.id];
              return (
                <div
                  key={cat.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-white">{cat.name}</h4>
                      {cat.description && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{cat.description}</p>
                      )}
                    </div>
                    {currentScore !== undefined && (
                      <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                        {currentScore}/{scale}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {Array.from({ length: scale }, (_, i) => i + 1).map((val) => (
                      <button
                        key={val}
                        onClick={() => setScore(cat.id, val)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          currentScore === val
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-300 dark:shadow-indigo-900'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400'
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

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleSaveCurrentScores}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-sm transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              {t('common.save', 'Save')}
            </button>
            <button
              onClick={handleSaveAndNext}
              disabled={saving || currentIndex === candidates.length - 1}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors disabled:opacity-50"
            >
              <Check size={16} />
              {t('evaluations.saveAndNext', 'Save & Next')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
