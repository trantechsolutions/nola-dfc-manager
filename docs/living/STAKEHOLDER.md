# Stakeholder Log — What Changed and Why It Matters

Plain-language record of every change that reaches the repository. Written for
parents, coaches, the board, and anyone else who uses the app but does not build
it. Newest entry first. Entries are never edited or removed — a correction is a
new entry that points back at the old one.

Each entry here has a matching entry, under the same heading, in
[MANAGEMENT.md](MANAGEMENT.md) and [TECHNICAL.md](TECHNICAL.md).

---

## 2026-08-21 — Sponsors, reconciliation dates, opponent cards, and phone panels (8ab689f..4c466db)

Four changes, all visible the next time you open the app.

- **The app works properly on a phone.** Forms and detail views used to open as a
  small card squeezed over the page behind them, and pressing Back left the app
  instead of closing them. They now open as a full screen, Back closes them, and
  a link you share or a page you reload opens exactly where you were. Closing one
  puts you back in the list where you left it — same filters, same place on the
  page.
- **Sponsors have real records.** A sponsor is no longer just a line of money in
  the ledger. Each one now has contact details, what they pledged, where they are
  in the pipeline, when to ask again, notes, and a logo. Sponsors already in the
  books show up automatically — nothing has to be re-entered.
- **Reconciling against the bank statement adds up.** A payment now records both
  the date it is _for_ and the date the money actually moved. A registration paid
  in August for a November tournament stays a November item in the season's
  books, but reconciles in August where the bank shows it.
- **The planner shows one card per opponent.** The contact list and the fixture
  list used to sit side by side and had to be matched by eye. Every game against
  a club now sits under that club's card with their contact details attached.

---

## 2026-08-20 — Documentation baseline (e99526b..5a33cc6)

This is the starting point for the log, not a change to the app. From here on,
every push adds an entry describing what moved and what it means for you.

Work already in the app as of this baseline:

- **A help section.** Guidance pages you can read inside the app instead of
  asking someone how a screen works.
- **Refunds.** Money paid in can now be given back and the books stay correct.
- **Budget planning.** Planned costs can be attached to a budget line you have
  already set up, so a forecast and the real budget stay connected rather than
  living in two places.
- **A shared board for booking the club home field.** Teams request and see field
  time in one place instead of coordinating by text message.
- **Season-half planning for matchups.** Opponents and cost estimates can be
  filed in bulk rather than one at a time.
- **Fixes** to how a payment is linked to a player when a transaction is
  reopened, and to who is allowed to see budget changes.
