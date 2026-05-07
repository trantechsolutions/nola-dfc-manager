# NOLA DFC Manager — Technical Documentation

> **Version:** 1.0.0 | **Platform:** Web (PWA) | **Deployed:** nola-dfc-manager.vercel.app
> **Stack:** React 19 + Vite 7 + Supabase + Tailwind CSS 3

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Authentication & Session Flow](#authentication--session-flow)
4. [Role & Permission System](#role--permission-system)
5. [Navigation Structure](#navigation-structure)
6. [Module Reference](#module-reference)
   - [Finance Hub](#finance-hub-financeroute)
   - [People Hub](#people-hub-peopleroute)
   - [Schedule](#schedule-scheduleroute)
   - [Insights & AI Chat](#insights--ai-chat-insightsroute)
   - [Season Evaluations](#season-evaluations-season-evaluationsroute)
   - [Club Admin](#club-admin-club-adminroute)
   - [Parent View](#parent-view-dashboard--parent)
7. [Budget Forecasting Engine](#budget-forecasting-engine)
8. [Data Layer — Services](#data-layer--services)
9. [Database Entity Model](#database-entity-model)
10. [Push Notifications & PWA](#push-notifications--pwa)
11. [Internationalization (i18n)](#internationalization-i18n)
12. [Export System](#export-system)
13. [Developer Guide](#developer-guide)

---

## Executive Summary

NOLA DFC Manager is a **full-stack club and team management Progressive Web App** built for youth soccer clubs. It provides a unified platform for club administrators, team managers, coaches, treasurers, and parents — each with a tailored, permission-gated experience.

**Core capabilities:**

- Multi-team, multi-season roster and compliance tracking
- Full financial management: budget planning, transaction ledger, and fundraising waterfall distribution
- Calendar and schedule management with iCal sync
- AI-powered financial insights via Google Gemini
- In-app season player evaluations with customizable rubrics
- PDF/CSV export for all major reports
- Web Push notification delivery
- Bilingual UI (English / Spanish)

---

## System Architecture

```mermaid
graph TD
    subgraph Client ["Browser / PWA"]
        A[React 19 + Vite 7] --> B[React Router v7]
        B --> C[App.jsx — Root Orchestrator]
        C --> D[NavigationContext]
        C --> E[AppRoutes.jsx]
        E --> F[Team Views]
        E --> G[Club Views]
        E --> H[Admin Views]
        E --> I[Parent View]
    end

    subgraph Hooks ["Custom Hook Layer"]
        J[useTeamContext]
        K[useAppData]
        L[useSoccerYear]
        M[useFinance]
        N[useSchedule]
        O[usePlayerManager]
        P[useLedgerManager]
        Q[useCategoryManager]
        R[useAccounts]
    end

    subgraph Services ["Service Layer"]
        S[supabaseService — facade]
        S --> T[playerService]
        S --> U[financeService]
        S --> V[budgetService]
        S --> W[teamService]
        S --> X[clubService]
        S --> Y[scheduleService]
        S --> Z[userService]
        S --> AA[documentService]
        S --> AB[seasonService]
        S --> AC[categoryService]
        S --> AD[rubricService]
    end

    subgraph Backend ["Supabase Backend (BaaS)"]
        AE[Supabase Auth]
        AF[PostgreSQL DB]
        AG[Row-Level Security Policies]
        AH[Realtime / Subscriptions]
    end

    subgraph External
        AI[Google Gemini API — AI Chat]
        AJ[Web Push / VAPID]
    end

    C --> Hooks
    Hooks --> Services
    Services --> Backend
    C --> External
```

**Key architectural decisions:**

- **`supabaseService`** is a re-export facade — individual domain services (`playerService`, `financeService`, etc.) can be imported directly for new code, while legacy imports of `supabaseService` continue working unchanged.
- **`App.jsx`** acts as the central orchestrator, calling all hooks at the top level and passing results down to `AppRoutes` as props. This avoids deep context drilling while keeping all async state in one place.
- **`NavigationContext`** carries nav-related state (selected team, selected season, locale, theme) to sidebar components without passing through every route.

---

## Authentication & Session Flow

```mermaid
sequenceDiagram
    participant Browser
    participant App.jsx
    participant Supabase Auth
    participant supabaseService
    participant DB

    Browser->>Supabase Auth: getSession() on mount
    Supabase Auth-->>App.jsx: session | null

    alt Session exists
        App.jsx->>supabaseService: ensureUserProfile(user)
        supabaseService->>DB: upsert into user_profiles
        App.jsx->>supabaseService: claimMyInvitations()
        supabaseService->>DB: claim pending invitations for email
        App.jsx->>App.jsx: setUser() → fetchData()
    else No session
        App.jsx->>App.jsx: render LoginView / PublicCalendarView
    end

    Note over App.jsx: onAuthStateChange listener active

    alt SIGNED_IN (new user ID)
        Supabase Auth-->>App.jsx: event=SIGNED_IN
        App.jsx->>supabaseService: ensureUserProfile + claimMyInvitations
        App.jsx->>App.jsx: setLoading(true) → bootstrap
    else TOKEN_REFRESHED / USER_UPDATED
        Note over App.jsx: Intentionally ignored — prevents spurious reloads
    else SIGNED_OUT
        Supabase Auth-->>App.jsx: event=SIGNED_OUT
        App.jsx->>App.jsx: setUser(null)
    end
```

**Critical implementation notes:**

- `TOKEN_REFRESHED`, `INITIAL_SESSION`, and `USER_UPDATED` events are **explicitly ignored** in the auth state listener. This prevents a "random reload" bug that appeared every ~60 minutes when Supabase refreshed the JWT.
- `claimMyInvitations()` must complete **before** `setUser()` so that `useTeamContext`'s role fetch reads fully claimed rows.
- A `lastUserIdRef` ref guards against re-bootstrapping the same user on duplicate `SIGNED_IN` events.

---

## Role & Permission System

The app has a **three-tier hierarchical role system**:

```mermaid
graph TD
    A["🌐 App Level\nsuper_admin"] --> B["🏢 Club Level\nclub_admin / club_manager"]
    B --> C["⚽ Team Level\nteam_manager / team_admin / treasurer / scheduler / head_coach / assistant_coach"]
    C --> D["👨‍👩‍👧 No Role = Parent\n(derived from player guardian records)"]
```

### Role Definitions

| Role              | Scope | Description                                                                    |
| ----------------- | ----- | ------------------------------------------------------------------------------ |
| `super_admin`     | App   | Global administrator. Full access to all clubs, teams, data.                   |
| `club_admin`      | Club  | Full access to all teams in the club. Can manage teams, roles, settings.       |
| `club_manager`    | Club  | Read-only access across all teams. Cannot edit settings or roles.              |
| `team_manager`    | Team  | Full team access + can manage other users' roles within the team.              |
| `team_admin`      | Team  | Full team access. Cannot manage user roles.                                    |
| `treasurer`       | Team  | Finance-only: budget, ledger, sponsors, waivers.                               |
| `scheduler`       | Team  | Schedule-only: create events, manage blackouts.                                |
| `head_coach`      | Team  | View roster + schedule. Can submit evaluations + manage rubric.                |
| `assistant_coach` | Team  | View roster + schedule. Can submit evaluations.                                |
| _(none)_          | —     | **Parent**: derives team from guardian records. Sees their player's data only. |

### Permission Matrix

| Permission        | super_admin | club_admin | club_manager | team_manager | team_admin | treasurer | scheduler | head_coach | assistant_coach |
| ----------------- | :---------: | :--------: | :----------: | :----------: | :--------: | :-------: | :-------: | :--------: | :-------------: |
| Manage Clubs      |     ✅      |            |              |              |            |           |           |            |                 |
| Club Settings     |     ✅      |     ✅     |              |              |            |           |           |            |                 |
| Manage Teams      |     ✅      |     ✅     |              |              |            |           |           |            |                 |
| Manage Club Roles |     ✅      |     ✅     |              |              |            |           |           |            |                 |
| View Any Team     |     ✅      |     ✅     |      ✅      |              |            |           |           |            |                 |
| View Roster       |     ✅      |     ✅     |      ✅      |      ✅      |     ✅     |    ✅     |    ✅     |     ✅     |       ✅        |
| Edit Roster       |     ✅      |     ✅     |              |      ✅      |     ✅     |           |           |            |                 |
| View Schedule     |     ✅      |     ✅     |      ✅      |      ✅      |     ✅     |           |    ✅     |     ✅     |       ✅        |
| Edit Schedule     |     ✅      |     ✅     |              |      ✅      |     ✅     |           |    ✅     |            |                 |
| View Budget       |     ✅      |     ✅     |      ✅      |      ✅      |     ✅     |    ✅     |           |            |                 |
| Edit Budget       |     ✅      |     ✅     |              |      ✅      |     ✅     |    ✅     |           |            |                 |
| View Ledger       |     ✅      |     ✅     |      ✅      |      ✅      |     ✅     |    ✅     |           |            |                 |
| Edit Ledger       |     ✅      |     ✅     |              |      ✅      |     ✅     |    ✅     |           |            |                 |
| View Sponsors     |     ✅      |     ✅     |      ✅      |      ✅      |     ✅     |    ✅     |           |            |                 |
| Edit Sponsors     |     ✅      |     ✅     |              |      ✅      |     ✅     |    ✅     |           |            |                 |
| View Insights     |     ✅      |     ✅     |      ✅      |      ✅      |     ✅     |    ✅     |           |            |                 |
| Manage Waivers    |     ✅      |     ✅     |              |      ✅      |     ✅     |    ✅     |           |            |                 |
| Manage Team Users |     ✅      |     ✅     |              |      ✅      |            |           |           |            |                 |
| Manage Rubric     |     ✅      |     ✅     |              |              |     ✅     |           |           |     ✅     |                 |
| Evaluate Players  |     ✅      |     ✅     |              |              |            |           |           |     ✅     |       ✅        |
| View Evaluations  |     ✅      |     ✅     |      ✅      |      ✅      |     ✅     |           |           |     ✅     |       ✅        |

### Role Assignment Rules

- **Club-assignable roles** (assigned by `club_admin`): `head_coach`, `assistant_coach`, `team_manager`
- **Team-assignable roles** (assigned by `team_manager` within their team): `team_admin`, `treasurer`, `scheduler`
- Parents have **no role record** — their access is derived from the `guardians` array on player records.

### `hasPermission()` Logic

```
src/utils/roles.js:276
```

```
For each userRole entry:
  1. App-level roles (super_admin) → grant immediately
  2. Club-level roles (club_admin/club_manager) → grant for any team
  3. Team-level roles → grant only if ur.teamId === requested teamId
```

---

## Navigation Structure

Navigation is split into four sections, each rendered conditionally based on role:

```mermaid
graph LR
    NAV["Sidebar / Mobile Nav"] --> APP["App Section\n/app-admin\n(super_admin only)"]
    NAV --> CLUB["Club Section\n/club-overview\n/club-teams\n/club-players\n/club-admin\n(club_admin / super_admin)"]
    NAV --> SEASON["Season Section\n/dashboard (Season Overview)\n/finance/budget\n/finance/ledger\n/finance/fundraising"]
    NAV --> TEAM["Team Section\n/schedule\n/people\n/insights\n/season-evaluations\n/team-admin"]
```

- **Desktop:** `DesktopSidebar` renders all four sections in a persistent left sidebar.
- **Mobile:** `MobileHeader` (top bar) + `MobileBottomNav` (bottom tab bar) + `MobileMenu` (slide-out drawer).
- **Single Team Mode** (`VITE_SINGLE_TEAM_ID` env var): Hides all Club and App nav sections — the app acts as a standalone team manager.

---

## Module Reference

### Finance Hub (`/finance/*`)

The Finance Hub is a tabbed view containing three sub-modules. Visible tabs are gated by permissions.

```mermaid
graph TD
    FIN["/finance/*\nFinanceView"] --> LED["Ledger Tab\n(TEAM_VIEW_LEDGER)"]
    FIN --> BUD["Budget Tab\n(TEAM_VIEW_BUDGET)"]
    FIN --> FUN["Fundraising Tab\n(TEAM_VIEW_SPONSORS)"]

    LED --> L1["Transaction list\n(date, category, player, amount)"]
    LED --> L2["Bulk CSV import"]
    LED --> L3["PDF export"]
    LED --> L4["Per-player balance breakdown"]

    BUD --> B1["Budget line items\nper category (income/expense)"]
    BUD --> B2["Budget vs Actuals table"]
    BUD --> B3["AI Forecast panel\n(useBudgetForecast)"]
    BUD --> B4["Season finalization & cloning"]
    BUD --> B5["PDF + CSV export"]

    FUN --> F1["Sponsor/fundraiser income list"]
    FUN --> F2["Waterfall credit distribution\nto players"]
    FUN --> F3["Revert distribution"]
```

#### Ledger

The transaction ledger tracks every financial movement for the team season.

**Transaction fields:**
| Field | Description |
|---|---|
| `date` | Transaction date |
| `category` | Category code (e.g. `TMF`, `TOU`, `COA`) — see Category system |
| `title` | Human-readable description |
| `amount` | Positive = income, negative = expense |
| `playerId` | Optional: links to a specific player |
| `cleared` | Whether the payment has been confirmed received/sent |
| `accountId` | Which holding account the transaction belongs to |
| `waterfallBatchId` | Links distributed sponsor credits to the source transaction |
| `eventId` | Optional: links to a team calendar event |
| `split` | Split payment indicator |

**Bulk Upload:** Accepts CSV files. Rows are parsed and validated before insertion via `handleBulkUpload` → `useLedgerManager`.

**`teamBalance` calculation:**

```
Sum of cleared, non-waterfall, non-TRF transactions
where the account's holding type is not 'none'
```

#### Budget

Budget line items are defined per-season, per-category. The Budget view shows:

- **Planned** (entered budget) vs **Actual** (from transactions matching the category)
- **AI Forecast** values generated by the internal `budgetModel.js` engine (see [Budget Forecasting Engine](#budget-forecasting-engine))
- **Finalize Season**: locks the budget and enables fundraising waterfall distribution
- **Clone Season**: copies budget structure forward into a new season

#### Fundraising / Waterfall Distribution

When a season is finalized, sponsor income can be distributed to players proportionally. The "waterfall" mechanism:

1. A positive transaction (sponsorship income) is selected
2. Manager specifies a distribution amount, title, and per-player assignment
3. `handleWaterfallCredit()` creates child credit transactions linked by `waterfall_batch_id`
4. Distribution can be fully reverted via `revertWaterfall()`, which deletes the batch

---

### People Hub (`/people`)

A tabbed view managing all roster-related data for the selected team + season.

```mermaid
graph TD
    PEOPLE["/people\nPeopleView"] --> ROSTER["Roster Tab\n(TEAM_VIEW_ROSTER)"]
    PEOPLE --> DOCS["Documents Tab\n(TEAM_VIEW_ROSTER)"]
    PEOPLE --> PERMS["Permissions Tab\n(TEAM_MANAGE_USERS)"]

    ROSTER --> R1["Player list with compliance status"]
    ROSTER --> R2["Add / Edit / Archive players"]
    ROSTER --> R3["Fee waiver toggle"]
    ROSTER --> R4["View-as-parent impersonation"]
    ROSTER --> R5["Season profile management"]

    DOCS --> D1["Medical release forms (PDF generation)"]
    DOCS --> D2["Document status per player"]

    PERMS --> P1["View guardians linked to each player"]
    PERMS --> P2["Assign / revoke team roles"]
    PERMS --> P3["Jersey number display"]
```

**Player Record Fields (key):**
| Field | Description |
|---|---|
| `firstName / lastName` | Player name |
| `birthDate` | Used to compute US Soccer age group |
| `jerseyNumber` | Displayed via `JerseyBadge` component |
| `status` | `active` or `archived` |
| `teamId` | Assigned team |
| `seasonProfiles[seasonId]` | Per-season enrollment data |
| `guardians[]` | Array of `{ name, email, phone }` — used for parent auth matching |
| `feeWaived[seasonId]` | Whether the season fee is waived |
| Compliance fields | `registrationComplete`, `birthCertificate`, `medicalRelease`, `photo`, `parentalConsent` |

**Parent Impersonation:** Staff can click "View as Parent" on any player to see exactly what that player's guardian would see. An amber banner is shown at the top of the app while impersonating. Exit returns to the normal staff view.

---

### Schedule (`/schedule`)

```mermaid
graph LR
    SCHED["/schedule\nScheduleView"] --> CAL["FullCalendar\n(daygrid + interaction)"]
    SCHED --> ELIST["Event List Panel"]
    SCHED --> SYNC["iCal Sync\n(scheduleService)"]

    CAL --> BL["Blackout Dates\n(toggle per date)"]
    ELIST --> ET["Event Type Classification\n(game/practice/tournament/friendly)"]
    ELIST --> EXP["Event Expenses\n(link transactions to events)"]
```

- **iCal Sync:** Imports events from an external calendar URL (stored in team settings). Events are matched against existing DB records by `eventMatcher.js` to avoid duplicates.
- **Event Type Classification:** `eventClassifier.js` auto-classifies imported events into types (`game`, `practice`, `tournament`, `friendly`). Staff can manually override with `typeLocked = true`.
- **Event Expenses:** Transactions can be linked to specific calendar events, enabling per-event cost tracking visible on the Schedule view.
- **Blackout Dates:** Team-level unavailability dates shown on the calendar, editable by users with `TEAM_EDIT_SCHEDULE`.

---

### Insights & AI Chat (`/insights`)

```mermaid
sequenceDiagram
    participant Staff
    participant InsightsView
    participant LocalStorage
    participant Gemini API

    Staff->>InsightsView: Opens Insights view
    InsightsView->>InsightsView: Compute financial KPIs\n(income, expenses, player balances)
    InsightsView->>InsightsView: Build event match report\n(games won/played stats)
    Staff->>InsightsView: Enters message + sends
    InsightsView->>LocalStorage: Retrieve gemini_api_key
    InsightsView->>Gemini API: POST /generateContent\n(model: gemini-2.0-flash-lite)\nwith full financial context as system prompt
    Gemini API-->>InsightsView: AI response text
    InsightsView->>Staff: Display response in chat bubble
```

**KPI Panels computed client-side:**

- Total income vs. total expenses
- Player balance summary (total owed, total credited)
- Event match record (based on `eventMatcher.js` home/away detection)
- Budget variance alerts (>20% over/under)
- Per-category spending breakdown

**AI Chat:** Uses Google Gemini (`gemini-2.0-flash-lite`). The entire financial context (transactions, player balances, season data) is injected as a system prompt. The user's Gemini API key is stored in `localStorage` (never sent to any Supabase endpoint).

**Export:** The full insights panel can be exported as a PDF via `exportInsightsPDF`.

---

### Season Evaluations (`/season-evaluations`)

```mermaid
graph TD
    EVAL["/season-evaluations\nSeasonEvaluationView"] --> RUBRIC["Rubric Editor\n(TEAM_MANAGE_RUBRIC)"]
    EVAL --> SCORING["Per-Player Scoring Panel\n(CLUB_EVALUATE_PLAYERS)"]
    EVAL --> GUEST["Guest Player Picker\n(players from other club teams)"]
    EVAL --> SUMMARY["Evaluation Summary\n(per-evaluator breakdown)"]

    SCORING --> S1["Expand player card"]
    SCORING --> S2["Rate each skill per rubric section"]
    SCORING --> S3["Save scores → Supabase"]
    SCORING --> S4["Scores linked to evaluator + teamSeason"]

    RUBRIC --> R1["Default sections: Technical / Tactical / Physical / Mental"]
    RUBRIC --> R2["Customize skill names and sections"]
    RUBRIC --> R3["Save custom rubric to Supabase"]
```

**Who can evaluate:**

- `head_coach`, `assistant_coach`, `club_admin`, `super_admin` (checked via `COACH_ROLES` set + `hasPermission`)

**Who can manage the rubric:**

- `head_coach`, `team_admin`, `club_admin`, `super_admin`

**Evaluator Selection:** If the current user is a `team_manager` or `club_admin`, they can select a different evaluator to view/submit scores on their behalf.

**Guest Players:** Players from other teams within the same club can be pulled in for evaluation (e.g., tryout scenarios). They are tracked separately in `guestPlayers` state and linked to the session.

**Rating Scale:** 5-point scale with labels defined in `RATING_LABELS` from `defaultEvaluationRubric.js`.

---

### Club Admin (`/club-admin`)

Tabbed hub for club-level configuration. Only accessible to `club_admin` and `super_admin`.

| Tab            | Description                                                                            |
| -------------- | -------------------------------------------------------------------------------------- |
| **Settings**   | Edit club name, logo, branding                                                         |
| **Users**      | View all users with roles across all teams. Assign/revoke roles.                       |
| **Categories** | Create custom transaction categories with name, code, color, and type (income/expense) |

**Custom Categories:** Each club can define custom category codes beyond the built-in defaults (`TMF`, `TOU`, `COA`, `OPE`, `LEA`, `FRI`, `FUN`, `SPO`). Custom categories are stored in Supabase and merged with built-in options via `useCategoryManager`.

---

### Parent View (`/dashboard` — parent)

Parents (users with no staff role) see a simplified dashboard:

```mermaid
graph TD
    PARENT["/dashboard\nParentView"] --> PLAYERS["My Player(s) Card"]
    PARENT --> FIN["Financial Summary\nFees owed / credits applied"]
    PARENT --> SCHED["Upcoming Schedule"]
    PARENT --> DOCS["Document Compliance Status"]
    PARENT --> PAY["Payment Methods\n(stored on player record)"]

    PLAYERS --> P1["Player name, age group, team"]
    PLAYERS --> P2["Season enrollment status"]
    FIN --> F1["Total amount owed"]
    FIN --> F2["Payments received"]
    FIN --> F3["Outstanding balance"]
```

**Parent team derivation (two-pass):**

1. `useTeamContext` returns empty `teams` for parents (no role rows).
2. After `useAppData` resolves `players`, the app scans guardians to find `parentTeamId`.
3. `parentTeam` is then fetched directly via `supabaseService.getTeam()`.
4. This `parentTeamId` is passed to `useSoccerYear` so parents get correct season data.

---

## Budget Forecasting Engine

```
src/utils/budgetModel.js
```

A **pure JavaScript statistical model** with no external ML dependencies. It analyzes historical budget data across multiple seasons to predict future budgets per category.

```mermaid
graph TD
    IN["Input: Historical season data\n(budget + actuals per category + roster size)"] --> WMA["Weighted Moving Average\n(exponential decay, factor=0.6)"]
    IN --> REG["Per-Category Linear Regression\n(slope, intercept, R²)"]
    IN --> NORM["Roster-Normalized Projections\n(cost per player × projected roster)"]
    WMA --> BLEND["Blend WMA + Regression\nbased on R² threshold"]
    REG --> BLEND
    BLEND --> SHRINK["Bayesian Shrinkage\n(single-season prior blend)"]
    NORM --> SHRINK
    SHRINK --> ANOM["Anomaly Detection\n(z-score > 2.0 flagged)"]
    SHRINK --> CI["Confidence Intervals\n(±1.5σ)"]
    ANOM --> OUT["Output: point estimate + CI bounds\n+ anomaly flags + insights"]
    CI --> OUT
```

**Hyperparameters (tunable in `FORECAST_CONFIG`):**

| Parameter                  | Default | Description                                                        |
| -------------------------- | ------- | ------------------------------------------------------------------ |
| `decayFactor`              | 0.6     | Exponential decay for WMA — higher = more weight to recent seasons |
| `singleSeasonActualWeight` | 0.55    | Bayesian blend weight for actual spend                             |
| `singleSeasonBudgetWeight` | 0.25    | Bayesian blend weight for planned budget                           |
| `singleSeasonPriorWeight`  | 0.20    | Bayesian blend weight for global prior                             |
| `categoryPriorPerPlayer`   | $80     | Fallback cost per player when no history exists                    |
| `trendR2Threshold`         | 0.5     | Minimum R² before regression slope is trusted                      |
| `strongTrendR2Threshold`   | 0.7     | R² for high-confidence regression dominance (4+ seasons)           |
| `anomalyZThreshold`        | 2.0     | Z-score threshold for flagging anomalies                           |
| `budgetVarianceThreshold`  | 20%     | Budget vs actual variance before generating an insight             |
| `ciMultiplier`             | 1.5     | Confidence interval half-width multiplier                          |
| `minYearlyGrowthRate`      | 3%      | Minimum year-over-year growth floor applied to all forecasts       |

**Season completion extrapolation:** When a season is in-progress (not finalized), actuals are extrapolated to year-end based on completion percentage. Early-season results (< 25% complete) are dampened toward the planned budget to prevent overconfident projections.

---

## Data Layer — Services

All Supabase interactions are encapsulated in the `src/services/` directory. `supabaseService.js` is a facade that re-exports all domain services for backward compatibility.

```mermaid
graph LR
    FACADE["supabaseService\n(facade)"] --> PS["playerService\nCRUD players, archive, field updates, compliance"]
    FACADE --> FS["financeService\nCRUD transactions, audit log"]
    FACADE --> BS["budgetService\nBudget line items, finalize, clone season"]
    FACADE --> TS["teamService\nTeam CRUD, iCal URL, event types"]
    FACADE --> CS["clubService\nClub CRUD, logo upload"]
    FACADE --> SS["scheduleService\nCalendar events, blackout dates, iCal sync"]
    FACADE --> US["userService\nUser profiles, roles, invitations"]
    FACADE --> DS["documentService\nMedical release forms, document status"]
    FACADE --> SES["seasonService\nSeason + team_season management"]
    FACADE --> CAS["categoryService\nCustom transaction categories"]
    FACADE --> RS["rubricService\nEvaluation rubric CRUD"]
```

**Audit Logging:** `financeService` calls `logAuditEvent` (from `auditService.js`) on all transaction mutations. Audit events are stored in Supabase and contain the user ID, action type, and before/after state.

**Invitation Claim Flow:** On every login, `claimMyInvitations()` checks for pending `user_roles` rows where `invited_email` matches the authenticated user's email, and claims them (writes the user ID). This enables pre-assigned roles for users who haven't registered yet.

---

## Database Entity Model

```mermaid
erDiagram
    clubs {
        uuid id PK
        string name
        string logo_url
        string slug
    }

    teams {
        uuid id PK
        uuid club_id FK
        string name
        string ical_url
        string age_group
    }

    seasons {
        uuid id PK
        string name
        string start_date
        string end_date
    }

    team_seasons {
        uuid id PK
        uuid team_id FK
        uuid season_id FK
        boolean is_finalized
        integer roster_count
    }

    players {
        uuid id PK
        uuid club_id FK
        uuid team_id FK
        string first_name
        string last_name
        string birth_date
        string jersey_number
        string status
        jsonb season_profiles
        jsonb guardians
        jsonb fee_waived
    }

    transactions {
        uuid id PK
        uuid season_id FK
        uuid team_season_id FK
        uuid player_id FK
        uuid account_id FK
        uuid event_id FK
        uuid waterfall_batch_id
        string category
        string title
        numeric amount
        boolean cleared
        boolean distributed
        date date
    }

    budget_items {
        uuid id PK
        uuid team_season_id FK
        string category
        numeric planned_amount
        string type
    }

    accounts {
        uuid id PK
        uuid team_id FK
        string name
        string holding
    }

    user_roles {
        uuid id PK
        uuid user_id FK
        string role
        uuid club_id FK
        uuid team_id FK
        string invited_email
    }

    team_events {
        uuid id PK
        uuid team_id FK
        string title
        string event_type
        boolean type_locked
        timestamp start_time
        timestamp end_time
    }

    evaluations {
        uuid id PK
        uuid team_season_id FK
        uuid player_id FK
        uuid evaluator_id FK
        jsonb scores
        timestamp created_at
    }

    custom_categories {
        uuid id PK
        uuid club_id FK
        string code
        string name
        string color
        string type
    }

    push_subscriptions {
        string endpoint PK
        string p256dh
        string auth
        uuid user_id FK
    }

    clubs ||--o{ teams : "has"
    clubs ||--o{ players : "owns"
    clubs ||--o{ custom_categories : "defines"
    teams ||--o{ team_seasons : "has"
    teams ||--o{ players : "assigned to"
    teams ||--o{ accounts : "holds"
    teams ||--o{ team_events : "schedules"
    seasons ||--o{ team_seasons : "linked to"
    team_seasons ||--o{ transactions : "contains"
    team_seasons ||--o{ budget_items : "plans"
    team_seasons ||--o{ evaluations : "records"
    players ||--o{ transactions : "linked to"
    players ||--o{ evaluations : "evaluated in"
    team_events ||--o{ transactions : "expenses for"
    accounts ||--o{ transactions : "categorized by"
    user_roles }o--|| teams : "scoped to"
    user_roles }o--|| clubs : "scoped to"
```

---

## Push Notifications & PWA

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant ServiceWorker
    participant Supabase DB
    participant PushServer

    User->>Browser: Clicks "Enable Notifications"
    Browser->>ServiceWorker: Register /service-worker.js
    Browser->>Browser: Notification.requestPermission()
    Browser->>ServiceWorker: subscribe({ applicationServerKey: VAPID_KEY })
    ServiceWorker-->>Browser: PushSubscription { endpoint, p256dh, auth }
    Browser->>Supabase DB: upsert push_subscriptions
    Note over Browser,Supabase DB: Subscription stored per endpoint (unique)

    PushServer->>ServiceWorker: Web Push message
    ServiceWorker->>User: Show system notification

    Note over ServiceWorker: On subscription renewal,\nSW sends PUSH_SUBSCRIPTION_CHANGED\nmessage → app re-upserts to Supabase
```

- **VAPID key** is stored in environment variables and used for push server authentication.
- Managed via `usePushNotifications` hook + `pushService`.
- `NotificationPermissionBanner` prompts users who have not yet granted permission.
- Service worker is registered at `/service-worker.js` (public directory).

---

## Internationalization (i18n)

The app supports **English (en)** and **Spanish (es)** via a custom lightweight i18n system.

```mermaid
graph LR
    CTX["I18nContext\n(React Context)"] --> T["useT() hook\n→ t(key, vars)"]
    CTX --> LOCALE["locale state\n('en' | 'es')"]
    CTX --> TOGGLE["toggleLocale()"]
    T --> EN["src/i18n/en.js\n(English strings)"]
    T --> ES["src/i18n/es.js\n(Spanish strings)"]
```

- **`t(key, vars)`**: Resolves a dot-notation key (e.g. `t('nav.schedule')`) against the active locale dictionary. Supports variable interpolation: `t('toast.syncedEvents', { n: 5 })` → `"5 events synced"`.
- **Locale toggle** is accessible from the sidebar settings panel and cycles between `en` and `es`.
- Locale preference is persisted to `localStorage`.
- All user-facing strings must use `t()` — hardcoded English strings in JSX are a lint concern.

---

## Export System

```
src/utils/exportUtils.js
```

All exports are client-side — no server round-trip required.

| Export Function                                          | Format          | Source View                                |
| -------------------------------------------------------- | --------------- | ------------------------------------------ |
| `exportToCSV(data, filename, columns)`                   | CSV             | Generic — used across ledger, budget, etc. |
| `exportLedgerPDF(transactions, seasonInfo, formatMoney)` | PDF (landscape) | Ledger                                     |
| `exportBudgetActualsPDF(...)`                            | PDF             | Budget                                     |
| `exportBudgetActualsCSV(...)`                            | CSV             | Budget                                     |
| `exportInsightsPDF(...)`                                 | PDF             | Insights                                   |

- PDF generation uses **jsPDF** (`^4.2.1`) directly — no server-side rendering.
- CSV generation uses a manual escape function (no external library dependency).
- QR code generation (`qrcode`) is available for document/link sharing use cases.
- Medical release PDFs are generated via `src/utils/generateMedicalPdf.js` using **pdf-lib**.

---

## Developer Guide

### Prerequisites

- Node.js 18+
- A Supabase project with the required schema applied
- `.env.local` with:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
# Optional: single-team mode
VITE_SINGLE_TEAM_ID=uuid-of-your-team
```

### Scripts

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run dev`           | Start Vite dev server                |
| `npm run build`         | Production build (output to `dist/`) |
| `npm run preview`       | Preview production build locally     |
| `npm test`              | Run Vitest unit test suite           |
| `npm run test:ui`       | Vitest with browser UI               |
| `npm run test:coverage` | Coverage report via V8               |
| `npm run lint`          | ESLint (React hooks + refresh rules) |
| `npm run format`        | Prettier write across `src/`         |
| `npm run format:check`  | Prettier check (used in CI)          |

### Testing

- **Framework:** Vitest 4 + Testing Library
- **Test files:** `src/__tests__/` — organized by `hooks/` and `utils/`
- **Key test files:**
  - `budgetModel.test.js` — Forecast engine unit tests
  - `useBudgetForecast.test.js` — Hook integration tests
  - `roles.test.js` — Permission matrix coverage
  - `seasonUtils.test.js` — Season date computation
  - `singleTeamMode.test.js` — Single-team env detection
  - `holdings.test.js` — Account holding logic
- **Setup:** `src/__tests__/setup.js` configures jest-dom matchers

### Code Conventions

- **Service imports:** Prefer domain-specific service imports for new code:
  ```js
  // Preferred for new code
  import { playerService } from '../services/playerService';
  // Acceptable for legacy compatibility
  import { supabaseService } from '../services/supabaseService';
  ```
- **Permissions:** Always use `can(PERMISSIONS.SOME_PERMISSION)` in components — never hardcode role names in JSX.
- **i18n:** All user-visible strings must use `t('key')` from `useT()`.
- **Styling:** Tailwind utility classes via `clsx` + `tailwind-merge`. Use `cn()` from `src/lib/utils.js` for conditional class merging.
- **Git:** Conventional Commits format (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`). Imperative mood. No AI attribution in commit messages.

### Husky Pre-commit Hooks

Configured via `.husky/` + `lint-staged`. On commit:

1. ESLint runs on staged `.js/.jsx` files
2. Prettier formats staged files

### Deployment

- **Platform:** Vercel (configured via `homepage` in `package.json`)
- **Build command:** `npm run build`
- **Output directory:** `dist/`
- **Environment variables:** Set in Vercel dashboard (match `.env.local` keys)
