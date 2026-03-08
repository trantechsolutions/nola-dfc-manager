// src/utils/eventMatcher.js
// Groups schedule events into tournaments/leagues and matches them against actual transactions.

/**
 * Known event group definitions. 
 * Each group has keywords to match against event descriptions AND transaction titles.
 * "type" determines the cost structure (tournament = registration + checkin, league = per-game refs).
 */
const EVENT_GROUPS = [
  // ── TOURNAMENTS (matched by description keywords from iCal) ──
  { id: 'midnight-madness',    name: 'Midnight Madness',                   type: 'tournament', eventKeywords: ['mm tournament'],                                        txKeywords: ['midnight madness'] },
  { id: 'stysa-fall',          name: 'STYSA Fall Classic / Deep South',    type: 'tournament', eventKeywords: ['deep south challenge', 'stysa'],                        txKeywords: ['stysa tournament', 'stysa fall'] },
  { id: 'gulf-coast-fall',     name: 'Gulf Coast Fall Classic',            type: 'tournament', eventKeywords: ['gulf coast fall'],                                      txKeywords: ['gulfport tournament', 'gulf coast fall'] },
  { id: 'gobbler-cup',         name: 'Gobbler Cup',                        type: 'tournament', eventKeywords: ['gobbler'],                                              txKeywords: ['gobbler cup', 'houma bayou'] },
  { id: 'fairhope',            name: 'Fairhope Spring Blast',              type: 'tournament', eventKeywords: ['fairhope spring blast', 'fairhope'],                    txKeywords: ['fairhope'] },
  { id: 'gulf-coast-spring',   name: 'Gulfport Player Cup & Showcase',     type: 'tournament', eventKeywords: ['gulfport player cup', 'gulfport showcase'],             txKeywords: ['gulfport player cup', 'gulfport showcase'] },
  { id: 'red-stick',           name: 'Red Stick Tournament',               type: 'tournament', eventKeywords: ['red stick'],                                            txKeywords: ['red stick'] },
  { id: 'bayou-shootout',      name: 'Bayou Shootout',                     type: 'tournament', eventKeywords: ['bayou shootout'],                                       txKeywords: ['bayou shootout'] },
  { id: 'gulf-coast-cup',      name: 'Gulf Coast Cup & Showcase',          type: 'tournament', eventKeywords: ['gulf coast cup'],                                       txKeywords: ['gulf coast cup'] },
  
  // ── LEAGUES (matched by description keywords) ──
  { id: 'psl',                 name: 'PSL (Premier Soccer League)',         type: 'league',     eventKeywords: ['psl'],                                                 txKeywords: ['psl'] },
  { id: 'lsap',                name: 'LSAP',                               type: 'league',     eventKeywords: ['lsap'],                                                txKeywords: ['lsap'] },
  { id: 'lcsl',                name: 'LCSL',                               type: 'league',     eventKeywords: ['lcsl'],                                                txKeywords: ['lcsl'] },
  { id: 'st-charles',          name: 'St. Charles League',                  type: 'league',     eventKeywords: ['st charles league'],                                   txKeywords: ['st charles'] },
];

/**
 * Match an event to a known group using its description and title.
 * Returns the group object or null.
 */
function matchEventToGroup(event) {
  const desc = (event.description || '').toLowerCase();
  const title = (event.title || '').toLowerCase();
  const combined = `${title} ${desc}`;
  
  for (const group of EVENT_GROUPS) {
    if (group.eventKeywords.some(kw => combined.includes(kw))) {
      return group;
    }
  }
  return null;
}

/**
 * Match a transaction to a known group using its title and notes.
 * Returns the group object or null.
 */
function matchTxToGroup(tx) {
  const title = (tx.title || '').toLowerCase();
  const notes = (tx.notes || '').toLowerCase();
  const combined = `${title} ${notes}`;
  
  for (const group of EVENT_GROUPS) {
    if (group.txKeywords.some(kw => combined.includes(kw))) {
      return group;
    }
  }
  return null;
}

