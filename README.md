# NOLA DFC Manager

A full-stack web application for managing youth soccer team operations — finances, rosters, schedules, compliance, and parent communication — built for the NOLA DFC organization.

**Live:** https://apps.trantech.solutions/nola-dfc-manager/

---

## What It Does

NOLA DFC Manager replaces spreadsheets with a purpose-built tool that handles every aspect of running a competitive youth soccer team:

| Area | What it manages |
|---|---|
| **Finance** | Transaction ledger, seasonal budgets, automated fee calculation, fundraiser/sponsor waterfall distribution |
| **Roster** | Player profiles, guardian contacts, jersey numbers, fee waivers, bulk CSV import |
| **Schedule** | Live iCal sync (Ollie Sports, TeamSnap, Google Calendar), event classification, blackout dates |
| **Compliance** | Medical release and ReePlayer account tracking per player |
| **Documents** | Upload, verify, and track player documents with expiration alerts |
| **Parent Portal** | Parents log in and see only their child's balance, schedule, and compliance status |
| **Insights** | Analytics on collection rates, expense trends, budget burn |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7 |
| Styling | Tailwind CSS 3, Lucide React icons |
| Routing | React Router DOM v7 |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth — email/password + Google OAuth |
| Calendar parsing | ical.js |
| Calendar display | FullCalendar 6 |
| CSV import | csv-parse |

---

## User Roles

| Role | Scope | What they can do |
|---|---|---|
| `club_admin` | Club-wide | Everything — all teams, all users, all settings |
| `club_manager` | Club-wide | View-only across all teams |
| `team_manager` | One team | Full team operations + user/role management |
| `team_admin` | One team | Full operations, no user management |
| `treasurer` | One team | Ledger, budget, sponsors, fee waivers, insights |
| `scheduler` | One team | Edit schedule, view roster |
| `head_coach` | One team | View roster, schedule, and budget |
| `assistant_coach` | One team | View roster and schedule |
| *(no role)* | Own children | Parent portal — read-only |

Parents are detected automatically by matching their login email to guardian records on player profiles. No manual role assignment needed.

---

## Local Development

### Prerequisites

- Node.js 18+
- A Supabase project with the schema applied (see [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md))

### Setup

```bash
git clone <repo-url>
cd nola-dfc-manager
npm install
```

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

```bash
npm run dev
```

App runs at `http://localhost:5173`.

### Build & Deploy

```bash
npm run build    # outputs to dist/
npm run deploy   # deploys to GitHub Pages
```

---

## Project Structure

```
src/
├── App.jsx                    # Root: routing, auth, global state
├── supabase.js                # Supabase client initialization
│
├── hooks/
│   ├── useTeamContext.js      # Roles, permissions, team/club data
│   ├── useSoccerYear.js       # Season and team-season management
│   ├── useSchedule.js         # iCal fetch, event parsing, DB sync
│   ├── useFinance.js          # Fee calc, waterfall distribution
│   ├── usePlayerManager.js    # Player CRUD, waivers, buy-in flags
│   ├── useLedgerManager.js    # Transaction CRUD, bulk CSV import
│   └── useCategoryManager.js  # Custom transaction categories
│
├── services/
│   └── supabaseService.js     # All database operations (single file)
│
├── utils/
│   ├── roles.js               # Role definitions & permission matrix
│   ├── eventClassifier.js     # iCal event type classification
│   └── eventMatcher.js        # Event-to-transaction linking utilities
│
├── views/
│   ├── general/
│   │   ├── LoginView.jsx
│   │   └── PublicCalendarView.jsx
│   ├── team/
│   │   ├── TeamOverviewView.jsx   # Staff dashboard
│   │   ├── ParentView.jsx         # Parent portal
│   │   ├── ScheduleView.jsx       # Events + calendar
│   │   ├── FinanceView.jsx        # Finance hub container
│   │   ├── PeopleView.jsx         # People hub container
│   │   ├── InsightsView.jsx       # Analytics
│   │   ├── DocumentManager.jsx    # Document upload & verification
│   │   └── TeamSettingsView.jsx   # Admin: iCal URL, payment info
│   └── club/
│       ├── ClubDashboard.jsx
│       ├── ClubAdminHub.jsx
│       ├── TeamList.jsx
│       └── TeamOnboarding.jsx
│
└── components/
    ├── TransactionModal.jsx   # Add/edit transactions
    ├── PlayerFormModal.jsx    # Add/edit players
    ├── PlayerModal.jsx        # View player details & financials
    ├── ConfirmModal.jsx       # Generic confirmation dialog
    ├── CalendarView.jsx       # FullCalendar wrapper
    ├── Ledger.jsx             # Transaction table with filters
    └── ...
```

---

## Key Features In Depth

### Fee Calculation

Budget expenses are divided across the roster with a configurable buffer (default 5%), rounded up to the nearest $50:

```
base_fee = ceil((total_expenses × (1 + buffer%)) / roster_size / 50) × 50
```

Once a manager **finalizes** the budget, the `is_finalized` flag locks in `team_seasons`. The `player_financials` PostgreSQL view computes each player's remaining balance in real time from that point forward.

### Waterfall Distribution

When a fundraiser or sponsorship comes in, the Waterfall Engine distributes funds intelligently:

1. If the transaction is linked to a player, fill their remaining balance first
2. Split the remainder equally among eligible players (not waived, opted into fundraiser)
3. Iterate until funds are exhausted — players at $0 drop out of the pool
4. Any remainder goes to the team pool

All related transactions share a `waterfall_batch_id` for grouping and one-click revert.

### Schedule Sync

Teams configure an external `.ics` feed in Team Admin. The app:

- Parses and displays events live (no import needed to view)
- Classifies each event: `tournament`, `league`, `friendly`, `practice`, or `event`
- **Sync button** imports game events (tournaments, league, scrimmages — not practices) into the `team_events` database table
- Synced events appear as a dropdown in the transaction modal so ledger items can be linked to specific games

### Parent Portal

Parents sign up with the same email listed on their child's guardian record. The app detects them automatically (no admin action required) and shows only:

- Their child's balance and payment history
- The team schedule
- Their child's compliance status (medical release, ReePlayer account)
- Payment instructions (if the team admin has configured them)

---

## Database

The app uses Supabase (PostgreSQL). Key tables:

| Table | Purpose |
|---|---|
| `clubs` | Top-level organization |
| `teams` | Teams within a club (multi-team support) |
| `players` | Player profiles + compliance flags |
| `guardians` | Parent/guardian contact info per player |
| `seasons` | Global season definitions (e.g. "2025-2026") |
| `team_seasons` | Per-team budget, fees, finalization lock |
| `player_seasons` | Player enrollment per season + fee waiver |
| `transactions` | Full ledger — income, expenses, credits, transfers |
| `budget_items` | Budget line items per team per season |
| `documents` | Uploaded player documents with verification status |
| `user_roles` | Role assignments (club-level and team-level) |
| `blackouts` | Calendar blackout dates per team |
| `team_events` | Imported game events (synced from iCal) |
| `custom_categories` | Club-defined transaction categories |

**Views:**
- `player_financials` — Calculates each player's base fee, total paid, credits, and remaining balance (single source of truth)
- `seasonal_roster` — Players with their seasonal enrollment data joined

Full schema details: [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous (public) key |
#   n o l a - d f c - m a n a g e r  
 