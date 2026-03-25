# NOLA DFC Manager — Technical Documentation

> Full reference for developers working on this codebase.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication & Session Management](#2-authentication--session-management)
3. [Role & Permission System](#3-role--permission-system)
4. [Database Schema](#4-database-schema)
5. [Routes & Views](#5-routes--views)
6. [Hooks Reference](#6-hooks-reference)
7. [Service Layer](#7-service-layer)
8. [Feature Workflows](#8-feature-workflows)
9. [Data Flow](#9-data-flow)
10. [Architectural Decisions](#10-architectural-decisions)
11. [Theming & Internationalization](#11-theming--internationalization)
12. [UI Component Library (shadcn/ui)](#12-ui-component-library-shadcnui)
13. [Budget Forecast Engine](#13-budget-forecast-engine)
14. [Changelog System](#14-changelog-system)
15. [Deployment & Infrastructure](#15-deployment--infrastructure)
16. [Testing](#16-testing)
17. [Code Quality & Git Hooks](#17-code-quality--git-hooks)
18. [SQL Migrations](#18-sql-migrations)

---

## 1. Architecture Overview

```
Browser
  └── React 19 SPA (Vite + BrowserRouter)
        ├── React Router v7 — client-side routing
        ├── Hooks — all business logic (no Redux/Zustand)
        ├── shadcn/ui + Tailwind CSS — component library
        ├── ThemeContext — light/dark/system toggle
        ├── I18nContext — English/Spanish locale
        ├── supabaseService.js — all DB I/O in one file
        └── Supabase Client (@supabase/supabase-js v2)
              └── PostgreSQL (Supabase cloud)

Deployment
  └── Vercel (auto-deploy on push to main)
        ├── SPA rewrite: all routes → index.html
        └── Preview deploys per PR

Dev Tooling
  └── Husky Hooks
        ├── pre-commit: lint-staged (ESLint + Prettier)
        └── post-commit: AI changelog → Supabase (Groq/Llama 3.3)
```

**No server-side code.** The app is a pure client-side SPA talking directly to Supabase via the JavaScript SDK. All authorization is enforced in the frontend via the permission system (see [Section 3](#3-role--permission-system)).

**State management** is React hooks only — no Redux, no Zustand. Each hook owns a slice of state and exposes handlers. `App.jsx` orchestrates the top-level state and passes data down as props.

---

## 2. Authentication & Session Management

### Providers

- Email + password (Supabase Auth)
- Google OAuth

### Session Lifecycle

```
User submits login form
  → supabase.auth.signInWithPassword()
  → onAuthStateChange fires: event = 'SIGNED_IN'
  → setUser(session.user)
  → fetchData() called
  → App renders with data

Token refresh (every ~60 min)
  → onAuthStateChange fires: event = 'TOKEN_REFRESHED'
  → IGNORED — no state change, no reload
  → This prevents the "random page refresh" bug

User logs out
  → supabase.auth.signOut()
  → onAuthStateChange fires: event = 'SIGNED_OUT'
  → setUser(null), loading = false
  → App renders LoginView
```

**Critical:** The handler only reacts to `SIGNED_IN` and `SIGNED_OUT`. `TOKEN_REFRESHED`, `INITIAL_SESSION`, and `USER_UPDATED` are intentionally ignored to prevent data reloads during a live session.

### User Profile

On first login, `supabaseService.ensureUserProfile(user)` upserts a row in `user_profiles` keyed by `user.id`.

---

## 3. Role & Permission System

### Files

- `src/utils/roles.js` — role definitions and `PERMISSIONS` constants
- `src/hooks/useTeamContext.js` — `can(permission)` helper and role resolution

### Role Hierarchy

**Club-level roles** apply across all teams in the club:

| Role           | Description                            |
| -------------- | -------------------------------------- |
| `club_admin`   | Superuser — all permissions everywhere |
| `club_manager` | Read-only across all teams             |

**Team-level roles** are scoped to a specific `team_id`:

| Role              | Description                                 |
| ----------------- | ------------------------------------------- |
| `team_manager`    | Full operations + user management           |
| `team_admin`      | Full operations, no user management         |
| `treasurer`       | Ledger, budget, sponsors, waivers, insights |
| `scheduler`       | Edit schedule, view roster                  |
| `head_coach`      | View roster, schedule, budget               |
| `assistant_coach` | View roster and schedule                    |

### Permission Constants (`PERMISSIONS`)

```js
// Club
CLUB_SETTINGS; // Edit club name, branding
CLUB_MANAGE_TEAMS; // Create, archive teams
CLUB_MANAGE_ROLES; // Assign roles to any user
CLUB_VIEW_FINANCIALS; // Club-wide dashboard
CLUB_VIEW_ANY_TEAM; // Browse into any team

// Team
TEAM_VIEW_ROSTER; // See player list
TEAM_EDIT_ROSTER; // Add, edit, archive players
TEAM_VIEW_SCHEDULE; // See schedule
TEAM_EDIT_SCHEDULE; // Edit schedule, blackouts, iCal URL
TEAM_VIEW_BUDGET; // See budget and fees
TEAM_EDIT_BUDGET; // Edit budget, finalize
TEAM_VIEW_LEDGER; // See transactions
TEAM_EDIT_LEDGER; // Add, edit, delete transactions
TEAM_VIEW_SPONSORS; // See fundraiser/sponsor distributions
TEAM_EDIT_SPONSORS; // Trigger waterfall distribution
TEAM_VIEW_INSIGHTS; // Analytics tab
TEAM_MANAGE_WAIVERS; // Toggle fee waivers
TEAM_MANAGE_USERS; // Assign team-level roles
```

### Checking Permissions

```jsx
const { can, PERMISSIONS } = useTeamContext(user);

// In JSX
{
  can(PERMISSIONS.TEAM_EDIT_LEDGER) && <button onClick={addTx}>Add Transaction</button>;
}

// In logic
if (can(PERMISSIONS.TEAM_MANAGE_WAIVERS)) {
  await handleToggleWaiveFee(playerId, season, state);
}
```

The `can()` function checks the user's roles against the current team context. Club admins pass all checks.

### Parent Detection

Users with **zero roles** are treated as parents. Their team is derived at runtime:

```js
// Find a player whose guardian email matches the logged-in user
const myPlayer = players.find(
  (p) => p.guardians?.some((g) => g.email?.toLowerCase() === user.email.toLowerCase()) && p.teamId,
);
const parentTeamId = myPlayer?.teamId || null;
```

No `user_roles` row is created for parents.

---

## 4. Database Schema

### Tables

#### `clubs`

| Column       | Type        | Notes                  |
| ------------ | ----------- | ---------------------- |
| `id`         | uuid PK     |                        |
| `name`       | text        |                        |
| `slug`       | text        | URL-safe identifier    |
| `logo_url`   | text        |                        |
| `settings`   | jsonb       | Extensible config blob |
| `created_at` | timestamptz |                        |

#### `teams`

| Column            | Type            | Notes                                 |
| ----------------- | --------------- | ------------------------------------- |
| `id`              | uuid PK         |                                       |
| `club_id`         | uuid FK → clubs |                                       |
| `name`            | text            |                                       |
| `age_group`       | text            | e.g. "U12"                            |
| `gender`          | text            |                                       |
| `tier`            | text            |                                       |
| `ical_url`        | text            | External .ics feed URL                |
| `payment_info`    | text            | Payment instructions shown to parents |
| `color_primary`   | text            | Hex color                             |
| `color_secondary` | text            | Hex color                             |
| `status`          | text            | active / archived                     |

#### `players`

| Column             | Type            | Notes                                        |
| ------------------ | --------------- | -------------------------------------------- |
| `id`               | uuid PK         |                                              |
| `first_name`       | text            |                                              |
| `last_name`        | text            |                                              |
| `jersey_number`    | text            |                                              |
| `birthdate`        | date            | Used for US Soccer age group calculation     |
| `status`           | text            | active / archived                            |
| `medical_release`  | boolean         | On-file flag (auto-set by document workflow) |
| `reeplayer_waiver` | boolean         | Has ReePlayer account                        |
| `club_id`          | uuid FK → clubs |                                              |
| `team_id`          | uuid FK → teams |                                              |

#### `guardians`

| Column      | Type              | Notes                            |
| ----------- | ----------------- | -------------------------------- |
| `id`        | uuid PK           |                                  |
| `player_id` | uuid FK → players |                                  |
| `name`      | text              |                                  |
| `email`     | text              | Used for parent portal detection |
| `phone`     | text              |                                  |

#### `seasons`

Global season reference (shared across all clubs).

| Column       | Type        | Notes            |
| ------------ | ----------- | ---------------- |
| `id`         | text PK     | e.g. "2025-2026" |
| `name`       | text        | Display name     |
| `created_at` | timestamptz |                  |

#### `team_seasons`

Per-team, per-season budget authority. **This is the source of truth for fees and finalization.**

| Column                     | Type              | Notes                                   |
| -------------------------- | ----------------- | --------------------------------------- |
| `id`                       | uuid PK           |                                         |
| `team_id`                  | uuid FK → teams   |                                         |
| `season_id`                | text FK → seasons |                                         |
| `is_finalized`             | boolean           | Lock flag — budget immutable after true |
| `base_fee`                 | numeric           | Calculated per-player fee               |
| `buffer_percent`           | numeric           | Contingency % (default 5)               |
| `expected_roster_size`     | integer           | Used in fee calculation                 |
| `total_projected_expenses` | numeric           | Sum of budget_items                     |
| `total_projected_income`   | numeric           | Sum of budget income lines              |

#### `player_seasons`

Links a player to a season (enrollment). One row per player per season.

| Column             | Type                   | Notes                                 |
| ------------------ | ---------------------- | ------------------------------------- |
| `id`               | uuid PK                |                                       |
| `player_id`        | uuid FK → players      |                                       |
| `season_id`        | text FK → seasons      |                                       |
| `team_season_id`   | uuid FK → team_seasons | Links to team budget                  |
| `fee_waived`       | boolean                | Waived players: base_fee forced to $0 |
| `fundraiser_buyin` | boolean                | Eligible for pool distribution        |
| `status`           | text                   | active / archived                     |

#### `transactions`

Full financial ledger.

| Column               | Type                   | Notes                                             |
| -------------------- | ---------------------- | ------------------------------------------------- |
| `id`                 | uuid PK                |                                                   |
| `season_id`          | text FK → seasons      |                                                   |
| `team_season_id`     | uuid FK → team_seasons | Team scope                                        |
| `player_id`          | uuid FK → players      | Null = team-level transaction                     |
| `event_id`           | uuid FK → team_events  | Optional event link                               |
| `date`               | date                   |                                                   |
| `amount`             | numeric                | Positive = income, negative = expense             |
| `category`           | text                   | TMF, FUN, SPO, OPE, TOU, LEA, CRE, TRF, or custom |
| `title`              | text                   |                                                   |
| `type`               | text                   | Venmo, Zelle, Cash, Check, ACH, Zeffy             |
| `notes`              | text                   |                                                   |
| `cleared`            | boolean                | Only cleared TMF counts toward player balances    |
| `distributed`        | boolean                | True after waterfall distribution                 |
| `waterfall_batch_id` | text                   | Groups all transactions from one distribution     |
| `original_tx_id`     | uuid FK → transactions | Links distribution back to source                 |
| `transfer_from`      | text                   | For TRF category                                  |
| `transfer_to`        | text                   | For TRF category                                  |

**Built-in categories:**

| Code | Label                     | Flow                     |
| ---- | ------------------------- | ------------------------ |
| TMF  | Team Fees                 | Income (player payments) |
| FUN  | Fundraising               | Income                   |
| SPO  | Sponsorship               | Income                   |
| OPE  | Operating                 | Expense                  |
| TOU  | Tournament                | Expense                  |
| LEA  | League/Refs               | Expense                  |
| FRI  | Friendlies                | Expense                  |
| CRE  | Player Credit/Discount    | Special                  |
| TRF  | Transfer Between Accounts | Special                  |

#### `budget_items`

Line items within a team's seasonal budget.

| Column            | Type                   | Notes                          |
| ----------------- | ---------------------- | ------------------------------ |
| `id`              | uuid PK                |                                |
| `season_id`       | text FK → seasons      |                                |
| `team_season_id`  | uuid FK → team_seasons |                                |
| `category`        | text                   | Expense category code          |
| `label`           | text                   | Display name                   |
| `income`          | numeric                | Projected income for this line |
| `expenses_fall`   | numeric                | Fall semester expenses         |
| `expenses_spring` | numeric                | Spring semester expenses       |

#### `documents`

Uploaded player compliance documents.

| Column                     | Type                 | Notes                                    |
| -------------------------- | -------------------- | ---------------------------------------- |
| `id`                       | uuid PK              |                                          |
| `player_id`                | uuid FK → players    |                                          |
| `team_id`                  | uuid FK → teams      |                                          |
| `club_id`                  | uuid FK → clubs      |                                          |
| `season_id`                | text FK → seasons    |                                          |
| `doc_type`                 | text                 | medical_release, insurance, waiver, etc. |
| `title`                    | text                 |                                          |
| `file_name`                | text                 |                                          |
| `file_path`                | text                 | Supabase Storage path                    |
| `mime_type`                | text                 |                                          |
| `file_size`                | integer              | Bytes                                    |
| `status`                   | text                 | uploaded / verified                      |
| `verified_by`              | uuid FK → auth.users |                                          |
| `verified_at`              | timestamptz          |                                          |
| `expires_at`               | timestamptz          |                                          |
| `uploaded_by`              | uuid FK → auth.users |                                          |
| `created_at`, `updated_at` | timestamptz          |                                          |

**Document workflow for `medical_release`:**

- When a `medical_release` doc is uploaded or verified → `players.medical_release = true`
- When a `medical_release` doc is rejected or deleted with no remaining valid docs → `players.medical_release = false`
- `reeplayer_waiver` is a manual toggle only (not document-driven)

#### `user_profiles`

| Column         | Type                 | Notes |
| -------------- | -------------------- | ----- |
| `id`           | uuid PK              |       |
| `user_id`      | uuid FK → auth.users |       |
| `display_name` | text                 |       |
| `email`        | text                 |       |
| `phone`        | text                 |       |
| `is_active`    | boolean              |       |
| `last_login`   | timestamptz          |       |

#### `user_roles`

| Column       | Type                 | Notes                    |
| ------------ | -------------------- | ------------------------ |
| `id`         | uuid PK              |                          |
| `user_id`    | uuid FK → auth.users |                          |
| `role`       | text                 | Role name                |
| `club_id`    | uuid FK → clubs      | Set for club-level roles |
| `team_id`    | uuid FK → teams      | Set for team-level roles |
| `created_at` | timestamptz          |                          |

#### `blackouts`

| Column        | Type            | Notes                 |
| ------------- | --------------- | --------------------- |
| `date_str`    | text PK         | ISO date "YYYY-MM-DD" |
| `is_blackout` | boolean         |                       |
| `team_id`     | uuid FK → teams |                       |

#### `team_events`

Game events imported from the team's iCal feed. Only `tournament`, `league`, and `friendly` event types are stored (practices excluded).

| Column                     | Type             | Notes                                   |
| -------------------------- | ---------------- | --------------------------------------- |
| `id`                       | uuid PK          |                                         |
| `team_id`                  | uuid FK → teams  |                                         |
| `uid`                      | text             | iCal UID — unique per event in the feed |
| `title`                    | text             |                                         |
| `description`              | text             |                                         |
| `location`                 | text             |                                         |
| `event_date`               | timestamptz      |                                         |
| `event_type`               | text             | tournament / league / friendly          |
| `is_cancelled`             | boolean          |                                         |
| `created_at`, `updated_at` | timestamptz      |                                         |
| **UNIQUE**                 | `(team_id, uid)` | Re-syncing is safe (upsert)             |

#### `custom_categories`

Club-defined additional transaction categories.

| Column        | Type            | Notes                           |
| ------------- | --------------- | ------------------------------- |
| `id`          | uuid PK         |                                 |
| `club_id`     | uuid FK → clubs |                                 |
| `code`        | text            | 2-5 uppercase chars, e.g. "EVT" |
| `label`       | text            | Display name                    |
| `description` | text            |                                 |
| `color`       | text            | Tailwind color class            |
| `flow`        | text            | income / expense / special      |
| `sort_order`  | integer         | Display order                   |

### Views

#### `player_financials`

The single source of truth for player balance calculation. Never compute balances in the frontend — read this view.

```sql
-- Calculated columns per player per team_season:
base_fee           -- From team_seasons (locked after finalization)
total_paid         -- Sum of cleared TMF transactions for this player
fundraising        -- Sum of FUN credits distributed to this player
sponsorships       -- Sum of SPO credits distributed to this player
credits            -- Sum of CRE credits
remaining_balance  -- base_fee - total_paid - fundraising - sponsorships - credits
fee_waived         -- From player_seasons; forces base_fee = 0 when true
```

#### `seasonal_roster`

Players joined with their `player_seasons` enrollment data. Useful for roster displays that need both player info and season status in one query.

---

## 5. Routes & Views

### Public (no auth required)

| Path                 | Component            | Notes                   |
| -------------------- | -------------------- | ----------------------- |
| `/login`             | `LoginView`          | Email/password + Google |
| `/calendar/:teamId?` | `PublicCalendarView` | Read-only team calendar |

### Authenticated — Season-Scoped (sidebar SEASON section)

| Path                       | Who sees it             | Component                                                         |
| -------------------------- | ----------------------- | ----------------------------------------------------------------- |
| `/dashboard`               | Staff                   | `TeamOverviewView` (tabs: Overview, Roster, Accounts, Compliance) |
| `/dashboard`               | Parents                 | `ParentView`                                                      |
| `/finance?tab=budget`      | Staff with budget perm  | `FinanceView` → `BudgetView`                                      |
| `/finance?tab=ledger`      | Staff with ledger perm  | `FinanceView` → `LedgerView`                                      |
| `/finance?tab=fundraising` | Staff with sponsor perm | `FinanceView` → `SponsorsView`                                    |

### Authenticated — Team-Wide (sidebar TEAM section)

| Path          | Who sees it                  | Component                                           |
| ------------- | ---------------------------- | --------------------------------------------------- |
| `/schedule`   | All                          | `ScheduleView` (tabs: Upcoming, Past, Calendar)     |
| `/people`     | Staff with roster/user perms | `PeopleView` (tabs: Roster, Documents, Permissions) |
| `/insights`   | Staff with insights perm     | `InsightsView`                                      |
| `/team-admin` | `TEAM_EDIT_SCHEDULE` only    | `TeamSettingsView`                                  |

### Authenticated — Club-Level (sidebar CLUB section, club_admin only)

| Path             | Who sees it | Component                                          |
| ---------------- | ----------- | -------------------------------------------------- |
| `/club-overview` | Club admins | `ClubDashboard`                                    |
| `/club-teams`    | Club admins | `TeamList`                                         |
| `/club-admin`    | Club admins | `ClubAdminHub` (tabs: Users, Settings, Categories) |
| `/club-onboard`  | Club admins | `TeamOnboarding`                                   |

### Authenticated — Settings

| Path         | Who sees it | Component                                            |
| ------------ | ----------- | ---------------------------------------------------- |
| `/changelog` | All         | `Changelog` (update log with AI-generated summaries) |

### Navigation Layout

**Desktop:** Fixed left sidebar with collapsible settings panel (theme, locale, logout, update log).

**Mobile:** Top header with globe/theme/logout icons + hamburger menu slide-out. Bottom nav bar with 5 items: Overview, Ledger, [+] (add transaction), Players, Schedule.

---

## 6. Hooks Reference

### `useTeamContext(user)`

Central context hook. Loads roles, club, teams, and exposes the permission checker.

```js
const {
  userRoles, // [{ role, clubId, teamId, userId }]
  club, // Current club object
  teams, // Accessible teams for this user
  selectedTeamId, // Currently active team
  setSelectedTeamId, // Switch teams
  selectedTeam, // Full team object for selectedTeamId
  effectiveRole, // Highest role string for display
  isStaff, // true if user has any role
  isClubAdmin, // true if user has club-level role
  can, // (permission: string) => boolean
  PERMISSIONS, // Re-exported permission constants
  refreshContext, // Re-fetch roles/teams
  loading,
} = useTeamContext(user);
```

Selected team is persisted to `localStorage`. Roles are fetched once on login and on `refreshContext()` calls.

---

### `useSoccerYear(user, teamId)`

Manages season selection and team-season budget data.

```js
const {
  seasons, // Global seasons list
  teamSeasons, // team_seasons rows for this team
  selectedSeason, // Currently selected season ID
  setSelectedSeason,
  currentSeasonData, // Merged season + team_season for selectedSeason
  currentTeamSeason, // Raw team_seasons row (source of truth for finalization)
  refreshSeasons,
} = useSoccerYear(user, teamId);
```

`currentSeasonData` merges global season metadata with the team-specific budget data. If no `team_seasons` row exists for the selected season, the team has not created a budget yet.

---

### `useSchedule(user, team)`

Fetches and parses the team's iCal feed. Manages blackouts. Provides DB sync for game events.

```js
const {
  events, // { upcoming: [], past: [] } — sorted by date
  blackoutDates, // ['2025-10-15', ...]
  toggleBlackout, // (dateStr) => void
  syncCalendar, // async () => count — syncs games to team_events table
  refreshSchedule, // Re-fetch iCal
  loading,
} = useSchedule(user, team);
```

`syncCalendar()` fetches the iCal, parses all events, filters to `tournament`/`league`/`friendly` types only, then upserts to `team_events` using `(team_id, uid)` as the conflict key. Safe to run repeatedly.

---

### `useFinance(selectedSeason, seasonalPlayers, isBudgetLocked, teamSeasonId, currentSeasonData, playerFinancialsMap)`

Fee calculation and waterfall distribution.

```js
const {
  calculatePlayerFinancials, // (player, transactions) => { baseFee, totalPaid, ... }
  handleWaterfallCredit,     // async (amount, title, sourcePlayerId, originalTxId, category) => batchId
  revertWaterfall,           // async (batchId, originalTxId) => void
} = useFinance(...);
```

`calculatePlayerFinancials` is used for display in modals. It reads from the pre-fetched `playerFinancialsMap` (which comes from the `player_financials` view). The waterfall functions hit the DB directly.

---

### `usePlayerManager(refreshData, clubId, teamId)`

Player CRUD and compliance toggles.

```js
const {
  handleSavePlayer, // async (playerData) => void
  handleArchivePlayer, // async (playerId) => void
  handleToggleWaiveFee, // async (playerId, season, currentState) => void
  handleToggleFundraiserBuyIn, // async (playerId, season, currentState) => void
} = usePlayerManager(refreshData, clubId, teamId);
```

New players are automatically scoped to the current `clubId` and `teamId`. Archive sets `status = 'archived'` rather than deleting. Fee waiver and fundraiser buy-in write to `player_seasons`.

---

### `useLedgerManager(refreshData, selectedSeason, teamSeasonId)`

Transaction CRUD and bulk import.

```js
const {
  handleSaveTransaction, // async (txData) => { success, error? }
  handleDeleteTransaction, // async (txId) => void
  handleBulkUpload,      // async (txns) => { success, error? }
} = useLedgerManager(...);
```

`handleSaveTransaction` auto-attaches `seasonId` and `teamSeasonId`. Handles both add and edit (presence of `txData.id` determines which). Bulk upload runs all inserts in a single `Promise.all`.

---

### `useCategoryManager(clubId)`

Merges system categories with club-defined custom categories.

```js
const {
  customCategories, // Raw custom category rows
  categoryLabels, // { TMF: 'Team Fees', EVT: 'Events', ... }
  categoryColors, // { TMF: 'bg-blue-50 text-blue-700', ... }
  categoryOptions, // Full array for <select> dropdowns
  saveCategory, // async (catData) => void
  deleteCategory, // async (catId) => void
  isSaving,
} = useCategoryManager(clubId);
```

System categories (TMF, FUN, SPO, etc.) are hardcoded defaults and cannot be deleted. Custom categories are stored in the `custom_categories` table and merged at runtime.

---

### `useBudgetForecast(teamSeasons, transactions, players)`

Internal budget forecasting engine — no external AI dependencies.

```js
const {
  forecast, // { categories: [...], totalIncome, totalExpense, perPlayer, confidence }
  accuracy, // { score, predictions[] } — backtesting results
  isReady, // true when enough data exists
  seasonCount, // Number of historical seasons analyzed
} = useBudgetForecast(teamSeasons, transactions, players);
```

The underlying model (`src/utils/budgetModel.js`) uses:

- **Weighted moving average** — recent seasons weighted more heavily
- **Per-category linear regression** — trend detection
- **Roster-normalized projections** — cost-per-player scaling
- **Anomaly detection** — flags outlier categories
- **Self-calibrating accuracy** — compares past predictions to actuals

Works with 1+ seasons of data. With only 1 completed season, uses that as the baseline with growth estimates. Extrapolates in-progress season actuals to project a full season.

---

## 7. Service Layer

All database operations live in `src/services/supabaseService.js`. It is a single exported object with named async functions. No mutations happen outside this file.

### Conventions

- Functions that fetch return camelCase objects (mapped from snake_case DB columns)
- Functions that write accept camelCase and convert to snake_case internally
- Join relationships are included in the select string (e.g., `players(first_name, last_name)`)
- Functions throw on error — callers are responsible for try/catch

### Key Functions

```js
// Players
getAllPlayers()
getPlayersByTeam(teamId)
addPlayer(playerData)
updatePlayer(playerId, updates)
updatePlayerField(playerId, field, value)  // For single-field compliance toggles
archivePlayer(playerId)

// Transactions
getAllTransactions()
getTransactionsByTeamSeason(teamSeasonId)
addTransaction(txData)
updateTransaction(txId, txData)
deleteTransaction(txId)
deleteBatch(field, value)  // For waterfall revert

// Team Events (iCal sync)
syncTeamEvents(teamId, events[])  // Upsert by (team_id, uid)
getTeamEvents(teamId)

// Teams & Seasons
getTeams(clubId)
getTeam(teamId)
updateTeam(teamId, teamData)
getTeamSeasons(teamId)
getTeamSeason(teamId, seasonId)
saveTeamSeason(teamId, seasonId, data)

// Financials (DB views)
getPlayerFinancials(seasonId, teamSeasonId)  // Reads player_financials view
getSeasonalRoster(teamId, seasonId)

// Documents
getDocuments(playerId, options)
uploadDocument(docData)
updateDocumentStatus(docId, status, verifiedBy)
deleteDocument(docId)

// Budget
getBudgetItems(teamSeasonId)
saveBudgetItems(teamSeasonId, items[])

// Blackouts
getAllBlackouts(teamId)
saveBlackout(dateStr, teamId)
deleteBlackout(dateStr)

// Roles & Users
getUserRoles(userId)
getClubUsers(clubId)
assignRole(userId, role, clubId, teamId)
revokeRole(roleId)

// Custom Categories
getCustomCategories(clubId)
addCustomCategory(catData)
updateCustomCategory(catId, updates)
deleteCustomCategory(catId)
```

---

## 8. Feature Workflows

### Fee Calculation & Budget Finalization

```
1. Manager creates budget season (Finance → Budget)
   → saveTeamSeason() creates team_seasons row
   → saveBudgetItems() creates budget line items

2. Manager sets roster size and buffer percent
   → Updates team_seasons.expected_roster_size, buffer_percent

3. System calculates base_fee:
   base_fee = ceil((total_expenses × (1 + buffer%)) / roster_size / 50) × 50

4. Manager reviews and clicks "Finalize Budget"
   → team_seasons.is_finalized = true
   → Budget UI locks (read-only)
   → base_fee is now permanent

5. player_financials VIEW computes each player's balance:
   remaining_balance = base_fee - total_paid - fundraising - sponsorships - credits
   (If fee_waived = true → base_fee forced to $0)
```

**Important:** Never compute balances in the frontend. Always read from `player_financials`.

---

### Waterfall Distribution

```
1. Manager logs a fundraiser deposit
   Transaction: { category: 'FUN', amount: 500, distributed: false, player_id: null }

2. Manager finalizes budget → 'Distribute' button appears

3. Manager clicks 'Distribute' on the $500 transaction

4. handleWaterfallCredit(500, 'Gift Card Fundraiser', null, txId, 'FUN'):

   a. Fetch fresh player_financials from DB
   b. Sort eligible players (non-waived, fundraiser_buyin = true)
   c. Generate batchId = 'waterfall_' + Date.now()

   d. If source player specified:
      - primary_credit = min(amount, sourcePlayer.remainingBalance)
      - CREATE: { amount: primary_credit, playerId: sourcePlayerId, category: 'FUN', batchId }
      - remaining = amount - primary_credit

   e. Pool distribution loop:
      while (remaining > 0.01 && eligiblePlayers.length > 0) {
        share = remaining / eligiblePlayers.length
        for each player:
          credit = min(share, player.remainingBalance)
          CREATE transaction
          if (credit >= player.remainingBalance) remove from pool
        remaining = amount - sum(all credits so far)
      }

   f. If any remainder:
      CREATE: { amount: remainder, playerId: null, category: 'FUN', batchId }

5. UPDATE original transaction: distributed = true

6. All distribution transactions tagged with waterfall_batch_id
   → SponsorsView groups and displays them
   → Manager can click 'Revert' to delete entire batch + reset original to distributed=false
```

---

### Schedule → Transaction Linking

```
1. Admin configures iCal URL in Team Admin
2. Schedule page shows live events from iCal feed (always current)

3. Admin clicks 'Sync' on Schedule page:
   → useSchedule.syncCalendar() fetches iCal
   → Parses all VEVENT components
   → classifyEvent() assigns type: tournament | league | friendly | practice | event
   → Filters to tournament, league, friendly only (practices excluded)
   → supabaseService.syncTeamEvents(teamId, events[]) upserts to team_events
   → App re-fetches teamEvents and updates state
   → Toast: "Synced X events to database"

4. When adding/editing a transaction:
   → TransactionModal receives teamEvents prop
   → 'Link to Schedule Event' dropdown appears (only when events exist)
   → User selects an event
   → Transaction saved with event_id foreign key

5. In the Ledger:
   → Transactions with event_id show a blue chain-link badge
   → Badge displays the linked event title
```

---

### Parent Portal Auto-Detection

```
1. Parent signs up with same email as their child's guardian record
2. Parent logs in → onAuthStateChange → setUser()
3. App fetches all players → no matching user_roles
4. isStaff = false → treated as parent
5. myPlayers = players.filter(p => p.guardians.some(g => g.email === user.email))
6. parentTeamId = myPlayers[0].teamId
7. effectiveTeam = getTeam(parentTeamId)
8. Route /dashboard → ParentView renders with myPlayers
9. ParentView shows ONLY those players — no other data accessible
```

---

### Document → Compliance Sync

```
Medical Release workflow:
  Upload doc (doc_type: 'medical_release')
    → supabaseService.uploadDocument()
    → syncWaiverStatus() checks remaining docs
    → If at least one verified/uploaded medical doc exists:
       updatePlayerField(playerId, 'medicalRelease', true)

  Verify doc:
    → updateDocumentStatus(docId, 'verified', userId)
    → syncWaiverStatus() → medicalRelease stays true

  Reject/Delete doc:
    → If NO remaining valid medical docs:
       updatePlayerField(playerId, 'medicalRelease', false)
```

`reeplayer_waiver` is a manual boolean toggle only — not driven by document uploads.

---

## 9. Data Flow

### Application Load

```
User logs in
  → useTeamContext(user)
      → getUserRoles(userId)
      → getClub(clubId)
      → getTeams(clubId)
      → Persist selectedTeamId to localStorage
  → useSoccerYear(user, effectiveTeamId)
      → getAllSeasons()
      → getTeamSeasons(teamId)
  → useSchedule(user, effectiveTeam)
      → fetch(team.icalUrl) → parse iCal
      → getAllBlackouts(teamId)
  → fetchData()
      → getPlayersByTeam(teamId)
      → getAllTransactions()
      → getPlayerFinancials(seasonId, teamSeasonId)
      → getTeamEvents(teamId)
```

### Transaction Add/Edit

```
User fills TransactionModal → submits
  → useLedgerManager.handleSaveTransaction(txData)
      → Attach seasonId, teamSeasonId
      → addTransaction() or updateTransaction()
  → fetchData() called
  → All views re-render with fresh data
  → player_financials VIEW auto-recalculates balances
```

### Team Switch

```
User selects different team in sidebar
  → setSelectedTeamId(newId) → persisted to localStorage
  → useTeamContext re-derives selectedTeam
  → useSoccerYear re-fetches team_seasons for new team
  → useSchedule re-fetches iCal for new team
  → fetchData() re-fetches players, transactions, financials for new team
  → All views re-render
```

---

## 10. Architectural Decisions

### DB View as Financial Source of Truth

The `player_financials` PostgreSQL view computes balances server-side. The frontend never adds up transactions to compute a balance. This prevents rounding errors and keeps logic in one authoritative place.

### No Backend / No RLS (Current State)

The app uses the Supabase anon key and no Row-Level Security policies. Authorization is frontend-only. This is appropriate for a trusted-organization tool but should be hardened before expanding to untrusted users. Adding RLS policies would require migrating to a service-role-based approach or implementing Supabase's RLS with auth.uid() checks.

### Token Refresh Isolation

`supabase.auth.onAuthStateChange` is filtered to only act on `SIGNED_IN` and `SIGNED_OUT`. This prevents the `TOKEN_REFRESHED` event (fires every ~60 minutes) from triggering a full data reload — which caused the "random page refresh" bug.

### Single-File Service Layer

All DB operations are in one file (`supabaseService.js`). This makes it easy to audit the DB interface, find column name mappings, and update queries when the schema changes. Hooks call service functions — they don't use the Supabase client directly.

### iCal as External Feed + Optional DB Sync

The calendar always shows live events from the external iCal feed. The separate "Sync" action imports a snapshot into the DB for the purpose of transaction linking and analytics. This means the schedule display is never stale, while the linking feature has a stable set of event IDs to reference.

### Waterfall Batch IDs

All transactions created from a single distribution share a `waterfall_batch_id` string. The source transaction has `distributed = true` and `original_tx_id` on the child records points back to it. This enables:

- Grouped display in SponsorsView
- One-click revert (delete by batch_id + reset source)
- Full audit trail

### localStorage for Team Selection

The user's selected team is stored in `localStorage` so it survives page refresh. The app validates the stored ID against accessible teams on load and falls back to the first available team if invalid.

### Guardian Email Matching for Parents

Rather than a separate "parent" role in `user_roles`, parents are detected by matching their auth email to guardian records. This means a parent can sign up independently — the admin doesn't need to do anything. If the parent's email is in a guardian record, they automatically see the right data.

---

## 11. Theming & Internationalization

### Theme System

**Files:** `src/theme/ThemeContext.jsx`

Three modes: `light`, `dark`, `system` (follows OS preference).

- Persisted to `localStorage` key `app_theme`
- Applied by toggling the `dark` class on `<html>`
- Cycled via the settings panel (desktop) or header icon (mobile)
- All views use `dark:` Tailwind variants for dark mode styling

### Internationalization (i18n)

**Files:** `src/i18n/I18nContext.jsx`, `src/i18n/en.js`, `src/i18n/es.js`

Two locales: English (`en`) and Spanish (`es`).

- Translation via `useT()` hook: `const { t, locale, toggleLocale } = useT();`
- Dot-path key resolution: `t('nav.dashboard')` → `"Dashboard"` or `"Panel"`
- Variable interpolation: `t('roster.count', { n: 5 })` → `"5 players"`
- Persisted to `localStorage` key `app_locale`
- Globe icon with badge shows current locale code

---

## 12. UI Component Library (shadcn/ui)

The app uses [shadcn/ui](https://ui.shadcn.com/) built on Radix primitives + Tailwind CSS.

**18 components available** in `src/components/ui/`:

| Component                    | Usage                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| `Button`                     | Primary actions, variants: default, destructive, outline, ghost |
| `Card`                       | Content containers with Header, Title, Content, Footer          |
| `Dialog`                     | Modal dialogs with overlay                                      |
| `Tabs`                       | Tab navigation                                                  |
| `Input`, `Label`, `Textarea` | Form elements                                                   |
| `Select`                     | Dropdown selection                                              |
| `Badge`                      | Status indicators                                               |
| `Table`                      | Data tables                                                     |
| `DropdownMenu`               | Context menus                                                   |
| `Alert`                      | Notification banners                                            |
| `Progress`                   | Progress bars                                                   |
| `Switch`                     | Toggle switches                                                 |
| `Separator`                  | Visual dividers                                                 |
| `Tooltip`                    | Hover tooltips                                                  |
| `Sheet`                      | Slide-out panels                                                |

**Import pattern:** `import { Button } from '@/components/ui/button';`

shadcn components automatically handle dark mode through CSS variables defined in `src/index.css`.

---

## 13. Budget Forecast Engine

**Files:** `src/utils/budgetModel.js` (740 lines), `src/hooks/useBudgetForecast.js`

A self-contained statistical forecasting engine with no external AI dependencies.

### How It Works

```
Historical Data (1+ seasons)
  → prepareHistoricalData()
    → Normalize categories across seasons
    → Calculate per-player costs
    → Track actual vs budgeted accuracy
  → generateForecast()
    → Weighted moving average (recent seasons weighted 2x)
    → Per-category linear regression for trends
    → Roster-size normalization
    → Anomaly detection (flag >2 std dev outliers)
    → Confidence scoring based on data consistency
  → Output: projected budget by category with confidence intervals
```

### Key Functions

```js
import { prepareHistoricalData, generateForecast, compareForecastToBudget, nextSeasonId } from './budgetModel';

const historical = prepareHistoricalData(teamSeasons, allTransactions, allPlayers);
const forecast = generateForecast(historical, nextRosterSize);
const accuracy = compareForecastToBudget(forecast, actualBudgetItems);
```

### Data Requirements

| Seasons Available | Behavior                            |
| ----------------- | ----------------------------------- |
| 0                 | Cannot forecast                     |
| 1 (in progress)   | Extrapolates actuals to full season |
| 1 (completed)     | Uses as baseline + growth estimates |
| 2+                | Full regression + trend analysis    |
| 4+                | Reliable confidence scoring         |

---

## 14. Changelog System

**Files:** `scripts/generate-changelog.js`, `.husky/post-commit`, `src/components/Changelog.jsx`

Automated changelog generation using AI summarization.

### Flow

```
git commit
  → pre-commit: lint-staged runs
  → commit saved
  → post-commit: scripts/generate-changelog.js
    → Reads last 20 commits via git log
    → Checks Supabase for already-recorded hashes
    → Sends new commits to Groq API (Llama 3.3 70B)
    → AI returns categorized changelog entries
    → Inserts to Supabase `changelogs` table
```

### Supabase Table: `changelogs`

| Column           | Type        | Notes                       |
| ---------------- | ----------- | --------------------------- |
| `id`             | uuid PK     |                             |
| `build_number`   | integer     | Git commit count            |
| `commit_hash`    | text UNIQUE | Full SHA                    |
| `commit_short`   | text        | Short SHA                   |
| `commit_message` | text        |                             |
| `commit_date`    | timestamptz |                             |
| `ai_summary`     | jsonb       | `[{category, description}]` |
| `created_at`     | timestamptz |                             |

### AI Categories

| Category      | Label         |
| ------------- | ------------- |
| `feature`     | New Features  |
| `improvement` | Improvements  |
| `bugfix`      | Bug Fixes     |
| `ui`          | UI/UX Changes |

### Environment Variables

| Key                         | Required | Purpose                                     |
| --------------------------- | -------- | ------------------------------------------- |
| `GROQ_API_KEY`              | Optional | Enables AI summaries (free, no credit card) |
| `VITE_SUPABASE_URL`         | Required | Supabase project URL                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Bypasses RLS for writes                     |

Without `GROQ_API_KEY`, commits are recorded without AI summaries. The script never blocks the commit on failure.

---

## 15. Deployment & Infrastructure

### Vercel

The app deploys to [Vercel](https://vercel.com) on every push to `main`.

- **Framework:** Vite (auto-detected)
- **SPA routing:** `vercel.json` rewrites all routes to `index.html`
- **Router:** BrowserRouter (clean URLs: `/dashboard` not `/#/dashboard`)
- **Preview deploys:** Every PR gets a unique preview URL
- **Environment variables:** Set in Vercel dashboard (Settings → Environment Variables)

Required Vercel env vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Vite Build

- **Code splitting:** Vendor (react), Supabase, PDF libs in separate chunks
- **Git info plugin:** Injects build number, commit hash, and build date at build time via `virtual:git-info` module
- **Path alias:** `@/` → `src/` (for shadcn/ui imports)

---

## 16. Testing

### Unit Tests (Vitest)

```bash
npm test                    # Watch mode
npm run test:coverage       # Coverage report (hooks + utils)
```

- Framework: Vitest + jsdom
- Coverage: `src/hooks/**` and `src/utils/**`
- Test files: `src/__tests__/`

### E2E Tests (Playwright)

```bash
npm run test:e2e            # All browsers
npm run test:e2e:chromium   # Chromium only
npm run test:e2e:headed     # With browser visible
npm run test:e2e:ui         # Playwright UI mode
```

**30 tests** across 6 spec files:

| Suite                  | Tests | Covers                                                                 |
| ---------------------- | ----- | ---------------------------------------------------------------------- |
| `auth.spec.js`         | 5     | Login, register toggle, locale on login page                           |
| `dashboard.spec.js`    | 4     | Dashboard load, nav items, no glow effects, theme toggle               |
| `finance.spec.js`      | 5     | Ledger, budget tab, remaining budget, add transaction, fundraising     |
| `parent-view.spec.js`  | 5     | Balance display, payment progress, player info layout, season fee      |
| `roster.spec.js`       | 5     | Player list, expand details, medical release, documents, impersonation |
| `theme-locale.spec.js` | 6     | Theme toggle, light/dark mode, locale switching, persistence           |

**Test data management:**

- Global setup seeds isolated test data (prefixed `TEST_E2E_`)
- Global teardown cleans up all test data
- State persisted to file across processes to ensure cleanup works
- Test user created/reused via Supabase service role key

---

## 17. Code Quality & Git Hooks

### ESLint

Flat config (`eslint.config.js`) with:

- React Hooks rules (including purity, memoization)
- React Refresh rules
- Separate configs for source, unit tests, E2E tests, and scripts

### Prettier

Config (`.prettierrc`):

- Single quotes, semicolons, trailing commas
- 120 char print width
- 2-space tabs

### Husky + lint-staged

**Pre-commit:** Runs ESLint + Prettier on staged files only.
**Post-commit:** Generates AI changelog entry in Supabase.

### Age Group Calculation

**File:** `src/utils/ageGroup.js`

Calculates US Soccer age groups based on player birthdate and season.

```js
import { getUSAgeGroup, getAge } from './ageGroup';

getUSAgeGroup('2012-03-15', '2025-2026'); // "U14"
getAge('2012-03-15'); // 13 (current age)
```

US Soccer uses the calendar year: age group = season end year - birth year.

---

## 18. SQL Migrations

Run these in the Supabase SQL Editor when setting up or updating the database.

### Add `team_events` table and `event_id` to transactions

```sql
-- Store imported iCal game events per team
create table if not exists team_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  uid text not null,
  title text not null,
  description text,
  location text,
  event_date timestamptz not null,
  event_type text default 'event',
  is_cancelled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(team_id, uid)
);

-- Link transactions to game events (nullable — existing rows unaffected)
alter table transactions
  add column if not exists event_id uuid references team_events(id) on delete set null;
```

### RLS Policies for `team_events`

```sql
create policy "team_events_select"
  on team_events for select to authenticated using (true);

create policy "team_events_insert"
  on team_events for insert to authenticated with check (true);

create policy "team_events_update"
  on team_events for update to authenticated using (true) with check (true);

create policy "team_events_delete"
  on team_events for delete to authenticated using (true);
```

### Add `payment_info` to teams

```sql
alter table teams
  add column if not exists payment_info text default '';
```

### Add `birthdate` to players

```sql
alter table players
  add column if not exists birthdate date;
```

### Add `changelogs` table

```sql
create table changelogs (
  id uuid default gen_random_uuid() primary key,
  build_number integer not null,
  commit_hash text not null unique,
  commit_short text not null,
  commit_message text not null,
  commit_date timestamptz not null,
  ai_summary jsonb,
  created_at timestamptz default now()
);

alter table changelogs enable row level security;
create policy "Anyone can read changelogs" on changelogs for select using (true);
```

### Add `medical_forms` table

```sql
create table if not exists medical_forms (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) on delete cascade not null,
  form_data jsonb not null,
  submitted_at timestamptz default now(),
  submitted_by uuid references auth.users(id),
  season_id text references seasons(id)
);

alter table medical_forms enable row level security;
create policy "medical_forms_select" on medical_forms for select to authenticated using (true);
create policy "medical_forms_insert" on medical_forms for insert to authenticated with check (true);
create policy "medical_forms_update" on medical_forms for update to authenticated using (true) with check (true);
create policy "medical_forms_delete" on medical_forms for delete to authenticated using (true);
```

---

## 19. Environment Variables Reference

| Variable                    | Where           | Purpose                                    |
| --------------------------- | --------------- | ------------------------------------------ |
| `VITE_SUPABASE_URL`         | `.env` + Vercel | Supabase project URL                       |
| `VITE_SUPABASE_ANON_KEY`    | `.env` + Vercel | Supabase anonymous key (public)            |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` only     | Service role key for E2E tests + changelog |
| `GROQ_API_KEY`              | `.env` only     | Groq API for AI changelog summaries        |
| `E2E_TEST_EMAIL`            | `.env` only     | Test user email for Playwright             |
| `E2E_TEST_PASSWORD`         | `.env` only     | Test user password for Playwright          |
