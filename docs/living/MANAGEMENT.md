# Delivery Log — Scope, Decisions, Risk

Running record of what was delivered, what was decided and why, what it cost,
and what remains open. Written for senior management. Newest entry first.
Entries are never edited or removed — a correction is a new entry that points
back at the old one.

Each entry here has a matching entry, under the same heading, in
[STAKEHOLDER.md](STAKEHOLDER.md) and [TECHNICAL.md](TECHNICAL.md).

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
