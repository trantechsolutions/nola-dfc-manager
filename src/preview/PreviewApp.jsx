import { useEffect, useState } from 'react';
import {
  Building2,
  Calendar,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  ReceiptText,
  SlidersHorizontal,
  Sun,
  Users,
} from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { NavigationContext } from '../context/NavigationContext';
import { DataContext } from '../context/DataContext';
import { FinanceContext } from '../context/FinanceContext';
import { ScheduleContext } from '../context/ScheduleContext';
import AppShell from '../components/layout/AppShell';
import NextMatchCard from '../components/NextMatchCard';
import AttentionStrip from '../components/AttentionStrip';
import TeamOverviewView from '../views/team/TeamOverviewView';
import ParentView from '../views/team/ParentView';
import ScheduleView from '../views/team/ScheduleView';
import { buildCompliance } from '../utils/compliance';

// ── Sample season ─────────────────────────────────────────────────────────
// Dates are built relative to today so "next up", "tomorrow" and the
// overdue paperwork always read the way they would on a real Saturday.

const SEASON = '2026-2027';
const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
const at = (days, hour) => {
  const d = new Date((now + days * DAY) * 1000);
  d.setHours(hour, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};
const display = (ts) => {
  const d = new Date(ts * 1000);
  return {
    displayDate: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    displayTime: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
};
const event = (id, title, ts, eventType, location) => ({
  id,
  title,
  timestamp: ts,
  eventType,
  location,
  isCancelled: false,
  ...display(ts),
});

const UPCOMING = [
  event('u1', 'vs Mandeville FC', at(2, 9), 'league', 'City Park Field 4, New Orleans'),
  event('u2', 'Practice', at(4, 18), 'practice', 'Pan American Stadium'),
  event('u3', 'at Baton Rouge SC', at(9, 10), 'league', 'BREC Burbank Soccer Complex'),
  event('u4', 'Fall Classic', at(15, 8), 'tournament', 'Lafreniere Park, Metairie'),
  event('u5', 'Practice', at(18, 18), 'practice', 'Pan American Stadium'),
  event('u6', 'vs Lake Charles United', at(37, 11), 'friendly', 'TBD'),
];
const PAST = [
  event('p1', 'vs Northshore Strikers', at(-5, 9), 'league', 'City Park Field 2'),
  event('p2', 'Practice', at(-7, 18), 'practice', 'Pan American Stadium'),
  event('p3', 'at Houma Hurricanes', at(-12, 10), 'league', 'Houma Sports Complex'),
  event('p4', 'vs Slidell Storm', at(-19, 9), 'friendly', 'City Park Field 4'),
];
const SCORES = { p1: [3, 1], p3: [0, 2], p4: [2, 2] };
const TEAM_EVENTS = [...UPCOMING, ...PAST].map((e) => ({
  id: `db-${e.id}`,
  uid: e.id,
  eventDate: new Date(e.timestamp * 1000).toISOString(),
  eventType: e.eventType,
  typeLocked: false,
  scoreFor: SCORES[e.id]?.[0] ?? null,
  scoreAgainst: SCORES[e.id]?.[1] ?? null,
}));

const isoIn = (days) => new Date((now + days * DAY) * 1000).toISOString().slice(0, 10);

const PLAYERS = [
  ['p-1', 'Maya', 'Thompson', 7],
  ['p-2', 'Ava', 'Broussard', 10],
  ['p-3', 'Zoe', 'Landry', 4],
  ['p-4', 'Lila', 'Nguyen', 14],
  ['p-5', 'Chloe', 'Hebert', 22],
].map(([id, firstName, lastName, jerseyNumber]) => ({
  id,
  firstName,
  lastName,
  jerseyNumber,
  teamId: 't1',
  status: 'active',
  birthdate: '2015-03-14',
  shirtSize: 'YL',
  guardians: [{ id: `g-${id}`, name: `Sam ${lastName}`, phone: '5045550142', email: `sam@${lastName}.example` }],
  seasonProfiles: { [SEASON]: { feeWaived: id === 'p-5' } },
}));

const CHECKLIST = [
  { key: 'medical', label: 'Medical release', type: 'check', required: true, audience: 'parent', dueDate: isoIn(-2) },
  { key: 'birth', label: 'Birth certificate', type: 'check', required: true, audience: 'parent', dueDate: isoIn(5) },
  { key: 'uniform', label: 'Order uniform', type: 'check', required: true, audience: 'parent', dueDate: null },
  { key: 'photo', label: 'Team photo form', type: 'check', required: false, audience: 'parent', dueDate: null },
];
const RESPONSES = [
  ...['p-2', 'p-3', 'p-4', 'p-5'].map((playerId) => ({ playerId, itemKey: 'medical', completed: true })),
  ...['p-2', 'p-3'].map((playerId) => ({ playerId, itemKey: 'birth', completed: true })),
  ...['p-1', 'p-2', 'p-3', 'p-4'].map((playerId) => ({ playerId, itemKey: 'uniform', completed: true })),
];

const FEE = 650;
const PAID = { 'p-1': 350, 'p-2': 650, 'p-3': 650, 'p-4': 200, 'p-5': 0 };
const financialsFor = (player) => {
  const waived = player?.seasonProfiles?.[SEASON]?.feeWaived;
  const totalPaid = PAID[player?.id] || 0;
  return {
    baseFee: FEE,
    totalPaid,
    fundraising: player?.id === 'p-1' ? 50 : 0,
    sponsorships: 0,
    credits: 0,
    remainingBalance: waived ? 0 : FEE - totalPaid - (player?.id === 'p-1' ? 50 : 0),
    isWaived: !!waived,
    isFinalized: true,
  };
};

const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PreviewApp({ params }) {
  const { t, setLocale } = useT();
  const role = params.get('role') === 'parent' ? 'parent' : 'staff';
  const isStaff = role === 'staff';
  const [view, setView] = useState(params.get('page') === 'schedule' ? 'schedule' : 'dashboard');

  useEffect(() => {
    if (params.get('lang') === 'es') setLocale?.('es');
  }, [params, setLocale]);

  const team = {
    id: 't1',
    name: 'U12 Girls Premier',
    colorPrimary: params.get('color') || '#0a7c3e',
    ageGroup: 'U12',
    gender: 'Girls',
    tier: 'Premier',
    icalUrl: 'https://calendar.google.com/calendar/ical/demo/public/basic.ics',
    activeSeasonId: SEASON,
    paymentInfo: 'Checks payable to NOLA DFC, or Venmo @NOLADFC-U12G.',
  };
  const players = isStaff ? PLAYERS : PLAYERS.slice(0, 1);
  const compliance = buildCompliance({ items: CHECKLIST, responses: RESPONSES, players, seasonId: SEASON });

  const seasonNavItems = isStaff
    ? [
        { id: 'dashboard', label: t('nav.seasonOverview'), icon: LayoutDashboard, section: 'season' },
        { id: 'planner', label: t('nav.planner'), icon: ClipboardList, section: 'season' },
        { id: 'finance/budget', label: t('nav.budget'), icon: FileSpreadsheet, section: 'season' },
        { id: 'finance/ledger', label: t('nav.ledger'), icon: ReceiptText, section: 'season' },
      ]
    : [{ id: 'dashboard', label: t('nav.myPlayer'), icon: Users, section: 'season' }];
  const teamNavItems = isStaff
    ? [
        { id: 'schedule', label: t('nav.schedule'), icon: Calendar, section: 'team' },
        { id: 'people', label: t('nav.players'), icon: Users, section: 'team' },
        { id: 'checklist', label: t('nav.checklist'), icon: ListChecks, section: 'team' },
        { id: 'team-admin', label: t('nav.settings'), icon: SlidersHorizontal, section: 'team' },
      ]
    : [
        { id: 'checklist', label: t('nav.checklist'), icon: ListChecks, section: 'team' },
        { id: 'schedule', label: t('nav.schedule'), icon: Calendar, section: 'team' },
      ];
  const clubNavItems = isStaff
    ? [{ id: 'club-overview', label: t('nav.overview'), icon: Building2, section: 'club' }]
    : [];

  const nav = {
    club: { id: 'c1', name: 'NOLA DFC' },
    teams: [team],
    selectedTeamId: 't1',
    selectedTeam: team,
    setSelectedTeamId: () => {},
    appNavItems: [],
    clubNavItems,
    seasonNavItems,
    teamNavItems,
    selectedSeason: SEASON,
    setSelectedSeason: () => {},
    seasons: [{ id: SEASON }, { id: '2025-2026' }],
    currentView: view,
    navigate: (path) => setView(String(path).replace(/^\//, '') || 'dashboard'),
    user: { email: isStaff ? 'coach.dana@example.com' : 'sam.thompson@example.com' },
    effectiveRole: isStaff ? 'team_manager' : 'parent',
    toggleLocale: () => {},
    locale: 'en',
    cycleTheme: () => document.documentElement.classList.toggle('dark'),
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    ThemeIcon: Sun,
    supabase: { auth: { signOut: () => {} } },
    effectiveIsStaff: isStaff,
    isClubAdmin: false,
    canEditLedger: isStaff,
    singleTeam: false,
  };
  // loading=1 shows the moment before the feed answers.
  const loading = params.get('loading') === '1';
  const events = loading ? { upcoming: [], past: [] } : { upcoming: UPCOMING, past: PAST };
  const data = {
    seasonalPlayers: players,
    myPlayers: isStaff ? [] : players,
    seasonalTransactions: [],
    compliance,
  };
  const finance = {
    teamBalance: 2140,
    totalExpenses: 3180,
    formatMoney: money,
    calculatePlayerFinancials: financialsFor,
  };

  const page =
    view === 'schedule' ? (
      <ScheduleView
        events={events}
        blackoutDates={[]}
        selectedTeam={team}
        canEditSchedule={isStaff}
        teamEvents={TEAM_EVENTS}
        onTypeChange={isStaff ? async () => {} : null}
        onScoreChange={isStaff ? async () => {} : null}
        selectedSeason={SEASON}
        seasonIds={[SEASON]}
      />
    ) : (
      <div className={`space-y-6 pt-4 md:pt-6 ${isStaff ? '' : 'mx-auto max-w-3xl'}`}>
        {!isStaff && <AttentionStrip />}
        <NextMatchCard />
        {isStaff ? (
          <TeamOverviewView
            teamId="t1"
            players={players}
            teamBalance={finance.teamBalance}
            totalExpenses={finance.totalExpenses}
            formatMoney={money}
            selectedSeasonData={{
              id: SEASON,
              teamSeasonId: 'ts1',
              isFinalized: true,
              calculatedBaseFee: FEE,
              totalProjectedExpenses: 5200,
              totalProjectedIncome: 5400,
              expectedRosterSize: 12,
            }}
            transactions={[]}
            calculatePlayerFinancials={financialsFor}
            selectedSeason={SEASON}
            canViewFinancials
            compliance={compliance}
            onAddPlayer={() => {}}
            onEditPlayer={() => {}}
            onViewPlayer={() => {}}
            accountMap={{}}
          />
        ) : (
          <ParentView
            players={players}
            transactions={[]}
            calculatePlayerFinancials={financialsFor}
            formatMoney={money}
            teams={[team]}
            seasons={[{ id: SEASON }]}
            selectedSeason={SEASON}
            setSelectedSeason={() => {}}
            currentSeasonData={{ isFinalized: true }}
            user={nav.user}
            accounts={[]}
            compliance={compliance}
          />
        )}
      </div>
    );

  return (
    <NavigationContext.Provider value={nav}>
      <DataContext.Provider value={data}>
        <FinanceContext.Provider value={finance}>
          <ScheduleContext.Provider value={{ events, scheduleLoading: loading }}>
            <AppShell>{page}</AppShell>
          </ScheduleContext.Provider>
        </FinanceContext.Provider>
      </DataContext.Provider>
    </NavigationContext.Provider>
  );
}
