# Delivery Log — Scope, Decisions, Risk

Running record of what was delivered, what was decided and why, what it cost,
and what remains open. Written for senior management. Newest entry first.
Entries are never edited or removed — a correction is a new entry that points
back at the old one.

Each entry here has a matching entry, under the same heading, in
[STAKEHOLDER.md](STAKEHOLDER.md) and [TECHNICAL.md](TECHNICAL.md).

---

## 2026-10-22 — Game film inside the manager (ab4c813..ab4c813)

**Scope.** First phase of moving the stand-alone game film site into the
manager: database, clip delivery, and the season, library, match report and
highlights pages. 40 files, ~5,350 insertions (about 2,100 of them the film's
existing logic and its tests, carried over unchanged). One commit.

**Decision: drop the film's password encryption.** The film was a public static
site, so every game was encrypted with shared passwords. Inside the manager the
same data is protected by sign-in and the database's per-team access rules, the
same as everything else. Approved by the owner. Removes three shared passwords.

**Decision: clips stay on Cloudflare R2, in a private bucket.** About 726 MB of
video; R2 is free at this size with no download charges, where Supabase's free
storage tier would not fit. Clips are never public: the app hands each viewer a
link that works for one hour, after checking they are on the team.

**Decision: carry the film's logic over unchanged.** Its calculations (season
summary, lineups, naming players at a position) move in as-is with 40 of their
tests, rather than being rewritten, so the numbers match the old site exactly.

**Risk.** Low for existing features: unpublished games still open on the old
site, and nothing existing was removed. The old film site must stay up until the
remaining pages move. Cloud keys were shown in a screenshot during setup and
should be rotated.

**Open.** Play-by-play, unit review, coaches' breakdown, player pages, Ollie
history, coach notes screen, and the scorekeeper (largest piece: offline stat
logging). Then retire the old site and its passwords.

---

## 2026-10-22 — Phone-ready layout, and "Balance" (d6f11bd..b981b70)

**Scope.** A phone pass over the redesigned pages, plus one label change.
17 files, ~250 insertions. Two commits.

**Decision: pin in-page tabs rather than add more navigation.** Long pages on a
phone were the main friction; keeping the existing tabs pinned under the header
fixes it without adding new controls. One shared component now draws every
in-page tab row, so they behave the same everywhere.

**Decision: phone-specific styling, same design system.** Phones get edge-to-
edge lists, 16px form text (which stops iOS zooming into fields) and larger
tap targets through a small set of phone-only rules. No separate mobile app or
second set of components.

**Decision: desk-task pages are contained, not redesigned.** Budget, Balance
and Fundraising keep their desktop tables, scrolling inside their own box on a
phone. A full phone layout for those is deferred until coaches ask for it.

**Risk.** Low. Layout and styling only; no data, schema or permission changes.
Checked in the local preview at 360px and 390px with sample data, not against
live accounts. Two stray Update Log entries from the previous push are still
outstanding, as is the scores migration.

**Open.** Phone layouts for Budget, Balance and Fundraising if needed. Carried
over: run `event_scores_migration.sql`; remove the two stray Update Log rows.

---

## 2026-10-22 — An app for parents and coaches (3fb8f43..918423d)

**Scope.** End-user redesign of the app shell and the four most-visited pages
(Home for parents and coaches, Schedule, parent Checklist), plus a polish pass:
attention strip, tab badges, calendar export and subscribe, game scores,
matchday typeface, and a dev-only design preview. 58 files, ~3,700 insertions,
~2,300 deletions. Agent-skill configuration docs added separately.

**Decision: build for parents and coaches, not administrators.** The previous
AdminLTE console layout showed every page to everyone in four groups that
mirrored the data model. It is replaced by up to five task-based destinations;
admin pages move under Manage. No URLs changed, so links and bookmarks keep
working.

**Decision: the team's colour is the accent.** It makes the app feel like each
club's own. Team colours are picked freely by volunteers, so the app derives
readable variants automatically; white or cream colours fall back to a default
accent for buttons.

**Decision: a second typeface, for numbers only.** Match dates, jersey numbers
and scores use a condensed scoreboard face. This is a deliberate, recorded
exception to the one-font rule in DESIGN.md; money stays in the main font.

**Fixed along the way.** About 82 translucent colour tints across the app had
never rendered because of how colours were configured; they now do, so some
existing screens may look slightly different.

**Risk.** Scores need one database migration (`event_scores_migration.sql`)
before staff can save them; until then saving shows an error and nothing else
is affected. Screens were reviewed only with sample data in a local preview,
not against live accounts. The commit hook logged two discarded commit hashes
to the in-app Update Log; those entries should be removed.

**Open.** Run the scores migration. Remove the two stray Update Log entries.
Continue the page-by-page pass: Team, Money (Budget, Ledger, Fundraising, Book
Balance), Planner, then Manage.

---

## 2026-10-21 — Game film, active season, and Google Calendar feeds (bae8fba..3161127)

