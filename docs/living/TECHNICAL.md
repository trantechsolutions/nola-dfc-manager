# Engineering Changelog

Cumulative technical record of every push: what was touched, what changed in the
schema or API, why the approach was chosen, how it was tested, and how to roll it
back. Newest entry first. Entries are never edited or removed — a correction is a
new entry that points back at the old one.

Each entry here has a matching entry, under the same heading, in
[STAKEHOLDER.md](STAKEHOLDER.md) and [MANAGEMENT.md](MANAGEMENT.md).

**Stack:** React 18 + Vite, Tailwind, Supabase (Postgres + RLS + realtime),
Vitest + Testing Library, ESLint. Deployed on Vercel.

**Entry format**

```
## YYYY-MM-DD — <short title> (<first-sha>..<last-sha>)

**Commits.** <git log --oneline output for the range>
**Touched.** <files/modules, grouped>
**Schema/API.** <migrations, table or column changes, RLS policy changes, or "none">
**Rationale.** <why this shape and not the obvious alternative>
**Tests.** <what was added or run, and the result>
**Rollback.** <exact steps, including whether a migration is reversible>
```

---

## 2026-10-23 — Document storage lockdown and marketing screenshots (ab5a6be..192b08c)

**Commits.**

- `ab5a6be fix: drop the bucket's original player-documents storage policies`
- `192b08c feat: add app screenshots and match-day features to the marketing page`

**Touched.**

- `sql/fix_player_documents_storage_rls.sql`: drops `storage_documents_{select,insert,delete}` (dashboard
  originals; select was `auth.role() = 'authenticated'`).
- Marketing: `src/views/general/LandingView.jsx` (`#tour` section, `TOUR` list, features chat/live/film),
  `landing.css` (`.landing-phone`), `src/i18n/{en,es}/landing.js`, `public/marketing/*.webp` (16 files,
  ~820 KB: home/schedule/live/chat × light/dark × en/es, 780×1688).
- `vite.config.js`: `marketing/**` excluded from the PWA precache.
- Preview: `LivePreview` applies `teamColorVars` and `lang`; `keepPreview.js` game starts 20 minutes before load.

**Schema/API.** Applied to production 2026-10-23 in one transaction (after a rollback dry run):
`fix_access_control_migration`, `chat_admin_oversight_migration`, `fix_medical_release_admin_scope`,
`fix_player_documents_storage_rls`, `live_game_migration`, `keeper_game_window_migration`. Verified: only
`player_documents_*` remain on storage.objects for the bucket; keeper functions, policies and realtime present.
Deployed: `team-calendar` (verify_jwt off), `notify-push`.

**Rationale.** Screenshots come from the design preview so they contain no real families; images are chosen by
theme (`dark:` classes) and locale.

**Tests.** LandingView tests (feature count follows the strings) pass; Vitest 1332/1332; lint 0 errors; build
passes; landing checked at 1280px light/dark and 390px.

**Rollback.** Revert 192b08c. Re-adding the storage policies is not recommended; to undo ab5a6be's database
effect, recreate them from the dashboard.

---

## 2026-10-23 — Scorekeeper, live games and the Stats tab (b219849..a4e2d62)

**Commits.**

- `b219849 chore: move the game film tooling into this repo`
- `a4e2d62 feat: add the scorekeeper, live games and a Stats tab`

**Touched.**

- Tooling: `tools/film/` (film.ts CLI, validate, i18n, ollie, reeplayer, scan_tape.py, make_highlights.py,
  r2.ts), npm scripts `film`, `film:validate`, `film:i18n`, `film:ollie`, `film:tape`; `/private/` git-ignored
  and lint-ignored.
- Scorekeeper: `src/film/keeper.tsx`, `src/film/pages/Keep.tsx`, `src/film/components/` (KeepPickers,
  KeepPitch, VoiceBox), `src/film/keeper.css` (scoped under `.film-keep`, colours mapped to the app's theme
  tokens, hand-edited from here on), `src/film/gameWindow.ts`, `src/film/lib/{schedule,voice}.ts`,
  `src/views/film/KeepView.jsx`.
- Live game: `src/views/film/LiveGameView.jsx`, `GoalCelebration.jsx`, `src/film/liveFeed.ts`,
  `src/services/liveGameService.js`; schedule rows link to it and show Keep stats while the window is open.
