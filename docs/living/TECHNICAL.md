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
