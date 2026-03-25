# NOLA DFC Manager

A web application for managing youth soccer team operations — finances, rosters, schedules, compliance, documents, and parent communication — built for the NOLA DFC organization.

**Live:** [portal.noladfc2015boys.com](https://portal.noladfc2015boys.com)

---

## What It Does

NOLA DFC Manager replaces spreadsheets with a purpose-built tool that handles every aspect of running a competitive youth soccer team:

| Area                | What it manages                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Finance**         | Transaction ledger, seasonal budgets, automated fee calculation, fundraiser/sponsor waterfall distribution |
| **Roster**          | Player profiles, DOB/age groups, guardian contacts, jersey numbers, fee waivers, bulk CSV import           |
| **Schedule**        | Live iCal sync (Ollie Sports, TeamSnap, Google Calendar), event classification, blackout dates             |
| **Compliance**      | Medical release forms (PDF template-based), document tracking per player                                   |
| **Documents**       | Upload, verify, and track player documents with expiration alerts                                          |
| **Parent Portal**   | Parents log in and see only their child's balance, schedule, and compliance status                         |
| **Insights**        | Analytics on collection rates, expense trends, budget burn                                                 |
| **Budget Forecast** | Internal statistical model that learns from historical data to project future budgets                      |
| **Changelog**       | AI-generated release notes from git commits, stored in Supabase                                            |

---

## Tech Stack

| Layer            | Technology                                         |
| ---------------- | -------------------------------------------------- |
| Frontend         | React 19, Vite 7, BrowserRouter                    |
| UI Components    | shadcn/ui (Radix + Tailwind), Lucide React icons   |
| Styling          | Tailwind CSS 3 with dark mode (class-based)        |
| Backend / DB     | Supabase (PostgreSQL)                              |
| Auth             | Supabase Auth — email/password + Google OAuth      |
| i18n             | English + Spanish (custom context + dot-path keys) |
| Calendar parsing | ical.js                                            |
| Calendar display | FullCalendar 6                                     |
| PDF generation   | pdf-lib, jspdf                                     |
| CSV import       | csv-parse                                          |
| Deployment       | Vercel (auto-deploy on push to main)               |
| Testing          | Playwright (E2E, 30 tests), Vitest (unit)          |
| Code Quality     | ESLint 9, Prettier, Husky + lint-staged            |
| AI Changelog     | Groq (Llama 3.3 70B) — free tier                   |

---

## User Roles

| Role              | Scope        | What they can do                                |
| ----------------- | ------------ | ----------------------------------------------- |
| `club_admin`      | Club-wide    | Everything — all teams, all users, all settings |
| `club_manager`    | Club-wide    | View-only across all teams                      |
| `team_manager`    | One team     | Full team operations + user/role management     |
| `team_admin`      | One team     | Full operations, no user management             |
| `treasurer`       | One team     | Ledger, budget, sponsors, fee waivers, insights |
| `scheduler`       | One team     | Edit schedule, view roster                      |
| `head_coach`      | One team     | View roster, schedule, and budget               |
| `assistant_coach` | One team     | View roster and schedule                        |
| _(no role)_       | Own children | Parent portal — read-only                       |

Parents are detected automatically by matching their login email to guardian records on player profiles. No manual role assignment needed.

---

## Local Development

### Prerequisites

- Node.js 20+
- A Supabase project with the schema applied (see [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md))

### Setup

```bash
git clone https://github.com/trantechsolutions/nola-dfc-manager.git
cd nola-dfc-manager
npm install
```

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GROQ_API_KEY=your-groq-key              # optional, enables AI changelog
E2E_TEST_EMAIL=test@example.com          # optional, for E2E tests
E2E_TEST_PASSWORD=TestPassword123!       # optional, for E2E tests
```

```bash
npm run dev
```

App runs at `http://localhost:5173`.

### Available Scripts

```bash
npm run dev              # Start dev server
npm run build            # Production build (outputs to dist/)
npm run preview          # Preview production build locally
npm run lint             # ESLint check
npm run format           # Prettier format all files
npm run format:check     # Prettier check (no write)
npm test                 # Vitest unit tests (watch mode)
npm run test:coverage    # Unit test coverage report
npm run test:e2e         # Playwright E2E tests (all browsers)
npm run test:e2e:chromium # E2E chromium only
npm run test:e2e:headed  # E2E with visible browser
npm run test:e2e:ui      # Playwright UI mode
```

---

## Project Structure

```
src/
├── App.jsx                      # Root: routing, auth, global state, navigation
├── supabase.js                  # Supabase client initialization
├── main.jsx                     # Entry point (BrowserRouter, ThemeProvider, I18nProvider)
│
├── hooks/
│   ├── useTeamContext.js        # Roles, permissions, team/club data
│   ├── useSoccerYear.js         # Season and team-season management
│   ├── useSchedule.js           # iCal fetch, event parsing, DB sync
│   ├── useFinance.js            # Fee calc, waterfall distribution
│   ├── usePlayerManager.js      # Player CRUD, waivers, buy-in flags
│   ├── useLedgerManager.js      # Transaction CRUD, bulk CSV import
│   ├── useCategoryManager.js    # Custom transaction categories
│   └── useBudgetForecast.js     # Statistical budget forecasting
│
├── services/
│   └── supabaseService.js       # All database operations (single file)
│
├── utils/
│   ├── roles.js                 # Role definitions & permission matrix
│   ├── ageGroup.js              # US Soccer age group calculation
│   ├── budgetModel.js           # Forecast engine (regression, weighted avg)
│   ├── constants.js             # Doc types, categories, payment methods
│   ├── seasonUtils.js           # Season date ranges (Aug 1 - Jul 31)
│   ├── eventClassifier.js       # iCal event type classification
│   ├── eventMatcher.js          # Event-to-transaction linking
│   └── generateMedicalPdf.js    # Medical release PDF generation
│
├── i18n/
│   ├── I18nContext.jsx          # i18n provider + useT() hook
│   ├── en.js                    # English translations
│   └── es.js                    # Spanish translations
│
├── theme/
│   └── ThemeContext.jsx         # Theme provider (light/dark/system)
│
├── lib/
│   └── utils.js                 # shadcn/ui utility (cn function)
│
├── views/
│   ├── general/
│   │   ├── LoginView.jsx
│   │   └── PublicCalendarView.jsx
│   ├── team/
│   │   ├── TeamOverviewView.jsx    # Staff dashboard (Overview, Roster, Accounts)
│   │   ├── ParentView.jsx          # Parent portal
│   │   ├── ScheduleView.jsx        # Events + calendar
│   │   ├── FinanceView.jsx         # Finance hub (routes to Budget/Ledger/Fundraising)
│   │   ├── BudgetView.jsx          # Budget management + forecast
│   │   ├── LedgerView.jsx          # Transaction ledger
│   │   ├── SponsorsView.jsx        # Fundraiser waterfall distribution
│   │   ├── PeopleView.jsx          # People hub (Roster, Documents, Permissions)
│   │   ├── RosterManagement.jsx    # Player roster management
│   │   ├── DocumentManager.jsx     # Document upload & compliance
│   │   ├── TeamUserManagement.jsx  # Team role assignments
│   │   ├── InsightsView.jsx        # Analytics + AI chat
│   │   └── TeamSettingsView.jsx    # Admin: iCal URL, payment info
│   └── club/
│       ├── ClubDashboard.jsx       # Club-wide overview
│       ├── ClubAdminHub.jsx        # Users, Settings, Categories tabs
│       ├── TeamList.jsx            # Team management + tier editing
│       ├── TeamOnboarding.jsx      # New team wizard
│       ├── UserManagement.jsx      # Staff directory + invitations
│       ├── ClubSettings.jsx        # Club name, roles
│       ├── CategoryManagementView.jsx  # Custom transaction categories
│       └── ClubCalendarView.jsx    # Club-wide calendar
│
├── components/
│   ├── TransactionModal.jsx     # Add/edit transactions
│   ├── PlayerFormModal.jsx      # Add/edit players (with DOB)
│   ├── PlayerModal.jsx          # View player details & financials
│   ├── ConfirmModal.jsx         # Generic confirmation dialog
│   ├── MedicalReleaseForm.jsx   # Medical release PDF form
│   ├── CalendarView.jsx         # FullCalendar wrapper
│   ├── Ledger.jsx               # Transaction table with filters
│   ├── Schedule.jsx             # Event list/card display
│   ├── CategoryManager.jsx      # Category CRUD
│   ├── EventExpenseModal.jsx    # Link expenses to events
│   ├── BulkUploadModal.jsx      # CSV player import
│   ├── BulkUploadLedgerModal.jsx # CSV transaction import
│   ├── SeasonPicker.jsx         # Reusable season dropdown
│   ├── TabContainer.jsx         # URL-synced tab navigation
│   ├── JerseyBadge.jsx          # Player jersey number badge
│   ├── Changelog.jsx            # Update log with AI summaries
│   └── ui/                      # shadcn/ui components (18 total)
│       ├── button.jsx, card.jsx, dialog.jsx, tabs.jsx, input.jsx,
│       ├── select.jsx, badge.jsx, table.jsx, dropdown-menu.jsx,
│       ├── alert.jsx, progress.jsx, label.jsx, switch.jsx,
│       ├── textarea.jsx, separator.jsx, tooltip.jsx, sheet.jsx
│       └── ...
│
├── __tests__/                   # Vitest unit tests
│   ├── hooks/useFinance.test.js
│   └── utils/
│       ├── budgetModel.test.js
│       ├── eventClassifier.test.js
│       └── roles.test.js
│
├── scripts/
│   └── generate-changelog.js    # Post-commit AI changelog (Groq)
│
└── tests/e2e/                   # Playwright E2E tests (30 tests)
    ├── auth.spec.js
    ├── dashboard.spec.js
    ├── finance.spec.js
    ├── parent-view.spec.js
    ├── roster.spec.js
    ├── theme-locale.spec.js
    ├── global-setup.js          # Seeds test data
    ├── global-teardown.js       # Cleans up test data
    └── helpers/
        ├── auth.js              # Login helper
        ├── seed.js              # Test data factory
        └── supabaseAdmin.js     # Service-role client
```

---

## Key Features In Depth

### Fee Calculation

Budget expenses are divided across the roster with a configurable buffer (default 5%), rounded up to the nearest $50:

```
base_fee = ceil((total_expenses * (1 + buffer%) / roster_size / 50) * 50
```

Once a manager **finalizes** the budget, the `is_finalized` flag locks in `team_seasons`. The `player_financials` PostgreSQL view computes each player's remaining balance in real time.

### Waterfall Distribution

When a fundraiser or sponsorship comes in, the Waterfall Engine distributes funds:

1. If linked to a player, fill their remaining balance first
2. Split the remainder equally among eligible players (not waived, opted into fundraiser)
3. Iterate until funds are exhausted — players at $0 drop out of the pool
4. Any remainder goes to the team pool

All related transactions share a `waterfall_batch_id` for grouping and one-click revert.

### Budget Forecast

An internal statistical engine (no external AI) that learns from historical budget data:

- Weighted moving average across seasons
- Per-category linear regression for trend detection
- Roster-normalized cost projections
- Works with 1+ seasons of data
- Self-calibrating accuracy scoring

### Schedule Sync

Teams configure an external `.ics` feed. The app:

- Parses and displays events live (no import needed to view)
- Classifies events: `tournament`, `league`, `friendly`, `practice`
- **Sync button** imports game events to the DB for transaction linking
- Season-scoped: events filtered by date range (Aug 1 - Jul 31)

### Dark Mode & i18n

- Three theme modes: light, dark, system (OS preference)
- Full English and Spanish translations
- Both persisted to localStorage
- Accessible from sidebar settings panel and mobile header

### AI Changelog

Every git commit automatically generates a user-friendly changelog:

1. Post-commit hook reads new commits
2. Sends to Groq (Llama 3.3 70B, free tier)
3. AI categorizes changes: features, improvements, bug fixes, UI/UX
4. Stores in Supabase `changelogs` table
5. Update Log page shows AI summary cards + raw commit history

---

## Database

15 tables + 2 views on Supabase (PostgreSQL):

| Table               | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `clubs`             | Top-level organization                             |
| `teams`             | Teams within a club (multi-team support)           |
| `players`           | Player profiles, DOB, compliance flags             |
| `guardians`         | Parent/guardian contact info per player            |
| `seasons`           | Global season definitions (e.g. "2025-2026")       |
| `team_seasons`      | Per-team budget, fees, finalization lock           |
| `player_seasons`    | Player enrollment per season + fee waiver          |
| `transactions`      | Full ledger — income, expenses, credits, transfers |
| `budget_items`      | Budget line items per team per season              |
| `documents`         | Uploaded player documents with verification status |
| `medical_forms`     | Medical release form data (JSON)                   |
| `user_profiles`     | User display names, emails                         |
| `user_roles`        | Role assignments (club-level and team-level)       |
| `blackouts`         | Calendar blackout dates per team                   |
| `team_events`       | Imported game events (synced from iCal)            |
| `custom_categories` | Club-defined transaction categories                |
| `changelogs`        | Git commit history + AI summaries                  |

**Views:**

- `player_financials` — Calculates each player's base fee, total paid, credits, and remaining balance
- `seasonal_roster` — Players with their seasonal enrollment data joined

Full schema details: [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)

---

## Environment Variables

| Variable                    | Required            | Description                          |
| --------------------------- | ------------------- | ------------------------------------ |
| `VITE_SUPABASE_URL`         | Yes                 | Supabase project URL                 |
| `VITE_SUPABASE_ANON_KEY`    | Yes                 | Supabase anonymous (public) key      |
| `SUPABASE_SERVICE_ROLE_KEY` | For tests/changelog | Service role key (bypasses RLS)      |
| `GROQ_API_KEY`              | Optional            | Groq API key for AI changelog (free) |
| `E2E_TEST_EMAIL`            | For E2E tests       | Test user email                      |
| `E2E_TEST_PASSWORD`         | For E2E tests       | Test user password                   |

---

## Deployment

The app deploys to **Vercel** automatically on every push to `main`. Preview deployments are created for every pull request.

**Custom domain:** `portal.noladfc2015boys.com`

Vercel environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) must be set in the Vercel dashboard.

---

## Documentation

Full technical documentation: [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)

Covers architecture, database schema, role/permission matrix, hooks reference, service layer API, feature workflows, theming, i18n, testing, deployment, and SQL migrations.