- Navigation: `utils/navDestinations.js` adds the `stats` destination (views `film`, prefixes `film/`, `live/`)
  and a `phoneTab` flag; `MobileBottomNav` drops Manage; `AppHeader` account menu lists off-tab destinations on
  phones; `App.jsx` adds the `film` nav item; `AppRoutes` adds `/film` → `/film/:effectiveTeamId`.
- Stats page: `views/film/FilmScorekeeper.jsx` (practice run + open scorekeeper, keepers only) under
  `FilmView`. Removed `ScorekeeperSettingsCard` and the Settings section; removed `GameFilmCard` from staff and
  parent Home (kept on the no-players screen).
- i18n: `nav.stats`, `nav.gameFilm`, `film.keeper_*`, `film.kp_*`, `film.live_*` (en/es).

**Schema/API.**

- `sql/keeper_native_migration.sql`: `keeper_entries` (append-only), `keeper_can_keep(team)`, RLS. **Applied.**
- `sql/live_game_migration.sql`: select on `keeper_entries` for team members, `keeper_game_summaries(team)`,
  realtime publication. **Not applied.**
- `sql/keeper_game_window_migration.sql`: `keeper_window_ok`, `keeper_entry_ok`, insert policy limited to the
  game's ±2h window by entry time. **Not applied.**

**Rationale.** The scorekeeper's original screens are kept (about 1,100 lines of tuned touch UI) and re-themed
through CSS variables rather than rewritten in Tailwind. Destinations stay a grouping over routes, so `/film`
URLs and shared links are unchanged.

**Tests.** Added navDestinations cases (Stats label, phone tabs, film/live mapping), keeper, liveFeed and
gameWindow tests. Vitest 1332/1332 pass; lint 0 errors; build passes. Preview screenshots checked at 390px and
landscape in both themes.

**Rollback.** Revert a4e2d62 and b219849. The two unapplied migrations need nothing. To undo
`keeper_native_migration.sql`, drop `keeper_entries` and `keeper_can_keep` (stat entries are lost).

---

## 2026-10-22 — App-run schedule, team chat, phone film and access control (51a594b..0461e48)

**Commits.**

- `51a594b fix: stop team roles from granting themselves club-wide access`
- `255cd36 fix: hide scrollbars on sideways-scrolling tab and chip rows`
- `6bbeac1 feat: rework the game film pages for phones`
- `0461e48 feat: run the schedule in the app and add team chat`

**Touched.**

- SQL: `app_schedule_migration.sql`, `team_chat_migration.sql`, `chat_threads_migration.sql`,
  `chat_admin_oversight_migration.sql`, `fix_access_control_migration.sql` (new)
- Edge functions: `team-calendar` (new, deploy with `--no-verify-jwt`), `notify-push` (+ `excludeUserIds`)
- Scheduling: `utils/eventSeries.js`, `components/EventEditor.jsx`, `EventRsvp.jsx`, `ScheduleSourceCard.jsx`,
  `services/scheduleService.js`, `teamService.js`, `hooks/useSchedule.js`, `views/team/ScheduleView.jsx`,
  `TeamSettingsView.jsx`, `App.jsx`, `AppRoutes.jsx`, `utils/panelRoute.js` (`EVENT_EDITOR`)
- Chat: `views/general/ChatView.jsx`, `context/ChatContext.jsx`, `services/chatService.js`,
  `components/CountBadge.jsx`, `ChatSettingsCard.jsx`, header bubble in `layout/AppHeader.jsx`, `/chat`
  route, `i18n/{en,es}/chat.js`, `utils/pageMeta.js`
- Film: `views/film/*` (score bug, game-only breadcrumb, sections, report rows, compact timeline)
- Scrollbars: `.no-scrollbar` in `index.css`; `PageTabs`, `ContentHeader`, `SettingsShell`,
  `EvaluationSessionDetail`, the schedule filter row
- Preview: `page=schedule&source=app`, `page=chat` with sample data

**Schema/API.**

- `teams.schedule_source` ('feed' | 'app'); `team_events` + `end_date`, `arrival_minutes`, `uniform`,
  `opponent`, `is_home`, `series_id`, `series_detached`, `source`; `team_event_series`, `event_rsvps`,
  `team_calendar_tokens` + `team_calendar_token()`; `schedule_editor_team_ids()`; team_events writes limited to
  schedule editors.