/**
 * Build the full event-transaction matching report.
 * 
 * Returns an array of EventGroupReport objects:
 * {
 *   id, name, type,
 *   events: [...],           // iCal events in this group
 *   transactions: [...],     // matched transactions
 *   totalSpent: number,      // absolute value of matched transaction amounts
 *   gameCount: number,       // number of events (games) in the group
 *   isPast: boolean,         // all events are in the past
 *   isUpcoming: boolean,     // has at least one upcoming event
 *   hasCost: boolean,        // has at least one transaction
 * }
 */
export function buildEventMatchReport(events, transactions) {
  const allEvents = [...(events.upcoming || []), ...(events.past || [])];
  
  // Only look at expense transactions in relevant categories
  const relevantTx = transactions.filter(tx => 
    ['TOU', 'LEA', 'FRI'].includes(tx.category) && 
    !tx.waterfallBatchId
  );

  const now = Math.floor(Date.now() / 1000);

  // Build group reports
  const groupMap = {};

  // 1. Assign events to groups
  allEvents.forEach(event => {
    if (event.isCancelled) return;
    const group = matchEventToGroup(event);
    if (!group) return;

    if (!groupMap[group.id]) {
      groupMap[group.id] = {
        ...group,
        events: [],
        transactions: [],
        totalSpent: 0,
        gameCount: 0,
      };
    }
    groupMap[group.id].events.push(event);
    // Only count actual competitive events (games), not practice
    if (event.eventType === 'tournament' || event.eventType === 'league' || event.eventType === 'friendly') {
      groupMap[group.id].gameCount++;
    }
  });

  // 2. Assign transactions to groups
  relevantTx.forEach(tx => {
    const group = matchTxToGroup(tx);
    if (!group) return;

    if (!groupMap[group.id]) {
      // Transaction exists but no events found (e.g., registered but no schedule yet)
      groupMap[group.id] = {
        ...group,
        events: [],
        transactions: [],
        totalSpent: 0,
        gameCount: 0,
      };
    }
    groupMap[group.id].transactions.push(tx);
    groupMap[group.id].totalSpent += Math.abs(Number(tx.amount || 0));
  });

  // 3. Compute derived fields
  const reports = Object.values(groupMap).map(group => {
    const upcomingEvents = group.events.filter(e => e.timestamp >= now);
    const pastEvents = group.events.filter(e => e.timestamp < now);

    return {
      ...group,
      isPast: upcomingEvents.length === 0 && pastEvents.length > 0,
      isUpcoming: upcomingEvents.length > 0,
      hasCost: group.transactions.length > 0,
      upcomingCount: upcomingEvents.length,
      pastCount: pastEvents.length,
      upcomingEvents,
      pastEvents,
    };
  });

  // Sort: upcoming first, then by first event date
  reports.sort((a, b) => {
    if (a.isUpcoming && !b.isUpcoming) return -1;
    if (!a.isUpcoming && b.isUpcoming) return 1;
    const aDate = a.events[0]?.timestamp || 0;
    const bDate = b.events[0]?.timestamp || 0;
    return aDate - bDate;
  });

  // 4. Unmatched transactions (expenses not linked to any known group)
  const matchedTxIds = new Set();
  reports.forEach(r => r.transactions.forEach(tx => matchedTxIds.add(tx.id)));
  const unmatchedTx = relevantTx.filter(tx => !matchedTxIds.has(tx.id));

  // 5. Summary stats
  const totalMatchedSpend = reports.reduce((s, r) => s + r.totalSpent, 0);
  const totalUnmatchedSpend = unmatchedTx.reduce((s, tx) => s + Math.abs(Number(tx.amount || 0)), 0);
  const upcomingWithNoCost = reports.filter(r => r.isUpcoming && !r.hasCost);
  const upcomingPaid = reports.filter(r => r.isUpcoming && r.hasCost);

  return {
    groups: reports,
    unmatchedTx,
    summary: {
      totalGroups: reports.length,
      upcomingGroups: reports.filter(r => r.isUpcoming).length,
      pastGroups: reports.filter(r => r.isPast).length,
      totalMatchedSpend,
      totalUnmatchedSpend,
      upcomingWithNoCost: upcomingWithNoCost.length,
      upcomingPaid: upcomingPaid.length,
    }
  };
}