**Scope.** Two deliverables: game film integration (film site access, per-player
film stats, scorekeeper role, team active season) and Google Calendar schedule
support with history retention. 44 files, ~1,850 insertions.

**Decision: hand out film keys per role, never passwords.** The film site is
end-to-end encrypted with team, coach and scorekeeper passwords. The database
stores the derived keys once per team and gives each signed-in user only the keys
their role allows. Leaving the app's role then also ends film access.

**Decision: scorekeeper is not a staff role.** Many scorekeepers are parents.
Making the role staff would replace their parent page with the staff app, so it
grants nothing in this app beyond opening the film.

**Decision: proxy calendar feeds server-side.** Google does not allow browsers to
read its calendar feeds directly. A small Supabase function fetches them instead,
and it only ever returns calendar data.

**Decision: the calendar is the source of truth from today forward; the database
keeps history.** Upcoming games removed from the calendar are deleted, but past
games and any game with expenses or budget pushes are never removed. Feed-change
duplicates are matched by start time, so expense links survive a provider switch.

**Risk.** Five migrations must run before deploy (game film, film games, keeper
accounts, player season stats, team active season). The `ical-proxy` edge function
must be deployed, or Google feeds keep failing. A one-off script removes the
duplicate events created by the 2026-10-21 feed switch, keeping the original rows.
It has not been run yet. Film stats come from the separate dfc-game-film tool;
until it writes them, the stats panels show nothing.

**Open.** Run the dedupe script after checking its preview. Deploy `ical-proxy`.
Run the five migrations.

---

## 2026-08-21 — Sponsors, reconciliation dates, opponent cards, and phone panels (8ab689f..4c466db)

**Scope.** Four deliverables: transaction cleared-date split, sponsor directory,
planner opponent cards, and URL-addressable panels with mobile full-screen
presentation. 84 files, ~7,300 insertions / ~3,400 deletions.

**Decision — two dates on a transaction.** The event date (what the money is
for) and the cleared date (when funds moved) were the same field, which made
every reconciliation against a bank statement drift by however long a payment
sat before clearing. They are now separate: season reporting keeps the event
date, reconciliation uses the cleared date. A backfill script is provided for
existing rows, and callers written before the split fall back to the event date,
so nothing has to be rewritten at once.

**Decision — panels in the query string, not the URL path.** A path-segment
panel would require restructuring lists into layout routes, which unmounts the
list when a panel opens and loses filters, search, and scroll position — the
exact defect the change was meant to remove. A query parameter gives the same
shareable, reloadable, Back-closable panel without touching route structure.

**Decision — the sponsor directory seeds itself from the ledger.** Sponsorship
money is already booked before anyone fills in a contact card, so the directory
reads existing deposits rather than starting empty. This avoids a manual
re-keying step that would have made adoption optional in practice.

**Risk.** Two migrations must run before deploy (`sql/sponsors_migration.sql`,
`sql/backfill_cleared_date.sql`), and the sponsor table also needs its storage
bucket. The panel refactor touched nearly every view, which is broad surface
area — mitigated by the full suite passing and by new tests covering the routing
layer directly.

**Effort.** One working session. No timeline or dependency impact.

**Open.**

- Migrations are not yet applied to the production database.
- Spanish locale coverage: finance and schedule strings were added in this
  range; full app coverage is still outstanding.
- Push-time documentation enforcement hook is still not installed (carried from
  the 2026-08-20 baseline entry).

---

## 2026-08-20 — Documentation baseline (e99526b..5a33cc6)

**Scope.** Establishes the three-document reporting standard. No product change.
Prior work is summarized once here as an opening balance rather than
reconstructed entry by entry.

**Decision.** Documentation is produced per _push_, not per commit and not per
release. Rationale: a push is the point at which work leaves the developer's
machine and becomes shared reality, and it is a boundary git can prove — the
commit range is exact, so the record cannot drift from what actually shipped.

**Decision.** Three separate documents rather than one with three sections. A
merged document is read by whoever opens it and written for no one; separate
files let each audience read only their altitude.

**Delivered to date (opening balance).**

| Area                                                  | Status                              |
| ----------------------------------------------------- | ----------------------------------- |
| In-app help section                                   | Shipped                             |
| Refunds                                               | Shipped                             |
| Budget forecast → budget line attachment              | Shipped                             |
| Shared club home field booking board                  | Shipped                             |
| Matchup planner (season half, bulk estimates)         | Shipped, moved out of schedule tabs |
| Ledger player-link fix, budget amendment access rules | Shipped                             |

**Risk.** The standard depends on discipline at push time. A push-time gate is
recommended to make compliance automatic rather than remembered; see the open
item below.

**Open.**

- Push-time enforcement hook is not yet installed (blocked on permission to
  write into the Claude Code hooks directory).
- Prior history before this baseline is summarized, not itemized. If per-change
  detail for earlier work is needed, it must be reconstructed from git.
- Spanish locale coverage remains outstanding across the app.