- `team_messages` (+ `thread_id`), `team_chat_reads`, `chat_threads`, `chat_thread_members`,
  `team_chat_settings`; functions `chat_member`, `chat_staff`, `chat_display_name`, `chat_people`,
  `chat_start`, `chat_add_members`, `chat_leave`, `chat_rename`, `chat_close`, `chat_set_policy`,
  `chat_mark_thread_read`, `chat_inbox`, `chat_oversight`, `chat_can_start`, `chat_can_manage`.
- `user_club_ids()` excludes 'parent'/'scorekeeper'; new `can_grant_role()`; rewritten `user_roles`,
  `invitations`, `teams` (insert/update/delete/select), `clubs` (select/update) policies.

**Rationale.** Scheduling reuses `team_events` so the feed and app paths share one event shape; cancelled
upcoming events are re-added only on the schedule screen so other consumers of `events.upcoming` stay
unchanged. Chat names resolve at read time through `chat_display_name()` so corrections apply to history.
Access control was fixed at the `user_club_ids()` root (17 tables) rather than rewriting each policy, then
tightened where even staff shouldn't write.

**Tests.** `vitest run`: 92 files, 1309 tests passing (18 new for `eventSeries`). `npm run build` clean;
ESLint 0 errors. All five migrations run against production in a rolled-back transaction except the first
four already applied; `fix_access_control_migration.sql` + `chat_admin_oversight_migration.sql` dry-run
cleanly with no residue. Phone and desktop screenshots via the preview harness.

**Rollback.** Revert the four commits. Database: the access-control migration is reversible by re-creating
the previous `user_club_ids()` and policies from `rls_policies.sql`; the chat and schedule tables are additive
and can be dropped. Delete `team-calendar` with `supabase functions delete team-calendar`.

---

## 2026-10-22 — Game film inside the manager (ab4c813..ab4c813)

**Commits.** `ab4c813 feat: bring the game film into the manager`

**Touched.**

- `sql/film_native_migration.sql` (new)
- `supabase/functions/film-clip/index.ts` (new edge function, deployed)
- `src/film/` — `schema.ts` and `lib/*.ts` copied from dfc-game-film `app/src`
  (TypeScript, compiled by Vite; not linted by ESLint), `FilmContext.jsx`,
  `RichText.jsx`, `squad.js`, `pages.js`, `lib/film.test.ts`
- `src/views/film/` — `FilmView` (routes + breadcrumbs), `FilmSeason`,
  `FilmLibrary`, `FilmGame`, `FilmMatchReport`, `FilmHighlights`, `filmUi`
- `src/i18n/{en,es}/film.js` (458 strings + 25 event types, `{{x}}` placeholders),
  registered as `film` / `filmEvents`
- `src/services/filmService.js` — `getLibrary`, `isCoach`, `getBreakdowns`,
  `getSquadRows`, `getClipLinks`; `getGames` returns `published`
- `src/components/AppRoutes.jsx` — lazy `/film/:teamId/*`
- `src/components/GameFilmCard.jsx`, `src/views/team/ScheduleView.jsx` — in-app
  links for published games, film-site fallback otherwise
- `src/utils/pageMeta.js` — static pages also match on a deep link's first segment
- `package.json` — `zod` (the film schema); `vitest.config.js` — `src/film/**/*.test.ts`

**Schema/API.**

- New tables, RLS on, all writes by service role except notes:
  `film_teams` (member read), `film_breakdowns` (coach read, FK to `film_games`),
  `film_positions` (coach), `film_lineups` (coach; slug `'*'` = default starters;
  players as `players.id`), `film_notes` (coach CRUD; insert requires
  `author_id = auth.uid()`), `film_ollie_games` (member), `film_ollie_players` (coach).
