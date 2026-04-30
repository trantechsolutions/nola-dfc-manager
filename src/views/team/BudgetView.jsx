import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Lock,
  Unlock,
  Users,
  CheckCircle2,
  TrendingUp,
  Copy,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  FileSpreadsheet,
  UserPlus,
  AlertTriangle,
  GitBranch,
  History,
  X,
  Handshake,
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import PlayerFormModal from '../../components/PlayerFormModal';
import { useBudgetForecast } from '../../hooks/useBudgetForecast';

// Fallback budget categories used when no categoryOptions prop is provided
const FALLBACK_BUDGET_CATEGORIES = [
  { code: 'OPE', name: 'Operating', type: 'expense' },
  { code: 'COA', name: 'Coach Fees', type: 'expense' },
  { code: 'TOU', name: 'Tournaments', type: 'expense' },
  { code: 'LEA', name: 'League', type: 'expense' },
  { code: 'FRI', name: 'Friendlies', type: 'expense' },
  { code: 'TMF', name: 'Team Fees', type: 'income' },
  { code: 'FUN', name: 'Fundraisers', type: 'income' },
  { code: 'SPO', name: 'Sponsorships', type: 'income' },
];

export default function BudgetView({
  selectedSeason,
  formatMoney,
  seasons,
  setSelectedSeason,
  refreshSeasons,
  showToast,
  showConfirm,
  onDataChange,
  currentTeamSeason = null,
  selectedTeamId = null,
  selectedTeam = null,
  club = null,
  teamSeasons = [],
  categoryOptions = [],
}) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [activeTab, setActiveTab] = useState('budget');

  // Budget
  const [budgetItems, setBudgetItems] = useState([]);
  const [rosterSize, setRosterSize] = useState(13);
  const [rosterSizeManual, setRosterSizeManual] = useState(false);
  const [bufferPercent, setBufferPercent] = useState(5);
  const [cloneSource, setCloneSource] = useState('');
  const [collapsedCats, setCollapsedCats] = useState({});

  // Amendments
  const [isAmending, setIsAmending] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendments, setAmendments] = useState([]);

  // Roster
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  // Forecast
  const {
    forecast: forecastResult,
    loading: forecastLoading,
    error: forecastError,
    runForecast,
    clearForecast,
  } = useBudgetForecast(selectedTeamId, teamSeasons);

  // Modals
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [isSubmittingPlayer, setIsSubmittingPlayer] = useState(false);

  // Historical (projections)
  const [seasonTransactions, setSeasonTransactions] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [historicalBudgets, setHistoricalBudgets] = useState({});
  const [allSeasonsList, setAllSeasonsList] = useState([]);

  // ─── DATA FETCHING ───
  // CHANGED: Sources budget metadata from currentTeamSeason, fetches items by team_season_id
  const fetchData = async () => {
    setLoading(true);
    try {
      const allSeasons = await supabaseService.getAllSeasons();
      setAllSeasonsList(allSeasons);

      // Budget metadata comes from currentTeamSeason (prop), NOT seasons table
      if (currentTeamSeason) {
        setRosterSize(currentTeamSeason.expectedRosterSize || 13);
        setBufferPercent(currentTeamSeason.bufferPercent ?? 5);
        setIsFinalized(currentTeamSeason.isFinalized || false);
      } else {
        setRosterSize(13);
        setBufferPercent(5);
        setIsFinalized(false);
      }

      // Budget items — THIS TEAM ONLY via team_season_id
      const tsId = currentTeamSeason?.id || null;
      if (tsId) {
        const items = await supabaseService.getBudgetItemsByTeamSeason(tsId);
        setBudgetItems(items);
        // Load amendment history
        try {
          const amends = await supabaseService.getBudgetAmendments(tsId);
          setAmendments(amends);
        } catch {
          /* table may not exist yet */
        }
      } else {
        // No team_season yet — empty budget (don't load other teams' items)
        setBudgetItems([]);
        setAmendments([]);
      }

      // Players — THIS TEAM ONLY
      if (selectedTeamId) {
        const players = await supabaseService.getPlayersByTeam(selectedTeamId);
        setAvailablePlayers(players);
      } else {
        setAvailablePlayers([]);
      }

      // Transactions — THIS TEAM + SEASON ONLY
      let seasonTxs = [];
      if (tsId) {
        // Team-season scoped: only this team's transactions
        seasonTxs = await supabaseService.getTransactionsByTeamSeason(tsId);
      }
      // No team_season = no transactions to show (budget hasn't been set up yet)
      setSeasonTransactions(seasonTxs);

      // Historical data for projections — OTHER seasons for THIS TEAM ONLY
      const histTxs = [];
      if (teamSeasons.length > 0) {
        const histBudgets = {};
        for (const ts of teamSeasons.filter((ts) => ts.seasonId !== selectedSeason)) {
          try {
            histBudgets[ts.seasonId] = await supabaseService.getBudgetItemsByTeamSeason(ts.id);
            // Also fetch that season's transactions for actuals comparison
            const tsTxs = await supabaseService.getTransactionsByTeamSeason(ts.id);
            histTxs.push(...tsTxs);
          } catch (e) {
            /* skip */
          }
        }
        setHistoricalBudgets(histBudgets);
      }
      // allTransactions = current season + historical, all team-scoped
      setAllTransactions([...seasonTxs, ...histTxs]);
    } catch (e) {
      console.error('Budget fetch error:', e);
      if (showToast) showToast('Failed to load budget data.', true);
    } finally {
      setLoading(false);
    }
  };

  // CHANGED: Also react to team_season changes (when switching teams)
  useEffect(() => {
    fetchData();
  }, [selectedSeason, currentTeamSeason?.id]);

  useEffect(() => {
    if (rosterSizeManual) return; // Don't auto-set when manually overridden
    const active = availablePlayers.filter(
      (p) => p.seasonProfiles?.[selectedSeason] && p.seasonProfiles[selectedSeason].feeWaived !== true,
    ).length;
    if (!isFinalized && active > 0) setRosterSize(active);
  }, [availablePlayers, selectedSeason, isFinalized, rosterSizeManual]);

  // ─── COMPUTED ───

  // Build dynamic budget categories from categoryOptions prop, falling back to hardcoded list.
  // Also surfaces any orphaned codes that exist in saved budget items (backward compat).
  const budgetCategories = useMemo(() => {
    const fromOptions =
      categoryOptions.length > 0
        ? categoryOptions
            .filter((c) => c.flow === 'income' || c.flow === 'expense')
            .map((c) => ({ code: c.code, name: c.label, type: c.flow }))
        : FALLBACK_BUDGET_CATEGORIES;

    const covered = new Set(fromOptions.map((c) => c.code));
    const orphaned = budgetItems
      .map((i) => i.category)
      .filter((code) => code && !covered.has(code))
      .filter((code, i, arr) => arr.indexOf(code) === i)
      .map((code) => ({ code, name: code, type: 'expense' }));

    return [...fromOptions, ...orphaned];
  }, [categoryOptions, budgetItems]);

  const expenseCodes = useMemo(
    () => budgetCategories.filter((c) => c.type === 'expense').map((c) => c.code),
    [budgetCategories],
  );

  const itemsByCategory = useMemo(() => {
    const map = {};
    budgetCategories.forEach((cat) => {
      map[cat.code] = budgetItems.filter((i) => i.category === cat.code);
    });
    return map;
  }, [budgetItems, budgetCategories]);

  const subtotals = useMemo(() => {
    const result = {};
    budgetCategories.forEach((cat) => {
      const items = itemsByCategory[cat.code] || [];
      result[cat.code] = {
        income: items.reduce((s, i) => s + (Number(i.income) || 0), 0),
        expensesFall: items.reduce((s, i) => s + (Number(i.expensesFall) || 0), 0),
        expensesSpring: items.reduce((s, i) => s + (Number(i.expensesSpring) || 0), 0),
      };
      result[cat.code].net = result[cat.code].income - result[cat.code].expensesFall - result[cat.code].expensesSpring;
    });
    return result;
  }, [itemsByCategory, budgetCategories]);

  const grandTotals = useMemo(() => {
    let income = 0,
      expFall = 0,
      expSpring = 0;
    Object.values(subtotals).forEach((s) => {
      income += s.income;
      expFall += s.expensesFall;
      expSpring += s.expensesSpring;
    });
    return { income, expensesFall: expFall, expensesSpring: expSpring, net: income - expFall - expSpring };
  }, [subtotals]);

  const actuals = useMemo(() => {
    const map = {};
    seasonTransactions.forEach((tx) => {
      const cleared = tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';
      if (!cleared || tx.waterfallBatchId) return;
      const cat = tx.category || '';
      map[cat] = (map[cat] || 0) + Number(tx.amount || 0);
    });
    return map;
  }, [seasonTransactions]);

  const totalActual = useMemo(() => Object.values(actuals).reduce((s, v) => s + v, 0), [actuals]);

  const totalExpenseAmount = useMemo(
    () =>
      expenseCodes.reduce(
        (sum, code) => sum + (subtotals[code]?.expensesFall || 0) + (subtotals[code]?.expensesSpring || 0),
        0,
      ),
    [subtotals, expenseCodes],
  );

  const bufferAmount = totalExpenseAmount * (bufferPercent / 100);
  const rawFee = rosterSize > 0 ? (totalExpenseAmount + bufferAmount) / rosterSize : 0;
  const roundedBaseFee = Math.ceil(rawFee / 50) * 50;

  // ─── PROJECTIONS ───
  // CHANGED: Use teamSeasons (which have isFinalized) instead of ghost season fields
  const projections = useMemo(() => {
    const isCleared = (tx) => tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';
    const pastTeamSeasons = teamSeasons.filter((ts) => ts.isFinalized && ts.seasonId !== selectedSeason);
    if (pastTeamSeasons.length === 0) return null;

    const pastSeasons = pastTeamSeasons.map((ts) => ({
      id: ts.seasonId,
      isFinalized: ts.isFinalized,
      bufferPercent: ts.bufferPercent,
    }));

    const categoryHistory = {};
    budgetCategories.forEach((cat) => {
      categoryHistory[cat.code] = { budgeted: [], actual: [], seasons: [] };
    });

    pastSeasons.forEach((season) => {
      const items = historicalBudgets[season.id] || [];
      const txs = allTransactions.filter((tx) => tx.seasonId === season.id && isCleared(tx) && !tx.waterfallBatchId);
      const seasonActuals = {};
      txs.forEach((tx) => {
        seasonActuals[tx.category || ''] = (seasonActuals[tx.category || ''] || 0) + Number(tx.amount || 0);
      });

      budgetCategories.forEach((cat) => {
        const catItems = items.filter((i) => i.category === cat.code);
        const budgeted = catItems.reduce(
          (s, i) =>
            cat.type === 'income'
              ? s + (Number(i.income) || 0)
              : s + (Number(i.expensesFall) || 0) + (Number(i.expensesSpring) || 0),
          0,
        );
        categoryHistory[cat.code].budgeted.push(budgeted);
        categoryHistory[cat.code].actual.push(Math.abs(seasonActuals[cat.code] || 0));
        categoryHistory[cat.code].seasons.push(season.id);
      });
    });

    const categoryProjections = {};
    budgetCategories.forEach((cat) => {
      const h = categoryHistory[cat.code];
      const avgBudgeted = h.budgeted.length > 0 ? h.budgeted.reduce((a, b) => a + b, 0) / h.budgeted.length : 0;
      const avgActual = h.actual.length > 0 ? h.actual.reduce((a, b) => a + b, 0) / h.actual.length : 0;
      const variance = avgBudgeted > 0 ? ((avgActual - avgBudgeted) / avgBudgeted) * 100 : 0;
      categoryProjections[cat.code] = {
        avgBudgeted,
        avgActual,
        variance,
        suggested: Math.ceil(Math.max(avgActual, avgBudgeted) / 10) * 10,
      };
    });

    const suggestedItems = (historicalBudgets[pastSeasons[0]?.id] || []).map((item) => ({
      ...item,
      id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: pastSeasons[0]?.id,
    }));

    const totalBudgeted = Object.values(categoryProjections).reduce((s, p) => s + p.avgBudgeted, 0);
    const totalActualAvg = Object.values(categoryProjections).reduce((s, p) => s + p.avgActual, 0);

    return { categoryProjections, suggestedItems, pastSeasons, totalBudgeted, totalActualAvg };
  }, [teamSeasons, historicalBudgets, allTransactions, selectedSeason, budgetCategories]);

  // ─── HANDLERS ───
  const addItem = (code) =>
    setBudgetItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        category: code,
        label: '',
        income: 0,
        expensesFall: 0,
        expensesSpring: 0,
      },
    ]);
  const updateItem = (id, field, value) =>
    setBudgetItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: field === 'label' ? value : parseFloat(value) || 0 } : item,
      ),
    );
  const removeItem = (id) => setBudgetItems((prev) => prev.filter((i) => i.id !== id));
  const toggleCollapse = (code) => setCollapsedCats((prev) => ({ ...prev, [code]: !prev[code] }));

  // CHANGED: Saves to team_seasons instead of seasons table
  const handleSaveBudget = async (finalize = false) => {
    if (finalize) {
      const ok = await showConfirm('Finalizing locks the budget and applies fees to all players. Proceed?');
      if (!ok) return;
    }
    setIsSaving(true);
    try {
      // Ensure season record exists (just id + name)
      await supabaseService.saveSeason(selectedSeason, { name: selectedSeason });

      // Save budget metadata to team_seasons (where it belongs)
      const teamSeasonData = {
        teamId: selectedTeamId,
        seasonId: selectedSeason,
        expectedRosterSize: Number(rosterSize),
        bufferPercent: Number(bufferPercent),
        totalProjectedExpenses: totalExpenseAmount,
        totalProjectedIncome: grandTotals.income,
        baseFee: roundedBaseFee,
        isFinalized: finalize || isFinalized,
      };
      if (currentTeamSeason?.id) teamSeasonData.id = currentTeamSeason.id;
      const savedTs = await supabaseService.saveTeamSeason(teamSeasonData);

      // Save budget items scoped to this team_season
      const tsId = savedTs?.id || currentTeamSeason?.id;
      await supabaseService.saveBudgetItems(selectedSeason, budgetItems, tsId);

      // Save any pending roster changes
      if (pendingAssignments.length > 0) {
        for (const p of pendingAssignments) {
          await supabaseService.addPlayerToSeason(p.id, selectedSeason, { feeWaived: false, status: 'active' }, tsId);
        }
        setPendingAssignments([]);
      }
      if (pendingRemovals.length > 0) {
        for (const p of pendingRemovals) {
          await supabaseService.removePlayerFromSeason(p.id, selectedSeason);
        }
        setPendingRemovals([]);
      }

      if (finalize) setIsFinalized(true);

      await refreshSeasons();
      onDataChange?.();
      if (showToast) showToast(finalize ? 'Budget Finalized & Fees Applied!' : 'Draft Saved.');
    } catch (e) {
      console.error('Save budget failed:', e);
      if (showToast) showToast('Save failed.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAmendment = async () => {
    const tsId = currentTeamSeason?.id;
    if (!tsId) return;
    setIsSaving(true);
    try {
      // Save the updated budget items
      await supabaseService.saveBudgetItems(selectedSeason, budgetItems, tsId);

      // Update team_seasons totals and base fee
      await supabaseService.saveTeamSeason({
        id: tsId,
        teamId: selectedTeamId,
        seasonId: selectedSeason,
        isFinalized: true,
        baseFee: roundedBaseFee,
        bufferPercent: Number(bufferPercent),
        expectedRosterSize: Number(rosterSize),
        totalProjectedExpenses: totalExpenseAmount,
        totalProjectedIncome: grandTotals.income,
      });

      // Record the amendment
      await supabaseService.saveBudgetAmendment({
        teamSeasonId: tsId,
        reason: amendmentReason.trim(),
        totalExpenses: totalExpenseAmount,
        totalIncome: grandTotals.income,
        baseFee: roundedBaseFee,
      });

      setIsAmending(false);
      setAmendmentReason('');
      await refreshSeasons();
      await fetchData();
      onDataChange?.();
      if (showToast) showToast('Budget amended successfully.');
    } catch (e) {
      console.error('Amendment save failed:', e);
      if (showToast) showToast('Amendment failed.', true);
    } finally {
      setIsSaving(false);
    }
  };

  // CHANGED: Scoped to team
  const handleDeleteSeason = async () => {
    const ok = await showConfirm(
      `Delete the "${selectedSeason}" draft for ${selectedTeam?.name || 'this team'}? This removes budget items, roster assignments, and transactions. This cannot be undone.`,
    );
    if (!ok) return;
    setIsSaving(true);
    try {
      if (currentTeamSeason?.id) {
        await supabaseService.saveBudgetItems(selectedSeason, [], currentTeamSeason.id);
      }
      await supabaseService.deleteSeason(selectedSeason);
      await refreshSeasons();
      const remaining = allSeasonsList.filter((s) => s.id !== selectedSeason);
      setSelectedSeason(remaining.length > 0 ? remaining[0].id : '2025-2026');
      onDataChange?.();
      if (showToast) showToast(`Season "${selectedSeason}" deleted.`);
    } catch (e) {
      if (showToast) showToast('Delete failed.', true);
    } finally {
      setIsSaving(false);
    }
  };

  // CHANGED: Uses team_season_id for source lookup
  const handleCloneBudget = async (sourceId) => {
    if (!sourceId) return;
    const ok = await showConfirm(`Overwrite current items with data from ${sourceId}?`);
    if (!ok) return;
    try {
      const sourceTs = teamSeasons.find((ts) => ts.seasonId === sourceId);
      let items = [];
      if (sourceTs) {
        items = await supabaseService.getBudgetItemsByTeamSeason(sourceTs.id);
      }
      // No sourceTs means this team has no budget for that season — nothing to clone
      if (items.length > 0)
        setBudgetItems(
          items.map((i) => ({
            ...i,
            id: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            teamSeasonId: undefined,
          })),
        );
      if (sourceTs) setBufferPercent(sourceTs.bufferPercent || 5);
      if (showToast) showToast(`Cloned from ${sourceId}`);
    } catch (e) {
      if (showToast) showToast('Clone failed.', true);
    }
  };

  const handleApplySuggestions = () => {
    if (projections?.suggestedItems?.length > 0) {
      setBudgetItems(
        projections.suggestedItems.map((i) => ({
          ...i,
          id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          teamSeasonId: undefined,
        })),
      );
      if (showToast) showToast('Applied historical budget template.');
    }
  };

  // CHANGED: Also creates a team_season record
  const handleCreateSeason = async (e) => {
    e.preventDefault();
    if (!newSeasonName.trim()) return;
    setIsSaving(true);
    try {
      await supabaseService.saveSeason(newSeasonName, { name: newSeasonName });
      if (selectedTeamId) {
        await supabaseService.saveTeamSeason({
          teamId: selectedTeamId,
          seasonId: newSeasonName,
          isFinalized: false,
          baseFee: 0,
          bufferPercent: 5,
        });
      }
      await refreshSeasons();
      setSelectedSeason(newSeasonName);
      setShowNewSeasonModal(false);
      setNewSeasonName('');
      onDataChange?.();
      if (showToast) showToast(`Season "${newSeasonName}" created.`);
    } catch (e) {
      if (showToast) showToast('Failed to create season.', true);
    } finally {
      setIsSaving(false);
    }
  };

  // CHANGED: Includes teamSeasonId in enrollment, removed baseFee (computed by view)
  const handleAddNewPlayer = async (playerData) => {
    setIsSubmittingPlayer(true);
    try {
      await supabaseService.addPlayer({
        ...playerData,
        status: 'active',
        ...(club?.id ? { clubId: club.id } : {}),
        ...(selectedTeamId ? { teamId: selectedTeamId } : {}),
        seasonProfiles: {
          [selectedSeason]: {
            feeWaived: false,
            status: 'active',
            teamSeasonId: currentTeamSeason?.id,
          },
        },
      });
      setShowPlayerForm(false);
      await fetchData();
      onDataChange?.();
      if (showToast)
        showToast(`${playerData.firstName} ${playerData.lastName} added and assigned to ${selectedSeason}.`);
    } catch (e) {
      console.error('Add player failed:', e);
      if (showToast) showToast('Failed to add player.', true);
    } finally {
      setIsSubmittingPlayer(false);
    }
  };

  // Pending roster removals (local state, saved in batch)
  const [pendingRemovals, setPendingRemovals] = useState([]);

  const handleRemoveFromSeason = (player) => {
    setPendingRemovals((prev) => [...prev, player]);
  };

  const handleUndoRemoval = (playerId) => {
    setPendingRemovals((prev) => prev.filter((p) => p.id !== playerId));
  };

  const handleToggleBuyIn = async (player) => {
    const current = player.seasonProfiles?.[selectedSeason]?.fundraiserBuyIn ?? false;
    try {
      await supabaseService.updateSeasonProfile(player.id, selectedSeason, { fundraiserBuyIn: !current });
      await fetchData();
    } catch (e) {
      if (showToast) showToast('Could not update buy-in.', true);
    }
  };

  const handleToggleWaive = async (player) => {
    const current = player.seasonProfiles?.[selectedSeason]?.feeWaived ?? false;
    try {
      await supabaseService.updateSeasonProfile(player.id, selectedSeason, { feeWaived: !current });
      await fetchData();
      onDataChange?.();
      if (showToast) showToast(`${player.firstName} ${current ? 'no longer waived' : 'fee waived'}.`);
    } catch (e) {
      if (showToast) showToast('Could not update waiver.', true);
    }
  };

  // Pending roster assignments (local state, saved in batch)
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [isSavingRoster, setIsSavingRoster] = useState(false);

  const handleQueueAssignment = (player) => {
    setPendingAssignments((prev) => [...prev, player]);
  };

  const handleUnqueueAssignment = (playerId) => {
    setPendingAssignments((prev) => prev.filter((p) => p.id !== playerId));
  };

  const hasPendingRosterChanges = pendingAssignments.length > 0 || pendingRemovals.length > 0;

  const handleSaveRosterAssignments = async () => {
    if (!hasPendingRosterChanges) return;
    setIsSavingRoster(true);
    try {
      for (const p of pendingAssignments) {
        await supabaseService.addPlayerToSeason(
          p.id,
          selectedSeason,
          { feeWaived: false, status: 'active' },
          currentTeamSeason?.id,
        );
      }
      for (const p of pendingRemovals) {
        await supabaseService.removePlayerFromSeason(p.id, selectedSeason);
      }
      setPendingAssignments([]);
      setPendingRemovals([]);
      await fetchData();
      onDataChange?.();
      if (showToast) showToast('Roster changes saved.');
    } catch (e) {
      if (showToast) showToast('Failed to save roster changes.', true);
    } finally {
      setIsSavingRoster(false);
    }
  };

  // ─── RENDER HELPERS ───
  const fmt = (val) =>
    val === 0 ? (
      <span className="text-slate-300 dark:text-slate-600">—</span>
    ) : (
      <span className={val < 0 ? 'text-red-500' : ''}>{formatMoney(Math.abs(val))}</span>
    );
  const fmtNet = (val) =>
    val === 0 ? (
      <span className="text-slate-300 dark:text-slate-600">—</span>
    ) : (
      <span className={`font-black ${val < 0 ? 'text-red-500' : ''}`}>
        {val < 0 ? `(${formatMoney(Math.abs(val))})` : formatMoney(val)}
      </span>
    );

  const seasonPlayers = availablePlayers.filter((p) => p.seasonProfiles?.[selectedSeason]);
  const unassignedPlayers = availablePlayers.filter((p) => !p.seasonProfiles?.[selectedSeason]);
  const tabs = [
    { id: 'budget', label: 'Budget Table', icon: FileSpreadsheet },
    { id: 'roster', label: 'Roster & Waivers', icon: Users, badge: seasonPlayers.length },
    ...(projections ? [{ id: 'projections', label: 'Projections', icon: BarChart3 }] : []),
    ...(teamSeasons.length >= 1 ? [{ id: 'forecast', label: 'Forecast', icon: Sparkles }] : []),
  ];

  if (loading)
    return (
      <div className="p-20 text-center font-black text-slate-300 dark:text-slate-500 animate-pulse">
        LOADING BUDGET...
      </div>
    );

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* ── HEADER ── */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${isFinalized ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'}`}
            >
              {isFinalized ? <Lock size={20} /> : <Unlock size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900 dark:text-white">{selectedSeason}</h2>
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${isAmending ? 'bg-amber-600 text-white' : isFinalized ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}
                >
                  {isAmending ? 'Amending' : isFinalized ? 'Finalized' : 'Draft'}
                </span>
                {amendments.length > 0 && !isAmending && (
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                    <History size={10} /> {amendments.length} amendment{amendments.length !== 1 && 's'}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                Aug {selectedSeason.split('-')[0]} – May {selectedSeason.split('-')[1]} · {seasonPlayers.length} players
                · Fee: {formatMoney(roundedBaseFee)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {!isFinalized && !isAmending && (
              <>
                <button
                  onClick={handleDeleteSeason}
                  disabled={isSaving}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Delete Draft"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => handleSaveBudget(false)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => handleSaveBudget(true)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl font-black text-xs text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 shadow-lg dark:shadow-none flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} /> Finalize
                </button>
              </>
            )}
            {isFinalized && !isAmending && (
              <button
                onClick={() => {
                  setIsAmending(true);
                  setActiveTab('budget');
                }}
                className="px-4 py-2 rounded-xl font-black text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 flex items-center gap-1.5 transition-all"
              >
                <GitBranch size={14} /> Amend Budget
              </button>
            )}
            {isAmending && (
              <>
                <button
                  onClick={() => {
                    setIsAmending(false);
                    setAmendmentReason('');
                    fetchData();
                  }}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <X size={14} /> Cancel
                </button>
                <button
                  onClick={handleSaveAmendment}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl font-black text-xs text-white bg-amber-600 hover:bg-amber-700 shadow-lg dark:shadow-none flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} /> Save Amendment
                </button>
              </>
            )}
            {!isAmending && (
              <button
                onClick={() => setShowNewSeasonModal(true)}
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                title="New Season"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mt-4 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm dark:shadow-none'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.badge != null && (
                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Amendment reason field */}
        {isAmending && (
          <div className="mt-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">
              Amendment Reason (optional)
            </p>
            <input
              type="text"
              value={amendmentReason}
              onChange={(e) => setAmendmentReason(e.target.value)}
              placeholder="e.g. Added tournament, adjusted coach fees..."
              className="w-full border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-800 dark:text-white rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        )}
      </div>

      {/* ── BUDGET TABLE TAB ── */}
      {activeTab === 'budget' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* Clone Tool */}
            {!isFinalized && (
              <div className="bg-blue-600 p-5 rounded-2xl text-white">
                <h3 className="font-black flex items-center gap-2 mb-3 text-sm">
                  <Copy size={16} /> Clone Budget
                </h3>
                <div className="flex gap-2">
                  <select
                    value={cloneSource}
                    onChange={(e) => setCloneSource(e.target.value)}
                    className="flex-grow bg-blue-700 border-none rounded-lg p-2.5 text-sm font-bold text-white outline-none"
                  >
                    <option value="">Select season...</option>
                    {seasons
                      .filter((s) => s.id !== selectedSeason)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => handleCloneBudget(cloneSource)}
                    className="bg-white dark:bg-slate-200 text-blue-600 px-5 py-2.5 rounded-lg font-black text-xs hover:bg-blue-50 dark:hover:bg-slate-100"
                  >
                    Clone
                  </button>
                </div>
              </div>
            )}

            {/* Budget Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
              {/* CHANGED: Dynamic team name */}
              <div className="bg-slate-900 text-white px-5 py-3">
                <h3 className="font-black text-sm">{selectedTeam?.name || club?.name || 'Team'} Budget</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                  Budget {selectedSeason.replace('-', ' / ')}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-700 text-white text-[9px] font-black uppercase tracking-widest">
                      <th className="px-4 py-2.5 w-[38%]">Description</th>
                      <th className="px-3 py-2.5 text-right w-[12%]">Income</th>
                      <th className="px-3 py-2.5 text-right w-[12%]">Exp Fall</th>
                      <th className="px-3 py-2.5 text-right w-[12%]">Exp Spring</th>
                      <th className="px-3 py-2.5 text-right w-[12%]">Net</th>
                      <th className="px-3 py-2.5 text-right w-[14%]">Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetCategories.map((cat) => {
                      const items = itemsByCategory[cat.code] || [];
                      const sub = subtotals[cat.code] || { income: 0, expensesFall: 0, expensesSpring: 0, net: 0 };
                      const isExp = cat.type === 'expense';
                      const collapsed = collapsedCats[cat.code];
                      const actual = actuals[cat.code] || 0;
                      const canEdit = !isFinalized || isAmending;

                      return (
                        <React.Fragment key={cat.code}>
                          <tr
                            className="bg-slate-800 text-white cursor-pointer select-none"
                            onClick={() => toggleCollapse(cat.code)}
                          >
                            <td colSpan={6} className="px-4 py-2">
                              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                                {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                {cat.name}
                                <span className="ml-auto text-slate-400 text-[9px] font-medium normal-case tracking-normal">
                                  {items.length} items
                                </span>
                              </div>
                            </td>
                          </tr>

                          {!collapsed &&
                            items.map((item) => {
                              const itemNet =
                                (Number(item.income) || 0) -
                                (Number(item.expensesFall) || 0) -
                                (Number(item.expensesSpring) || 0);
                              return (
                                <tr
                                  key={item.id}
                                  className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                                >
                                  <td className="px-4 py-1.5">
                                    {!canEdit ? (
                                      <span className="text-xs text-slate-700 dark:text-slate-300">
                                        {cat.code} -{' '}
                                        {item.label || (
                                          <span className="italic text-slate-300 dark:text-slate-600">Untitled</span>
                                        )}
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 w-7">
                                          {cat.code}
                                        </span>
                                        <input
                                          type="text"
                                          placeholder="Label..."
                                          value={item.label}
                                          onChange={(e) => updateItem(item.id, 'label', e.target.value)}
                                          className="flex-grow bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-blue-500 py-1 text-xs dark:text-white outline-none"
                                        />
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    {!isExp && canEdit ? (
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.income || ''}
                                        placeholder="0"
                                        onChange={(e) => updateItem(item.id, 'income', e.target.value)}
                                        className="w-20 text-right bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded px-1.5 py-1 text-xs font-bold dark:text-white outline-none focus:ring-1 focus:ring-emerald-400"
                                      />
                                    ) : (
                                      <span className="text-xs">{fmt(!isExp ? Number(item.income) || 0 : 0)}</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    {isExp && canEdit ? (
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.expensesFall || ''}
                                        placeholder="0"
                                        onChange={(e) => updateItem(item.id, 'expensesFall', e.target.value)}
                                        className="w-20 text-right bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded px-1.5 py-1 text-xs font-bold dark:text-white outline-none focus:ring-1 focus:ring-red-400"
                                      />
                                    ) : (
                                      <span className="text-xs">
                                        {fmt(isExp ? -(Number(item.expensesFall) || 0) : 0)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    {isExp && canEdit ? (
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.expensesSpring || ''}
                                        placeholder="0"
                                        onChange={(e) => updateItem(item.id, 'expensesSpring', e.target.value)}
                                        className="w-20 text-right bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded px-1.5 py-1 text-xs font-bold dark:text-white outline-none focus:ring-1 focus:ring-red-400"
                                      />
                                    ) : (
                                      <span className="text-xs">
                                        {fmt(isExp ? -(Number(item.expensesSpring) || 0) : 0)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-xs">{fmtNet(itemNet)}</td>
                                  <td className="px-2 py-1.5 text-center w-12">
                                    {canEdit && (
                                      <button
                                        onClick={() => removeItem(item.id)}
                                        className="text-slate-300 dark:text-slate-600 hover:text-red-500"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}

                          {!collapsed && canEdit && (
                            <tr className="border-b border-slate-100 dark:border-slate-700">
                              <td colSpan={6} className="px-4 py-1">
                                <button
                                  onClick={() => addItem(cat.code)}
                                  className="text-[10px] font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <Plus size={10} /> Add Item
                                </button>
                              </td>
                            </tr>
                          )}

                          {!collapsed && (
                            <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-b-2 border-slate-200 dark:border-slate-700">
                              <td className="px-4 py-2 text-[10px] text-slate-600 dark:text-slate-300 italic uppercase">
                                &gt; {cat.name}
                              </td>
                              <td className="px-2 py-2 text-right text-xs">{fmtNet(sub.income)}</td>
                              <td className="px-2 py-2 text-right text-xs">
                                {sub.expensesFall > 0 ? (
                                  <span className="text-red-500">({formatMoney(sub.expensesFall)})</span>
                                ) : (
                                  fmt(0)
                                )}
                              </td>
                              <td className="px-2 py-2 text-right text-xs">
                                {sub.expensesSpring > 0 ? (
                                  <span className="text-red-500">({formatMoney(sub.expensesSpring)})</span>
                                ) : (
                                  fmt(0)
                                )}
                              </td>
                              <td className="px-2 py-2 text-right text-xs">{fmtNet(sub.net)}</td>
                              <td className="px-2 py-2 text-right text-xs font-black">
                                {actual !== 0 ? (
                                  <span className={actual < 0 ? 'text-red-500' : 'text-emerald-600'}>
                                    {actual < 0 ? `(${formatMoney(Math.abs(actual))})` : formatMoney(actual)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Grand Total */}
                    <tr className="bg-slate-900 text-white font-black text-sm">
                      <td className="px-4 py-3 uppercase text-[10px] tracking-widest">Total</td>
                      <td className="px-2 py-3 text-right text-xs">{formatMoney(grandTotals.income)}</td>
                      <td className="px-2 py-3 text-right text-xs text-red-300">
                        ({formatMoney(grandTotals.expensesFall)})
                      </td>
                      <td className="px-2 py-3 text-right text-xs text-red-300">
                        ({formatMoney(grandTotals.expensesSpring)})
                      </td>
                      <td className="px-2 py-3 text-right text-xs">{fmtNet(grandTotals.net)}</td>
                      <td className="px-2 py-3 text-right text-xs">
                        {totalActual !== 0 ? (
                          <span className={totalActual < 0 ? 'text-red-300' : 'text-emerald-300'}>
                            {totalActual < 0 ? `(${formatMoney(Math.abs(totalActual))})` : formatMoney(totalActual)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Amendment History */}
            {isFinalized && amendments.length > 0 && !isAmending && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
                <div className="bg-amber-600 text-white px-5 py-3 flex items-center gap-2">
                  <History size={16} />
                  <h3 className="font-black text-sm">Amendment History</h3>
                  <span className="ml-auto text-amber-200 text-[10px] font-bold">
                    {amendments.length} amendment{amendments.length !== 1 && 's'}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {amendments.map((a, idx) => (
                    <div key={a.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">
                          #{amendments.length - idx}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">
                          {new Date(a.amendedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      {a.reason && <p className="text-xs text-slate-600 dark:text-slate-300 flex-grow">{a.reason}</p>}
                      <div className="flex items-center gap-3 shrink-0 text-xs font-bold">
                        <span className="text-slate-400">
                          Exp: <span className="text-red-500">{formatMoney(a.totalExpenses)}</span>
                        </span>
                        <span className="text-slate-400">
                          Fee: <span className="text-slate-700 dark:text-slate-300">{formatMoney(a.baseFee)}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar — Fee Calculator + Quick Projections */}
          <div>
            <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg dark:shadow-none sticky top-4">
              <h3 className="font-black text-sm mb-4 flex items-center gap-2">
                <TrendingUp size={16} /> Fee Calculator
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Expenses</span>
                  <span className="font-bold">{formatMoney(totalExpenseAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Buffer ({bufferPercent}%)</span>
                  <span className="font-bold">{formatMoney(bufferAmount)}</span>
                </div>
                <div className="border-t border-slate-700 pt-3 flex justify-between">
                  <span className="text-slate-400">Needs Covered</span>
                  <span className="font-bold text-amber-400">{formatMoney(totalExpenseAmount + bufferAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">÷ Paying Players</span>
                  {!isFinalized ? (
                    <input
                      type="number"
                      min="1"
                      value={rosterSize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (val > 0) {
                          setRosterSize(val);
                          setRosterSizeManual(true);
                        }
                      }}
                      className="w-12 text-right font-bold bg-transparent border-none outline-none text-white p-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  ) : (
                    <span className="font-bold">{rosterSize}</span>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between mb-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Buffer</label>
                  <span className="text-[9px] font-black text-blue-400">{bufferPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="1"
                  value={bufferPercent}
                  disabled={isFinalized && !isAmending}
                  onChange={(e) => setBufferPercent(Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              <div className="bg-blue-600 rounded-2xl p-6 text-center shadow-inner mt-4">
                <p className="text-[9px] font-bold text-blue-200 uppercase tracking-widest mb-1">Season Fee</p>
                <h2 className="text-4xl font-black tracking-tighter">{formatMoney(roundedBaseFee)}</h2>
                <p className="text-[9px] text-blue-200 font-bold mt-3 pt-3 border-t border-blue-500/50">
                  Actual: {formatMoney(rawFee)}
                </p>
              </div>
            </div>

            {/* Quick Projections */}
            {projections && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none mt-4">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
                  <BarChart3 size={14} className="text-violet-600" /> vs Last Season
                  <span className="ml-auto text-[9px] font-bold text-slate-400">{projections.pastSeasons[0]?.id}</span>
                </h3>

                <div className="space-y-2">
                  {budgetCategories
                    .filter((c) => c.type === 'expense')
                    .map((cat) => {
                      const proj = projections.categoryProjections[cat.code];
                      if (!proj || (proj.avgBudgeted === 0 && proj.avgActual === 0)) return null;
                      const currentBudgeted =
                        (subtotals[cat.code]?.expensesFall || 0) + (subtotals[cat.code]?.expensesSpring || 0);
                      const diff = currentBudgeted - proj.avgActual;
                      const hasData = currentBudgeted > 0;
                      const maxVal = Math.max(currentBudgeted, proj.avgActual, 1);

                      return (
                        <div key={cat.code} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{cat.name}</span>
                            {hasData && (
                              <span
                                className={`text-[9px] font-black ${diff > 0 ? 'text-red-500' : diff < 0 ? 'text-emerald-500' : 'text-slate-400'}`}
                              >
                                {diff > 0
                                  ? `+${formatMoney(diff)}`
                                  : diff < 0
                                    ? `-${formatMoney(Math.abs(diff))}`
                                    : '—'}
                              </span>
                            )}
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                            <div
                              className={`h-full rounded-full transition-all ${hasData ? (diff > 0 ? 'bg-red-400' : 'bg-emerald-400') : 'bg-slate-300'}`}
                              style={{ width: `${(currentBudgeted / maxVal) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-400">
                            <span>Now: {hasData ? formatMoney(currentBudgeted) : '—'}</span>
                            <span>Prev: {formatMoney(proj.avgActual)}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <button
                  onClick={() => setActiveTab('projections')}
                  className="mt-3 w-full py-2 text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded-lg transition-colors"
                >
                  View Full Projections →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ROSTER TAB ── */}
      {activeTab === 'roster' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-center">
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{seasonPlayers.length}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase">In Season</p>
            </div>
            <div
              className={`p-4 rounded-2xl border shadow-sm dark:shadow-none text-center ${rosterSizeManual ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
            >
              {!isFinalized ? (
                <input
                  type="number"
                  min="1"
                  value={rosterSize}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (val > 0) {
                      setRosterSize(val);
                      setRosterSizeManual(true);
                    }
                  }}
                  className="w-full text-2xl font-black text-blue-600 text-center bg-transparent border-none outline-none p-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              ) : (
                <p className="text-2xl font-black text-blue-600">{rosterSize}</p>
              )}
              <p className="text-[10px] font-bold text-slate-400 uppercase">Paying</p>
              {rosterSizeManual && !isFinalized && (
                <button
                  onClick={() => {
                    setRosterSizeManual(false);
                    const active = availablePlayers.filter(
                      (p) => p.seasonProfiles?.[selectedSeason] && p.seasonProfiles[selectedSeason].feeWaived !== true,
                    ).length;
                    if (active > 0) setRosterSize(active);
                  }}
                  className="text-[9px] font-bold text-violet-500 hover:text-violet-700 mt-1"
                >
                  Reset to auto
                </button>
              )}
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-700 shadow-sm dark:shadow-none text-center">
              <p className="text-2xl font-black text-emerald-600">
                {seasonPlayers.filter((p) => p.seasonProfiles[selectedSeason]?.fundraiserBuyIn).length}
              </p>
              <p className="text-[10px] font-bold text-emerald-500 uppercase flex items-center justify-center gap-1">
                <Handshake size={10} /> Buy-In
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-center">
              <p className="text-2xl font-black text-amber-600">
                {seasonPlayers.filter((p) => p.seasonProfiles[selectedSeason]?.feeWaived).length}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Waived</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-center">
              <p className="text-2xl font-black text-slate-400">{unassignedPlayers.length}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Unassigned</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Users size={16} className="text-blue-600" /> {selectedSeason} Roster
                </h3>
                {!isFinalized && (
                  <button
                    onClick={() => setShowPlayerForm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[10px] font-black rounded-lg hover:bg-blue-700 transition-all shadow-sm dark:shadow-none"
                  >
                    <Plus size={12} /> New Player
                  </button>
                )}
              </div>

              {/* Pending changes banner */}
              {hasPendingRosterChanges && (
                <div className="flex items-center justify-between mb-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
                  <span className="text-[10px] font-black text-blue-700 dark:text-blue-300">
                    {pendingAssignments.length > 0 && `${pendingAssignments.length} to add`}
                    {pendingAssignments.length > 0 && pendingRemovals.length > 0 && ', '}
                    {pendingRemovals.length > 0 && `${pendingRemovals.length} to remove`}
                    {' — unsaved'}
                  </span>
                  <button
                    onClick={handleSaveRosterAssignments}
                    disabled={isSavingRoster}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black rounded-lg transition-all disabled:opacity-50"
                  >
                    {isSavingRoster ? 'Saving...' : 'Save All'}
                  </button>
                </div>
              )}

              {seasonPlayers.length === 0 && pendingAssignments.length === 0 ? (
                <div className="py-10 text-center text-slate-400 font-bold italic border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-2xl">
                  No players assigned yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Pending (unsaved) players */}
                  {pendingAssignments.map((p) => (
                    <div
                      key={`pending-${p.id}`}
                      className="flex items-center justify-between p-3 rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-black text-slate-400 dark:text-slate-500 w-6 text-center shrink-0">
                          #{p.jerseyNumber || '?'}
                        </span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="text-[9px] font-black bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded uppercase shrink-0">
                          Unsaved
                        </span>
                      </div>
                      <button
                        onClick={() => handleUnqueueAssignment(p.id)}
                        className="text-slate-300 dark:text-slate-600 hover:text-red-500 p-1"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  {/* Saved players */}
                  {seasonPlayers.map((p) => {
                    const waived = p.seasonProfiles[selectedSeason]?.feeWaived;
                    const buyIn = p.seasonProfiles[selectedSeason]?.fundraiserBuyIn ?? false;
                    const isPendingRemoval = pendingRemovals.some((r) => r.id === p.id);

                    if (isPendingRemoval) {
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 opacity-60"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-black text-slate-400 dark:text-slate-500 w-6 text-center shrink-0">
                              #{p.jerseyNumber || '?'}
                            </span>
                            <span className="text-sm font-bold text-slate-400 dark:text-slate-500 truncate line-through">
                              {p.firstName} {p.lastName}
                            </span>
                            <span className="text-[9px] font-black bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded uppercase shrink-0">
                              Removing
                            </span>
                          </div>
                          <button
                            onClick={() => handleUndoRemoval(p.id)}
                            className="text-[10px] font-black text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          >
                            Undo
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-3 rounded-xl border ${waived ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700'}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-black text-slate-400 dark:text-slate-500 w-6 text-center shrink-0">
                            #{p.jerseyNumber || '?'}
                          </span>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                            {p.firstName} {p.lastName}
                          </span>
                          {waived && (
                            <span className="text-[9px] font-black bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded uppercase shrink-0">
                              Waived
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {!isFinalized && (
                            <button
                              onClick={() => handleToggleWaive(p)}
                              title={waived ? 'Remove fee waiver' : 'Waive fee'}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all ${
                                waived
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              {waived ? 'Waived' : 'Waive'}
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleBuyIn(p)}
                            title={buyIn ? 'Remove fundraiser buy-in' : 'Add fundraiser buy-in'}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all ${
                              buyIn
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            <Handshake size={11} />
                            {buyIn ? 'In' : 'Out'}
                          </button>
                          {!isFinalized && (
                            <button
                              onClick={() => handleRemoveFromSeason(p)}
                              className="text-slate-300 dark:text-slate-600 hover:text-red-500 p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2 mb-4">
                  <UserPlus size={16} className="text-emerald-600" /> Unassigned Players
                </h3>
                {unassignedPlayers.filter(
                  (p) => p.status === 'active' && !pendingAssignments.some((pa) => pa.id === p.id),
                ).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">All players are assigned.</p>
                ) : (
                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {unassignedPlayers
                      .filter((p) => p.status === 'active' && !pendingAssignments.some((pa) => pa.id === p.id))
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            #{p.jerseyNumber || '?'} {p.firstName} {p.lastName}
                          </span>
                          {!isFinalized && (
                            <button
                              onClick={() => handleQueueAssignment(p)}
                              className="text-[10px] font-black text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30"
                            >
                              + Assign
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PROJECTIONS TAB ── */}
      {activeTab === 'projections' && projections && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Avg Budgeted</p>
              <p className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                {formatMoney(projections.totalBudgeted)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {projections.pastSeasons.length} season{projections.pastSeasons.length !== 1 && 's'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Avg Actual Spend</p>
              <p className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                {formatMoney(projections.totalActualAvg)}
              </p>
            </div>
            {!isFinalized && projections.suggestedItems.length > 0 && (
              <div className="bg-violet-50 dark:bg-violet-900/30 p-4 rounded-2xl border border-violet-200 dark:border-violet-700 shadow-sm dark:shadow-none flex flex-col justify-center">
                <button
                  onClick={handleApplySuggestions}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Sparkles size={14} /> Apply {projections.pastSeasons[0]?.id} Template
                </button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
            <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-violet-600" /> Expense Analysis
            </h3>
            <div className="space-y-3">
              {budgetCategories
                .filter((c) => c.type === 'expense')
                .map((cat) => {
                  const p = projections.categoryProjections[cat.code];
                  if (!p || (p.avgBudgeted === 0 && p.avgActual === 0)) return null;
                  const maxVal = Math.max(p.avgBudgeted, p.avgActual, 1);
                  const isOver = p.variance > 5;
                  const isUnder = p.variance < -10;

                  return (
                    <div key={cat.code} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{cat.name}</span>
                        <div className="flex items-center gap-1">
                          {isOver && <ArrowUpRight size={12} className="text-red-500" />}
                          {isUnder && <ArrowDownRight size={12} className="text-emerald-500" />}
                          <span
                            className={`text-[10px] font-black ${isOver ? 'text-red-500' : isUnder ? 'text-emerald-500' : 'text-slate-400'}`}
                          >
                            {p.variance > 0 ? '+' : ''}
                            {p.variance.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-400 w-14">Budget</span>
                          <div className="flex-grow h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded-full"
                              style={{ width: `${(p.avgBudgeted / maxVal) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 w-16 text-right">
                            {formatMoney(p.avgBudgeted)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-400 w-14">Actual</span>
                          <div className="flex-grow h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isOver ? 'bg-red-400' : 'bg-emerald-400'}`}
                              style={{ width: `${(p.avgActual / maxVal) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 w-16 text-right">
                            {formatMoney(p.avgActual)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── FORECAST TAB ── */}
      {activeTab === 'forecast' && (
        <div className="space-y-5">
          {/* Run Forecast Button */}
          {!forecastResult && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-center">
              <Sparkles size={32} className="mx-auto text-violet-500 mb-3" />
              <h3 className="font-black text-slate-800 dark:text-white text-lg mb-1">Budget Forecast</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                Analyzes {teamSeasons.length} season{teamSeasons.length !== 1 ? 's' : ''} of historical data across the
                entire team to predict your next budget.
              </p>
              {teamSeasons.length <= 2 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                  With {teamSeasons.length} season{teamSeasons.length !== 1 ? 's' : ''} of data, forecasts are
                  directional estimates. Accuracy improves with 4+ seasons.
                </p>
              )}
              <button
                onClick={() => runForecast(rosterSize, budgetItems)}
                disabled={forecastLoading}
                className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-xl text-sm transition-all disabled:opacity-50"
              >
                {forecastLoading ? 'Analyzing...' : 'Generate Forecast'}
              </button>
              {forecastError && <p className="text-red-500 text-xs mt-3 font-bold">{forecastError}</p>}
            </div>
          )}

          {/* Forecast Results */}
          {forecastResult && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Forecast Season</p>
                  <p className="text-lg font-black text-violet-600 mt-1">{forecastResult.forecastSeasonId}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Projected Expenses</p>
                  <p className="text-lg font-black text-red-600 mt-1">
                    {formatMoney(forecastResult.summary.totalExpenses)}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Projected Income</p>
                  <p className="text-lg font-black text-emerald-600 mt-1">
                    {formatMoney(forecastResult.summary.totalIncome)}
                  </p>
                </div>
                <div className="bg-violet-50 dark:bg-violet-900/30 p-4 rounded-2xl border border-violet-200 dark:border-violet-700 shadow-sm dark:shadow-none">
                  <p className="text-[10px] font-bold text-violet-500 uppercase">Suggested Fee</p>
                  <p className="text-lg font-black text-violet-700 dark:text-violet-300 mt-1">
                    {formatMoney(forecastResult.summary.suggestedFee)}
                    <span className="text-[10px] font-bold text-slate-400 ml-1">/ player</span>
                  </p>
                </div>
              </div>

              {/* Confidence & Accuracy */}
              <div className="flex gap-3">
                <div
                  className={`px-3 py-1.5 rounded-full text-xs font-black ${
                    forecastResult.confidence === 'high'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : forecastResult.confidence === 'medium'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  }`}
                >
                  {forecastResult.confidence.toUpperCase()} CONFIDENCE
                </div>
                {forecastResult.accuracy != null && (
                  <div className="px-3 py-1.5 rounded-full text-xs font-black bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {forecastResult.accuracy}% ACCURACY
                  </div>
                )}
                <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {forecastResult.seasonsAnalyzed} season{forecastResult.seasonsAnalyzed !== 1 ? 's' : ''} analyzed
                </div>
              </div>

              {/* Category Breakdown */}
              {forecastResult.comparison && forecastResult.comparison.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                  <h3 className="font-black text-slate-800 dark:text-white text-sm flex items-center gap-2 mb-4">
                    <BarChart3 size={16} className="text-violet-600" /> Forecast vs Current Budget
                  </h3>
                  <div className="space-y-2">
                    {forecastResult.comparison.map((row) => {
                      const catInfo = budgetCategories.find((c) => c.code === row.category);
                      return (
                        <div key={row.category} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {catInfo?.name || row.category}
                              </span>
                              {row.trend !== 'stable' && (
                                <span className="text-[9px] font-black flex items-center gap-0.5">
                                  {row.trend === 'rising' ? (
                                    <>
                                      <ArrowUpRight size={10} className="text-red-500" />
                                      <span className="text-red-500">Rising</span>
                                    </>
                                  ) : (
                                    <>
                                      <ArrowDownRight size={10} className="text-emerald-500" />
                                      <span className="text-emerald-500">Declining</span>
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-bold">
                              <span className="text-slate-400">Now: {formatMoney(row.currentExpense)}</span>
                              <span className="text-violet-600 dark:text-violet-400">
                                Forecast: {formatMoney(row.forecastExpense)}
                              </span>
                              {row.expenseDiffPct !== 0 && (
                                <span
                                  className={`font-black ${row.expenseDiff > 0 ? 'text-red-500' : 'text-emerald-500'}`}
                                >
                                  {row.expenseDiff > 0 ? '+' : ''}
                                  {row.expenseDiffPct.toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Category Detail */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                <h3 className="font-black text-slate-800 dark:text-white text-sm flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-violet-600" /> Forecast Line Items
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400">
                        <th className="text-left py-2 font-bold">Category</th>
                        <th className="text-left py-2 font-bold">Item</th>
                        <th className="text-right py-2 font-bold">Income</th>
                        <th className="text-right py-2 font-bold">Fall Exp</th>
                        <th className="text-right py-2 font-bold">Spring Exp</th>
                        <th className="text-center py-2 font-bold">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastResult.forecast.map((item, i) => {
                        const catInfo = budgetCategories.find((c) => c.code === item.category);
                        return (
                          <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="py-2 font-bold text-slate-600 dark:text-slate-300">
                              {catInfo?.name || item.category}
                            </td>
                            <td className="py-2 text-slate-500 dark:text-slate-400">{item.label || '—'}</td>
                            <td className="py-2 text-right font-bold text-emerald-600">
                              {item.income > 0 ? formatMoney(item.income) : '—'}
                            </td>
                            <td className="py-2 text-right font-bold text-red-500">
                              {item.expensesFall > 0 ? formatMoney(item.expensesFall) : '—'}
                            </td>
                            <td className="py-2 text-right font-bold text-red-500">
                              {item.expensesSpring > 0 ? formatMoney(item.expensesSpring) : '—'}
                            </td>
                            <td className="py-2 text-center">
                              <span
                                className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                  item.confidence === 'high'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : item.confidence === 'medium'
                                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                }`}
                              >
                                {item.confidence}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Insights */}
              {forecastResult.insights.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 p-5 rounded-2xl border border-amber-200 dark:border-amber-700">
                  <h3 className="font-black text-amber-800 dark:text-amber-300 text-sm flex items-center gap-2 mb-3">
                    <Lightbulb size={16} /> Model Insights
                  </h3>
                  <ul className="space-y-1.5">
                    {forecastResult.insights.map((insight, i) => (
                      <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                {/* Import into forecasted season (create season + save budget) */}
                <button
                  onClick={async () => {
                    const targetSeason = forecastResult.forecastSeasonId;
                    const exists = seasons.some((s) => s.id === targetSeason);

                    try {
                      setIsSaving(true);
                      // 1. Create season if it doesn't exist
                      if (!exists) {
                        await supabaseService.saveSeason(targetSeason, { name: targetSeason });
                      }

                      // 2. Create or get team_season
                      let tsId = teamSeasons.find((ts) => ts.seasonId === targetSeason)?.id;
                      if (!tsId && selectedTeamId) {
                        const ts = await supabaseService.saveTeamSeason({
                          teamId: selectedTeamId,
                          seasonId: targetSeason,
                          isFinalized: false,
                          baseFee: forecastResult.summary.suggestedFee || 0,
                          bufferPercent: bufferPercent,
                          expectedRosterSize: forecastResult.rosterSize,
                        });
                        tsId = ts?.id;
                      }

                      // 3. Save forecast items as budget
                      const items = forecastResult.forecast.map((i) => ({
                        category: i.category,
                        label: i.label,
                        income: i.income,
                        expensesFall: i.expensesFall,
                        expensesSpring: i.expensesSpring,
                      }));
                      await supabaseService.saveBudgetItems(targetSeason, items, tsId);

                      // 4. Switch to the new season
                      await refreshSeasons();
                      setSelectedSeason(targetSeason);
                      clearForecast();
                      setActiveTab('budget');
                      onDataChange?.();
                      showToast?.(`Forecast imported into ${targetSeason}`);
                    } catch (err) {
                      showToast?.(`Failed to import: ${err.message}`, true);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-xl text-xs transition-all disabled:opacity-50"
                >
                  <Sparkles size={14} className="inline mr-1.5" />
                  {isSaving ? 'Importing...' : `Import into ${forecastResult.forecastSeasonId}`}
                </button>

                {/* Apply to current season's budget table (without creating new season) */}
                {!isFinalized && (
                  <button
                    onClick={() => {
                      const items = forecastResult.forecast.map((i) => ({
                        category: i.category,
                        label: i.label,
                        income: i.income,
                        expensesFall: i.expensesFall,
                        expensesSpring: i.expensesSpring,
                      }));
                      setBudgetItems(items);
                      setActiveTab('budget');
                      clearForecast();
                      showToast?.('Forecast applied to current budget table');
                    }}
                    className="px-5 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 font-bold rounded-xl text-xs transition-all"
                  >
                    Apply to Current Season
                  </button>
                )}

                <button
                  onClick={() => runForecast(rosterSize, budgetItems)}
                  disabled={forecastLoading}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all"
                >
                  Re-run Forecast
                </button>
                <button
                  onClick={clearForecast}
                  className="px-5 py-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-xs transition-all"
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── NEW SEASON MODAL ── */}
      {showNewSeasonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl dark:shadow-none">
            <h3 className="font-black text-slate-900 dark:text-white text-lg mb-4">New Season</h3>
            <form onSubmit={handleCreateSeason} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. 2026-2027"
                value={newSeasonName}
                onChange={(e) => setNewSeasonName(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white rounded-xl p-3 font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewSeasonModal(false)}
                  className="flex-1 py-2.5 font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 shadow-lg dark:shadow-none"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD PLAYER MODAL ── */}
      <PlayerFormModal
        show={showPlayerForm}
        onClose={() => setShowPlayerForm(false)}
        onSubmit={handleAddNewPlayer}
        onArchive={() => {}}
        initialData={null}
        isSubmitting={isSubmittingPlayer}
        selectedSeason={selectedSeason}
      />
    </div>
  );
}
