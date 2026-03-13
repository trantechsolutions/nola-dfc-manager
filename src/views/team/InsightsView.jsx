import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, 
  Send, Bot, User, Sparkles, DollarSign, Users, Target,
  Loader2, ChevronDown, ChevronUp, Info, Key, X,
  CalendarDays, CircleDollarSign, CircleAlert, CircleCheck
} from 'lucide-react';
import { EVENT_TYPES } from '../../utils/eventClassifier';
import { buildEventMatchReport } from '../../utils/eventMatcher';
import { filterEventsBySeason, getSeasonDateRange } from '../../utils/seasonUtils';

const GEMINI_MODEL = 'gemini-2.0-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CATEGORY_LABELS = { TMF:'Team Fees', SPO:'Sponsorship', FUN:'Fundraising', OPE:'Operating', TOU:'Tournament', LEA:'League/Refs', CRE:'Credit', FRI:'Friendlies' };

export default function InsightsView({ 
  transactions, players, selectedSeason, currentSeasonData, 
  calculatePlayerFinancials, formatMoney,
  events = { upcoming: [], past: [] }
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showApiSetup, setShowApiSetup] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [expandedPanel, setExpandedPanel] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ─── FILTER EVENTS TO SELECTED SEASON ───
  const seasonRange = useMemo(() => getSeasonDateRange(selectedSeason), [selectedSeason]);
  const seasonEvents = useMemo(() => filterEventsBySeason(events, selectedSeason), [events, selectedSeason]);

  // ─── EVENT-TRANSACTION MATCHING (season-scoped) ───
  const matchReport = useMemo(() => buildEventMatchReport(seasonEvents, transactions), [seasonEvents, transactions]);

  // ─── SCHEDULE ANALYTICS (season-scoped) ───
  const scheduleAnalytics = useMemo(() => {
    const upcoming = seasonEvents.upcoming || [];
    const past = seasonEvents.past || [];
    const byType = (list, type) => list.filter(e => e.eventType === type && !e.isCancelled);
    return {
      upcoming, past,
      upcomingTournaments: byType(upcoming, 'tournament'),
      upcomingLeague: byType(upcoming, 'league'),
      upcomingFriendlies: byType(upcoming, 'friendly'),
      upcomingPractice: byType(upcoming, 'practice'),
      pastTournaments: byType(past, 'tournament'),
      pastLeague: byType(past, 'league'),
      pastFriendlies: byType(past, 'friendly'),
    };
  }, [seasonEvents]);

  // ─── FINANCIAL ANALYTICS ───
  const analytics = useMemo(() => {
    const isCleared = (tx) => tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';
    const seasonTx = transactions.filter(tx => !tx.waterfallBatchId && tx.category !== 'TRF');
    const s = scheduleAnalytics;

    const categoryActuals = {};
    seasonTx.forEach(tx => { if (!isCleared(tx)) return; const cat = tx.category || 'OTHER'; categoryActuals[cat] = (categoryActuals[cat] || 0) + Number(tx.amount || 0); });

    const totalIncome = seasonTx.filter(tx => isCleared(tx) && tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const totalExpenses = seasonTx.filter(tx => isCleared(tx) && tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const netCash = totalIncome - totalExpenses;

    const playerBalances = players.map(p => ({ name: `${p.firstName} ${p.lastName}`, jerseyNumber: p.jerseyNumber, ...calculatePlayerFinancials(p, transactions) }));
    const totalOutstanding = playerBalances.reduce((sum, p) => sum + p.remainingBalance, 0);
    const paidInFull = playerBalances.filter(p => p.remainingBalance <= 0).length;
    const collectionRate = playerBalances.length > 0 ? Math.round((paidInFull / playerBalances.length) * 100) : 0;

    const projectedExpenses = currentSeasonData?.totalProjectedExpenses || 0;
    const burnRate = projectedExpenses > 0 ? Math.round((totalExpenses / projectedExpenses) * 100) : 0;
    const budgetRemaining = projectedExpenses - totalExpenses;

    // Use match report for smarter projections
    const upcomingUnpaid = matchReport.groups.filter(g => g.isUpcoming && !g.hasCost);
    // Estimate unpaid upcoming costs from historical averages of PAID events
    const paidTournaments = matchReport.groups.filter(g => g.type === 'tournament' && g.hasCost);
    const avgTournamentCost = paidTournaments.length > 0 ? paidTournaments.reduce((s, g) => s + g.totalSpent, 0) / paidTournaments.length : 600;
    const paidLeagues = matchReport.groups.filter(g => g.type === 'league' && g.hasCost);
    const avgLeagueCost = paidLeagues.length > 0 ? paidLeagues.reduce((s, g) => s + g.totalSpent, 0) / paidLeagues.length : 200;

    const projUnpaidCost = upcomingUnpaid.reduce((sum, g) => {
      return sum + (g.type === 'tournament' ? avgTournamentCost : avgLeagueCost);
    }, 0);

    // Per-game ref costs for league games
    const leagueRefSpend = Math.abs(categoryActuals['LEA'] || 0);
    const pastLeagueCount = s.pastLeague.length;
    const avgRefPerGame = pastLeagueCount > 0 ? leagueRefSpend / pastLeagueCount : 45;
    const projRemainingRefs = s.upcomingLeague.length * avgRefPerGame;

    const projRemainingTotal = projUnpaidCost + projRemainingRefs;
    const projectedFinalExpense = totalExpenses + projRemainingTotal;
    const projectedOverUnder = projectedExpenses - projectedFinalExpense;

    const topOwed = playerBalances.filter(p => p.remainingBalance > 0).sort((a, b) => b.remainingBalance - a.remainingBalance);

    // Season progress
    const now = Date.now();
    const seasonStart = seasonRange.start.getTime();
    const seasonEnd = seasonRange.end.getTime();
    const totalDuration = seasonEnd - seasonStart;
    const elapsed = Math.max(0, Math.min(now - seasonStart, totalDuration));
    const seasonProgress = totalDuration > 0 ? Math.round((elapsed / totalDuration) * 100) : 0;
    const seasonStatus = now > seasonEnd ? 'ended' : now < seasonStart ? 'not started' : 'in progress';

    return {
      totalIncome, totalExpenses, netCash, categoryActuals,
      totalOutstanding, paidInFull, collectionRate, playerBalances, topOwed,
      projectedExpenses, burnRate, budgetRemaining,
      avgTournamentCost, avgLeagueCost, avgRefPerGame,
      projUnpaidCost, projRemainingRefs, projRemainingTotal,
      projectedFinalExpense, projectedOverUnder,
      seasonProgress, seasonStatus,
    };
  }, [transactions, players, currentSeasonData, calculatePlayerFinancials, scheduleAnalytics, matchReport, seasonRange]);

  // ─── LLM PROMPT ───
  const buildSystemPrompt = () => {
    const a = analytics; const s = scheduleAnalytics; const m = matchReport;
    const catBreakdown = Object.entries(a.categoryActuals).map(([cat, amt]) => `  ${CATEGORY_LABELS[cat] || cat}: ${formatMoney(amt)}`).join('\n');
    const playerSummary = a.playerBalances.map(p => `  #${p.jerseyNumber || '?'} ${p.name}: fee=${formatMoney(p.baseFee)}, paid=${formatMoney(p.totalPaid)}, fundraising=${formatMoney(p.fundraising)}, sponsorships=${formatMoney(p.sponsorships)}, remaining=${formatMoney(p.remainingBalance)}${p.isWaived ? ' [WAIVED]' : ''}`).join('\n');

    const groupSummary = m.groups.map(g => {
      const status = g.isUpcoming ? (g.hasCost ? 'PAID' : 'UNPAID') : 'COMPLETED';
      return `  [${status}] ${g.name} (${g.type}): ${g.gameCount} games, spent ${formatMoney(g.totalSpent)}, ${g.upcomingCount} upcoming / ${g.pastCount} past`;
    }).join('\n');

    return `You are a financial advisor for NOLA DFC, a youth soccer team (U11 boys, 2015 birth year).
Season: ${selectedSeason} (${seasonRange.start.toLocaleDateString()} to ${seasonRange.end.toLocaleDateString()}).
Be concise, practical, specific with dollar amounts. No markdown headers. Under 300 words.

SEASON TIMING:
- Season runs: August ${selectedSeason.split('-')[0]} to May ${selectedSeason.split('-')[1]}
- Current date: ${new Date().toLocaleDateString()}
- Season ${a.seasonStatus} (${a.seasonProgress}% through)

FINANCIAL SUMMARY:
- Net cash: ${formatMoney(a.netCash)} | Outstanding: ${formatMoney(a.totalOutstanding)} | Collection: ${a.collectionRate}%
- Budget spent: ${formatMoney(a.totalExpenses)} of ${formatMoney(a.projectedExpenses)} (${a.burnRate}%)
- Budget remaining: ${formatMoney(a.budgetRemaining)}

EVENT-TRANSACTION MATCHING (from iCal schedule cross-referenced with actual payments):
${groupSummary}
- Unmatched expenses: ${m.unmatchedTx.length} transactions totaling ${formatMoney(m.summary.totalUnmatchedSpend)}
- Upcoming events with NO payment yet: ${m.summary.upcomingWithNoCost} events
- Avg tournament cost (from paid): ${formatMoney(a.avgTournamentCost)}
- Avg league season cost (from paid): ${formatMoney(a.avgLeagueCost)}
- Avg referee fee per league game: ${formatMoney(a.avgRefPerGame)}

PROJECTED REMAINING COSTS:
- Unpaid upcoming events: ${formatMoney(a.projUnpaidCost)}
- Remaining league referee fees: ${formatMoney(a.projRemainingRefs)} (${s.upcomingLeague.length} games × ${formatMoney(a.avgRefPerGame)})
- Total projected remaining: ${formatMoney(a.projRemainingTotal)}
- Projected end-of-season spend: ${formatMoney(a.projectedFinalExpense)}
- Projected ${a.projectedOverUnder >= 0 ? 'surplus' : 'shortfall'}: ${formatMoney(Math.abs(a.projectedOverUnder))}

SCHEDULE:
- Past: ${s.pastLeague.length} league, ${s.pastTournaments.length} tournaments, ${s.pastFriendlies.length} friendlies
- Upcoming: ${s.upcomingLeague.length} league, ${s.upcomingTournaments.length} tournaments, ${s.upcomingFriendlies.length} friendlies

CATEGORY ACTUALS:
${catBreakdown}

PER-PLAYER:
${playerSummary}`;
  };

  // ─── CHAT ───
  const sendMessage = async (text) => {
    if (!text.trim()) return;
    if (!apiKey) { setShowApiSetup(true); return; }
    const userMsg = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]); setInput(''); setIsLoading(true);
    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: buildSystemPrompt() }] }, contents: history, generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } })
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error?.message || `API error: ${response.status}`); }
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response.' }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection error: ${err.message}` }]);
    } finally { setIsLoading(false); }
  };

  const quickPrompts = [
    "Are we on track to stay within budget?",
    "Which upcoming events haven't been paid for yet?",
    "How much will our remaining tournaments cost?",
    "Which players still owe the most?",
    "Give me a financial summary for parents.",
    "What should I budget differently next season?",
  ];

  const saveApiKey = (key) => { setApiKey(key); if (key) localStorage.setItem('gemini_api_key', key); else localStorage.removeItem('gemini_api_key'); };
  const togglePanel = (id) => setExpandedPanel(prev => prev === id ? null : id);
  const a = analytics; const s = scheduleAnalytics; const m = matchReport;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Budget Insights</h2>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          {selectedSeason} (Aug {selectedSeason.split('-')[0]} – May {selectedSeason.split('-')[1]}) · {seasonEvents.upcoming.length + seasonEvents.past.length} events · {m.summary.upcomingWithNoCost > 0 ? `${m.summary.upcomingWithNoCost} unpaid` : 'all paid'}
        </p>
      </div>

      {/* ── TOP METRICS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`p-4 rounded-2xl shadow-sm border ${a.netCash >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <DollarSign size={14} className={a.netCash >= 0 ? 'text-emerald-600' : 'text-red-600'} />
          <p className={`text-xl font-black mt-1 ${a.netCash >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(a.netCash)}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Net Cash</p>
        </div>
        <div className="p-4 rounded-2xl shadow-sm border bg-amber-50 border-amber-200">
          <Target size={14} className="text-amber-600" />
          <p className="text-xl font-black text-amber-700 mt-1">{formatMoney(a.totalOutstanding)}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Outstanding</p>
        </div>
        <div className={`p-4 rounded-2xl shadow-sm border ${m.summary.upcomingWithNoCost > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <CircleDollarSign size={14} className={m.summary.upcomingWithNoCost > 0 ? 'text-red-600' : 'text-emerald-600'} />
          <p className={`text-xl font-black mt-1 ${m.summary.upcomingWithNoCost > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(a.projRemainingTotal)}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Proj. Remaining</p>
        </div>
        <div className={`p-4 rounded-2xl shadow-sm border ${a.projectedOverUnder >= 0 ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200'}`}>
          {a.projectedOverUnder >= 0 ? <TrendingUp size={14} className="text-emerald-600" /> : <TrendingDown size={14} className="text-red-600" />}
          <p className={`text-xl font-black mt-1 ${a.projectedOverUnder >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(Math.abs(a.projectedOverUnder))}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Proj. {a.projectedOverUnder >= 0 ? 'Surplus' : 'Shortfall'}</p>
        </div>
      </div>

      {/* ── EVENT-TRANSACTION MATCH REPORT ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button onClick={() => togglePanel('events')} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
          <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-600" /> Event Cost Tracker
            {m.summary.upcomingWithNoCost > 0 && (
              <span className="text-[9px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{m.summary.upcomingWithNoCost} unpaid</span>
            )}
          </span>
          {expandedPanel === 'events' ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {expandedPanel === 'events' && (
          <div className="px-4 pb-4 space-y-3">
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 p-3 rounded-xl text-center">
                <p className="text-2xl font-black text-emerald-700">{m.summary.upcomingPaid}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Paid</p>
              </div>
              <div className={`p-3 rounded-xl text-center ${m.summary.upcomingWithNoCost > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <p className={`text-2xl font-black ${m.summary.upcomingWithNoCost > 0 ? 'text-red-700' : 'text-slate-400'}`}>{m.summary.upcomingWithNoCost}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Unpaid</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl text-center">
                <p className="text-2xl font-black text-slate-700">{m.summary.pastGroups}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Completed</p>
              </div>
            </div>

            {/* Event groups */}
            <div className="space-y-2">
              {m.groups.map(group => {
                const isExpanded = expandedGroup === group.id;
                const typeInfo = group.type === 'tournament' ? EVENT_TYPES.tournament : EVENT_TYPES.league;
                const statusColor = group.isPast ? 'text-slate-400' : group.hasCost ? 'text-emerald-600' : 'text-red-600';
                const statusBg = group.isPast ? 'bg-slate-50' : group.hasCost ? 'bg-emerald-50' : 'bg-red-50';
                const statusIcon = group.isPast ? <CheckCircle2 size={14} /> : group.hasCost ? <CircleCheck size={14} /> : <CircleAlert size={14} />;

                return (
                  <div key={group.id} className={`rounded-xl border overflow-hidden ${group.isPast ? 'border-slate-100 opacity-70' : group.hasCost ? 'border-emerald-200' : 'border-red-200'}`}>
                    <button onClick={() => setExpandedGroup(isExpanded ? null : group.id)} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50/50 transition-colors">
                      {/* Status icon */}
                      <div className={`p-1.5 rounded-lg ${statusBg} ${statusColor}`}>{statusIcon}</div>
                      
                      {/* Info */}
                      <div className="flex-grow text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${typeInfo.colorLight}`}>{group.type}</span>
                          <span className="text-sm font-bold text-slate-800 truncate">{group.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                          {group.gameCount} game{group.gameCount !== 1 ? 's' : ''} · {group.upcomingCount} upcoming
                        </p>
                      </div>

                      {/* Cost */}
                      <div className="text-right shrink-0">
                        {group.hasCost ? (
                          <p className="text-sm font-black text-slate-800">{formatMoney(group.totalSpent)}</p>
                        ) : group.isUpcoming ? (
                          <p className="text-sm font-black text-red-500">~{formatMoney(group.type === 'tournament' ? a.avgTournamentCost : a.avgLeagueCost)}</p>
                        ) : (
                          <p className="text-sm font-bold text-slate-300">$0</p>
                        )}
                        <p className="text-[10px] text-slate-400">{group.hasCost ? 'spent' : group.isUpcoming ? 'estimated' : ''}</p>
                      </div>

                      <ChevronDown size={14} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="bg-slate-50/50 border-t border-slate-100 p-3 space-y-2">
                        {/* Transactions */}
                        {group.transactions.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Payments</p>
                            {group.transactions.map(tx => (
                              <div key={tx.id} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">{tx.title}</p>
                                  <p className="text-[10px] text-slate-400">{tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString() : ''}</p>
                                </div>
                                <span className="text-xs font-black text-red-600 shrink-0 ml-2">{formatMoney(tx.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Upcoming games in this group */}
                        {group.upcomingEvents.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Upcoming Games</p>
                            {group.upcomingEvents.slice(0, 5).map(e => (
                              <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0">
                                <div className={`w-1 h-5 rounded-full ${typeInfo.dot}`} />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">{e.title}</p>
                                  <p className="text-[10px] text-slate-400">{e.displayDate} · {e.displayTime}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {group.transactions.length === 0 && group.upcomingEvents.length === 0 && (
                          <p className="text-xs text-slate-400 italic py-2">No payment or upcoming game data.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unmatched transactions */}
              {m.unmatchedTx.length > 0 && (
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Unmatched Expenses ({m.unmatchedTx.length})</p>
                  {m.unmatchedTx.slice(0, 5).map(tx => (
                    <div key={tx.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                      <span className="text-xs text-slate-600 truncate">{tx.title}</span>
                      <span className="text-xs font-bold text-slate-500 shrink-0 ml-2">{formatMoney(tx.amount)}</span>
                    </div>
                  ))}
                  {m.unmatchedTx.length > 5 && <p className="text-[10px] text-slate-400 mt-1">+{m.unmatchedTx.length - 5} more</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── PLAYER BALANCES & BUDGET ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button onClick={() => togglePanel('balances')} className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
          <span className="font-bold text-slate-800 text-sm flex items-center gap-2"><Users size={16} className="text-blue-600" /> Player Balances & Budget</span>
          {expandedPanel === 'balances' ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {expandedPanel === 'balances' && (
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl"><p className="text-[10px] font-bold text-slate-400 uppercase">Spent</p><p className="text-lg font-black text-slate-800">{formatMoney(a.totalExpenses)}</p><p className="text-[10px] text-slate-400 font-bold">{a.burnRate}% of budget</p></div>
              <div className="bg-slate-50 p-3 rounded-xl"><p className="text-[10px] font-bold text-slate-400 uppercase">Budget Remaining</p><p className={`text-lg font-black ${a.budgetRemaining >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(a.budgetRemaining)}</p></div>
              <div className={`p-3 rounded-xl ${a.projectedOverUnder >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}><p className="text-[10px] font-bold text-slate-400 uppercase">Proj. Final Spend</p><p className={`text-lg font-black ${a.projectedOverUnder >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(a.projectedFinalExpense)}</p></div>
            </div>
            {a.topOwed.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Outstanding Balances</p>
                <div className="space-y-1.5">{a.topOwed.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2"><span className="text-[10px] font-black text-slate-400 w-6">#{p.jerseyNumber || '?'}</span><span className="text-sm font-bold text-slate-700">{p.name}</span></div>
                    <div className="text-right"><span className="text-sm font-black text-red-600">{formatMoney(p.remainingBalance)}</span>{p.totalPaid > 0 && <p className="text-[10px] text-slate-400">paid {formatMoney(p.totalPaid)}</p>}</div>
                  </div>
                ))}</div>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Category Breakdown</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{Object.entries(a.categoryActuals).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).map(([cat, amt]) => (
                <div key={cat} className="bg-slate-50 p-2.5 rounded-lg"><p className="text-[10px] font-bold text-slate-400 uppercase truncate">{CATEGORY_LABELS[cat] || cat}</p><p className={`text-sm font-black ${amt < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatMoney(amt)}</p></div>
              ))}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── AI CHAT ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-violet-500 to-blue-600 rounded-lg"><Sparkles size={14} className="text-white" /></div>
            <div><h3 className="font-black text-slate-800 text-sm">Budget Advisor</h3><p className="text-[10px] text-slate-400 font-medium">Knows your schedule, payments, and player balances</p></div>
          </div>
          <button onClick={() => setShowApiSetup(!showApiSetup)} className={`p-2 rounded-lg transition-colors ${apiKey ? 'text-emerald-500 hover:bg-emerald-50' : 'text-amber-500 hover:bg-amber-50'}`}><Key size={16} /></button>
        </div>
        {showApiSetup && (
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <div className="flex items-start gap-2 mb-3"><Info size={14} className="text-blue-500 shrink-0 mt-0.5" /><p className="text-xs text-slate-600">Free key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold underline">Google AI Studio</a>. Stored locally.</p></div>
            <div className="flex gap-2"><input type="password" placeholder="Paste Gemini API key..." value={apiKey} onChange={(e) => saveApiKey(e.target.value)} className="flex-grow bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />{apiKey && <button onClick={() => saveApiKey('')} className="text-xs font-bold text-red-500 px-2">Clear</button>}</div>
            {apiKey && <p className="text-[10px] text-emerald-600 font-bold mt-2 flex items-center gap-1"><CheckCircle2 size={12} /> Key saved</p>}
          </div>
        )}
        <div className="h-80 md:h-96 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="p-3 bg-slate-100 rounded-full mb-3"><Bot size={24} className="text-slate-400" /></div>
              <p className="text-sm font-bold text-slate-800 mb-1">Ask about your budget & schedule</p>
              <p className="text-xs text-slate-400 mb-4 max-w-xs">I've matched {m.summary.totalGroups} tournaments/leagues from the {selectedSeason} season against your payment records. {m.summary.upcomingWithNoCost > 0 ? `${m.summary.upcomingWithNoCost} upcoming events still need payment.` : 'All upcoming events are paid.'}</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">{quickPrompts.map((p, i) => (<button key={i} onClick={() => sendMessage(p)} className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full border border-blue-100">{p}</button>))}</div>
            </div>
          ) : (
            <>{messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role !== 'user' && <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mt-0.5"><Bot size={14} className="text-white" /></div>}
                <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}><p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p></div>
                {msg.role === 'user' && <div className="shrink-0 w-7 h-7 rounded-lg bg-slate-300 flex items-center justify-center mt-0.5"><User size={14} className="text-white" /></div>}
              </div>
            ))}
            {isLoading && <div className="flex gap-2.5"><div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center"><Bot size={14} className="text-white" /></div><div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3"><Loader2 size={16} className="text-slate-400 animate-spin" /></div></div>}
            <div ref={chatEndRef} /></>
          )}
        </div>
        <div className="p-3 border-t border-slate-100">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
            <input type="text" placeholder={apiKey ? "Ask about budget or schedule..." : "Set up API key first..."} value={input} onChange={(e) => setInput(e.target.value)} disabled={isLoading} className="flex-grow bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
            <button type="submit" disabled={isLoading || !input.trim()} className="bg-slate-900 text-white p-2.5 rounded-xl hover:bg-slate-800 disabled:opacity-30 transition-all shrink-0"><Send size={16} /></button>
          </form>
          {messages.length > 0 && <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar pb-1">{quickPrompts.slice(0, 3).map((p, i) => (<button key={i} onClick={() => sendMessage(p)} disabled={isLoading} className="text-[10px] font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-full border border-slate-100 shrink-0 disabled:opacity-50 whitespace-nowrap">{p}</button>))}</div>}
        </div>
      </div>
    </div>
  );
}