- `film_games` + `game_time`, `opponent`, `home`, `score_us`, `score_them`, `content jsonb`.
- `grant execute on film_is_coach(uuid) to authenticated` (used in policies).
- Edge function `film-clip`: POST `{ teamId, slug }` → `{ urls, expiresIn }`. Reads
  `film_games` with the caller's JWT (RLS = membership), signs R2 GETs for
  `<team_id>/<slug>/<clip_id>.mp4` via aws4fetch, 3600 s. Secrets: `R2_ENDPOINT`,
  `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- Data is written by dfc-game-film `tools/manager/manager.ts publish` / `move-notes`.

**Rationale.** RLS replaces the client-side AES layer, so the film's data model is
stored as jsonb per game rather than normalised; the pages read it the same way
the old site did. Lineups are stored by player id and mapped back to names in
`squad.js`, so the copied logic stays unchanged and renames in the manager carry
through. `getGames` retries without `content` on `42703`, so schedule links keep
working before the migration.

**Tests.** `vitest run`: 91 files, 1290 tests passing (40 carried-over film logic
tests, 4 for `squadFrom`, 1 page-title test). `npm run build` clean; the film chunk
is ~146 kB (43 kB gzip), lazy.

**Rollback.** Revert `ab4c813`; the schedule and card go back to film-site links
only. The migration is additive: to remove it, drop the seven `film_*` tables
above and the six new `film_games` columns, and
`revoke execute on function film_is_coach(uuid) from authenticated`. Delete the
function with `supabase functions delete film-clip`.

---

## 2026-10-22 — Phone-ready layout, and "Balance" (d6f11bd..b981b70)

**Commits.**

```
b981b70 feat: add a phone theme with pinned tabs and larger touch targets
d6f11bd chore: rename Book Balance to Balance
```

**Touched.**

- New `src/components/layout/PageTabs.jsx` (sticky underline tablist, 44px
  tabs, optional counts). Adopted by `ParentView`, `TeamOverviewView`,
  `ScheduleView` (replaces the segmented control; actions moved above it) and
  `TabContainer` (People).
- `src/index.css`: `--page-tabs-h`, `.page-tabs`, `.sticky-below-tabs`,
  `overflow-x: clip` on `.app-main`, phone-only 16px form controls, a
  `@layer utilities` `.m-bleed` (edge-to-edge below 768px, outranks
  `rounded-lg`), and `@media (hover: none)` showing
  `.opacity-0.group-hover:opacity-100`.
- `ScheduleView`: `ROW_ACTION` (40px) for Add to calendar, Add/Edit score and
  Manage Expenses; the type label is a span for non-editors; month headings use
  `.sticky-below-tabs`.
- `PaymentOptions`: actions on their own row, `PAY` primary (44px), larger copy
  controls. Accessible names unchanged.
- `RosterManagement`: phone-only compliance status and tap-to-call guardian
  link; i18n `rosterMgmt.call` (en/es).
- `m-bleed` on `NextMatchCard`, `AttentionStrip`, `PlayerChecklistCard`, the
  parent season summary and the coach glance card.
- `BulkUploadModal`, `BulkUploadLedgerModal`: preview scrolls on both axes.
- i18n: `nav.bookBalance` and `bookBalance.title` → "Balance" (en and es).

**Schema/API.** None.

**Rationale.** Sticky positioning keeps the existing tab state model; no routing
or URL changes. `overflow-x: clip` (not `hidden`) contains stray width without
creating a scroll container, so sticky descendants still stick. `.m-bleed`
lives in the utilities layer because component-layer rules lose to Tailwind
utilities on the same element.

**Tests.** 1,243 tests pass; `TabContainer.test.jsx` updated to query `tab`
roles. Playwright checks of the preview at 360px and 390px: document scroll
width equals viewport width on Home and Schedule for both roles; remaining
sub-32px targets are the footer link and the staff-only type control (hit area
enlarged). Production build passes.

**Rollback.** `git revert b981b70` restores the previous tab rows and styling;
`git revert d6f11bd` restores the "Book Balance" label. No migrations.

---

## 2026-10-22 — An app for parents and coaches (3fb8f43..918423d)

**Commits.**

```
918423d feat: redesign the app around parents and coaches
3fb8f43 chore: add agent skill configuration docs
```

**Touched.**

- Shell: `AppShell`, `AppHeader` (team/season switcher, destination tabs,
  account menu, `TabBadge`), `ContentHeader` (title + sibling-page pills, no
  breadcrumbs), `AppFooter`, `MobileBottomNav` (one tab bar, add-transaction
  button on Home/Money only). Removed `AppSidebar`, `LayoutContext`,
  `useSidebarState` and its test.
- Navigation: `utils/navDestinations.js` regroups the role/permission-filtered
  nav items into home/schedule/team/money/manage; `hooks/useDestinations.js`;
  `utils/navMemory.js` (per-destination last page, sessionStorage).
- Theme: `utils/teamColor.js` derives fill, edge and AA accent variants per
  theme; `index.css` palette (chalk neutrals, `--primary` from team colour,
  `--team`/`--team-edge`), shell CSS rewritten from the AdminLTE grid;
  `tailwind.config.js` wraps every token in `color-mix(... <alpha-value> ...)`
  and adds `font-numeral` (Big Shoulders Display, new dependency
  `@fontsource-variable/big-shoulders-display`).
- Pages: `NextMatchCard`, `AttentionStrip` + `hooks/useAttention.js` (parent
  paperwork/balance, staff fees dot), `ScheduleView` (month groups, sticky
  headings, `EventRow`, `ScoreChip`, `ScoreEditor`, add-to-calendar,
  subscribe), `ParentView` (single column, season summary, plain tabs),
  `TeamOverviewView` (`GlanceRow` summary), `PlayerChecklistCard` (to-do above
  done), `JerseyBadge` numerals.
- Data: `App.jsx` exposes `scheduleLoading` and `handleTeamEventScore`;
  `scheduleService.updateTeamEventScore` and `scoreFor`/`scoreAgainst` mapping;
  `useSchedule` and calendar views use `hour: 'numeric'`.
- Utilities: `utils/ics.js` (single-event .ics, webcal subscribe URL),
  `utils/roleLabel.js`. i18n keys added to `nav`, `people` (`parent`,
  `overview`, `roles`) and `checklist` in en and es.
- Dev-only: `preview.html` + `src/preview/` (sample data, no auth; not a
  Rollup input). `DESIGN.md` decision log updated.

**Schema/API.** New migration `sql/event_scores_migration.sql`: nullable
`team_events.score_for` / `score_against` (smallint, 0–99 check). Existing
`team_events` RLS covers reads (team + guardians) and writes (team staff).
Calendar sync upserts named columns only, so scores survive re-syncs. Not yet
applied.

**Rationale.** Destinations are a grouping over existing routes rather than new
routes, so permissions, deep links and the panel URLs are untouched. Team-colour
handling is computed in JS once per team change and published as CSS variables,
so components read plain tokens. The opacity fix is made in the Tailwind
config, not per call site, which repairs all existing uses at once.

**Tests.** 1,243 tests across 89 files pass. Added `navDestinations`,
`teamColor`, `ics`, `navMemory` and `roleLabel` unit tests; rewrote
`AppShell.test.jsx`; updated `ParentView` and `TeamOverviewView` tests for the
new layout. Production build passes. Screens were reviewed with Playwright
screenshots of the preview at 390px and 1280px, in light and dark, with white
and gold team colours.

**Rollback.** `git revert 918423d` restores the AdminLTE shell and pages and
removes the font dependency (run `npm install` afterwards). The scores migration
is additive; drop the two columns and the `team_events_score_range` constraint
to reverse it. `3fb8f43` is docs only.

---

## 2026-10-21 — Game film, active season, and Google Calendar feeds (bae8fba..3161127)

**Commits.**

```
3161127 feat: support Google Calendar feeds and keep schedule history
bae8fba feat: add game film, scorekeeper role and team active season
```

**Touched.**

- Game film: `src/services/filmService.js`, `src/components/GameFilmCard.jsx`,
  `src/components/PlayerFilmStats.jsx`; wired into `ParentView`,
  `TeamOverviewView`, `PlayerModal`, `SeasonEvaluationView`, and `ScheduleView`
  (report/highlight links per synced event).
- Roles: `src/utils/roles.js` (`scorekeeper`, `NON_STAFF_ROLES`,
  `TEAM_SET_ACTIVE_SEASON`); `useTeamContext` filters non-staff roles out and
  exposes `scorekeeperTeamIds`.
- Active season: `teamService` (`activeSeasonId`), `useSoccerYear` (default
  applies once per team+season, `teamSeasonsFor`), `TeamSettingsView` season
  card, `AppSidebar` label. Parent load gating is in `src/utils/parentSeason.js`.
  It is driven by the `*LoadedFor` markers in `useAppData`, `useSoccerYear` and
  `useSchedule`.
- Calendar: `supabase/functions/ical-proxy` (new edge function) and
  `src/utils/fetchIcs.js` (direct fetch, then proxy fallback). All feed
  consumers use it (`useSchedule`, `TeamSettingsView`, `TeamOnboarding`,
  `ClubCalendarView`, `PublicCalendarView`). `eventClassifier`
  (`detectFeedSource`, Google rules). `scheduleService.syncTeamEvents` matches
  unknown UIDs to existing rows by start time, and the new
  `pruneStaleUpcomingEvents` deletes upcoming rows the feed no longer lists.
  `useSchedule.mergeSavedEvents` back-fills past events from `team_events`.
  `ScheduleView` matches DB rows by UID, then by start time.

**Schema/API.**

- New tables `film_sites`, `film_games`, `keeper_devices`, `player_season_stats`.
- New columns: `keeper_log.team_id` and `created_by`, `teams.active_season_id`.
- New functions: `film_access`, `film_is_coach`, `film_is_scorekeeper`,
  `film_is_member`, `film_user_can_keep`, `keeper_device_token`, and the
  `keeper_*_as` family.
- New edge function `ical-proxy` (GET `?url=`). It accepts http(s) and webcal,
  caps responses at 5 MB, and returns only bodies containing `BEGIN:VCALENDAR`.
- One-off `sql/dedupe_team_events_2026_10_21.sql` keeps the oldest row per
  (team, start time) and re-points transactions, matchups and budget
  contributions before deleting.

**Rationale.** Browser fetches of Google `.ics` fail CORS. A server-side proxy
was the only fix that didn't involve a provider change. Rows are matched by start
time because a team cannot play two events at once, and keeping the original UID
preserves the `transactions.event_id` and `budget_event_contributions` links.
Pruning skips money-linked rows, because `budget_event_contributions` cascades
on delete and would double-bill on the next push.

**Tests.** Added `filmService`, `PlayerFilmStats`, `useSoccerYear.activeSeason`,
`parentSeason`, `useSchedule.mergeSavedEvents` and Google classifier cases.
The full Vitest suite passes: 84 files, 1,216 tests. The first commit was also
verified on its own (1,209 tests). The classifier was checked against the live
Google feed.

**Rollback.** Revert 3161127 and then bae8fba, and undeploy `ical-proxy`. The
migrations are additive: the new tables and columns can stay, or be dropped
manually. The dedupe script is not reversible once committed. Take a
`team_events` backup before running it.

---

## 2026-08-21 — Sponsors, reconciliation dates, opponent cards, and phone panels (8ab689f..4c466db)

**Commits.**

```
4c466db feat(mobile): give every panel a URL and a full screen on phones
6c9cc4c feat(planner): fold opponent contacts into the matchups they belong to
9aad076 feat(sponsors): keep a sponsor directory alongside the sponsorship money
8ab689f feat(finance): reconcile on the date money moved, not the date it belongs to
```

**Touched.**

- _Cleared date_ — new `src/utils/txDates.js`; `computeBookBalance.js`,
  `parseStatement.js`, `refunds.js`, `services/financeService.js`,
  `components/Ledger.jsx`; new `components/AccountFilterMenu.jsx`.
- _Sponsors_ — new `services/sponsorService.js`, `hooks/useSponsors.js`,
  `utils/sponsors.js`, `components/SponsorDirectory.jsx`,
  `components/SponsorFormModal.jsx`; `views/team/SponsorsView.jsx`,
  `services/supabaseService.js`, `i18n/{en,es}/finance.js`.
- _Planner_ — new `utils/opponentCards.js`, `components/OpponentTeamCard.jsx`,
  `components/MatchupRow.jsx`; `components/MatchupPlanner.jsx`,
  `views/team/PlannerView.jsx`, `i18n/{en,es}/schedule.js`; deleted
  `components/OpponentContactsPanel.jsx`.
- _Panels_ — new `utils/panelRoute.js`, `hooks/usePanelRoute.js`,
  `hooks/useScreenPanel.js`, `hooks/useFinanceViewProps.js`,
  `hooks/usePeopleViewProps.js`, `components/layout/PanelHost.jsx`; `App.jsx`,
  `AppRoutes.jsx`, `layout/AppShell.jsx`, `layout/ResponsiveModal.jsx`,
  `MobileBottomNav.jsx`, `hooks/useModalState.js`, `index.css`, and every view
  and modal that opened a dialog.

**Schema/API.** `transactions.cleared_date` (date, nullable) and
`transactions.sponsor_id` (uuid → `sponsors`, ON DELETE SET NULL). New `sponsors`
table with an `updated_at` trigger, team-scoped, plus the `sponsor-logos` storage
bucket and RLS in `sql/sponsors_migration.sql`. `sql/complete_schema.sql` updated
to match. `sql/backfill_cleared_date.sql` stamps `cleared_date` on rows already
marked cleared.

**Rationale.**

- Panels use `?panel=<name>&panel.<key>=<value>` rather than a path segment. A
  path-segment panel turns each list into a layout route rendering `<Outlet/>`,
  which unmounts the list on open and discards filter/search/scroll state. A
  query param changes location without changing the matched route, so the list
  stays mounted while the panel still gets a shareable URL, reload survival, and
  a history entry for Back.
- `useScreenPanel` keeps the "a panel is presenting full-screen" signal outside
  React, because it travels from a panel deep in the tree to the shell that wraps
  it. It is a count, not a flag, so a form opened over a detail screen restores
  the shell only when the last panel closes. The shell steps aside rather than
  covering itself, keeping the sidebar/header/tab bar out of the accessibility
  tree.
- `ConfirmModal` deliberately stays a card at `z-[1070]`: an alert is not a
  screen the user navigated to, and it must sit above panels that are.
- Opponent cards match on the normalized club name (trimmed, lowercased) because
  matchups carry free-text `opponent_name` while contacts carry `club_name`; card
  colours hash the same key so a club renders identically every time.
- Sponsor figures exclude waterfall credit rows — those are the same money
  landing on player balances and would double every sponsor's total.

**Tests.** New: `utils/txDates.test.js`, `utils/sponsors.test.js`,
`utils/opponentCards.test.js`, `utils/panelRoute.test.js`,
`hooks/usePanelRoute.test.jsx`, `components/panelRouting.test.jsx`,
`components/MatchupPlanner.test.jsx`. Updated across the modal-bearing view
tests. Full suite green: 76 files, 1074 tests passing (`npx vitest run`).

**Rollback.** `git revert 4c466db 6c9cc4c 9aad076 8ab689f` (newest first). The
schema is additive and safe to leave in place — reverted code ignores
`cleared_date` and `sponsor_id`, and `sponsors` becomes an unread table. To undo
the database as well: `DROP TABLE sponsors CASCADE;`, drop the `sponsor-logos`
bucket, and `ALTER TABLE transactions DROP COLUMN cleared_date, DROP COLUMN
sponsor_id;` — destructive; sponsor records and logos are not recoverable after.

---

## 2026-08-20 — Documentation baseline (e99526b..5a33cc6)

**Commits.**

```
5a33cc6 chore(fix): distribution of funds
457de69 chore(deps): refresh browser data lockfile entries
2cde75e feat(field): book the club home field from a shared board
ac32ed8 feat(budget): choose how a forecast rides on an existing budget line
2335a05 refactor(planner): move the planner out of the schedule tabs
f7f3b4f feat(planner): set a matchup's season half and file estimates in bulk
40671b4 feat(budget): attach planned costs to lines you already budgeted
266eff3 fix(ledger): reset the player link when reopening the transaction modal
53d5a19 fix(budget): add row level security policies for budget amendments
53980e0 feat(update): add refund capabilities
e592932 feat(update): add files for help
e99526b feat(update): add help page
```

**Touched.** Baseline entry — no code changed in this push. The range above is
recorded as the opening balance so the first real entry has a predecessor to
anchor against. Per-file detail for these commits was not captured under this
standard and is available only from git.

**Schema/API.** None in this push. Within the baseline range: budget amendment
RLS policies (`53d5a19`), refund support (`53980e0`), and field booking
(`2cde75e`) each carry schema in `sql/`.

**Rationale.** The log starts at the current HEAD rather than being backfilled
across the full history. Backfilled entries would be reconstructions rather than
records, and a document whose early entries are guesses undermines trust in the
later ones that are not.

**Tests.** None required — documentation only. `npm test` (Vitest) is the suite
this repo runs; future entries record its result for the range.

**Rollback.** Delete `docs/living/` and revert section 6 of the global
`CLAUDE.md`. Nothing in the application depends on these files.

**Follow-up.** The push-time enforcement hook
(`~/.claude/hooks/require-living-docs.js`, a PreToolUse/Bash gate that denies
`git push` when the pushed range does not touch `docs/living/`) is written but
not yet installed — the write into the hooks directory was refused by the
permission classifier and needs explicit approval.
