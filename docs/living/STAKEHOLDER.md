# Stakeholder Log — What Changed and Why It Matters

Plain-language record of every change that reaches the repository. Written for
parents, coaches, the board, and anyone else who uses the app but does not build
it. Newest entry first. Entries are never edited or removed — a correction is a
new entry that points back at the old one.

Each entry here has a matching entry, under the same heading, in
[MANAGEMENT.md](MANAGEMENT.md) and [TECHNICAL.md](TECHNICAL.md).

---

## 2026-10-22 — Game film inside the manager (ab4c813..ab4c813)

Game film now lives inside the app, so there are no film passwords to remember.

- **Open it from the team.** The Game film card on the team page (and under
  About in the parent portal) now opens the film right in the app, for everyone
  on the team.
- **Season and library.** See the season at a glance (results, form, when goals
  come, the numbers per game) and a library of every game reviewed.
- **Each game.** Read the match report and watch the highlight clips without
  leaving the app. A trail at the top (Game film › Library › the game) takes you
  back a step at a time.
- **From the schedule.** A game's Match report and Highlights buttons now open
  these pages.
- **Coaches** also see the recurring themes across the season, and who played
  where.
- **Still on the old film site for now:** the play-by-play, unit review, coaches'
  breakdown, player pages and the scorekeeper screen. They move over next.

---

## 2026-10-22 — Phone-ready layout, and "Balance" (d6f11bd..b981b70)

The app now works properly on a phone, which is where most families open it.

- **Tabs stay in reach.** On your child's page, the schedule and the team pages,
  the row of tabs (for example Payments, Paperwork, Details) stays at the top of
  the screen as you scroll, so switching never means scrolling back up. On the
  schedule, the month you are looking at stays in view too.
- **Easier to read and tap.** Lists use the full width of the screen, buttons
  are bigger, and typing in a form no longer makes an iPhone zoom in.
- **Paying from your phone is simpler.** The payment card now has one large
  "Pay" button with the amount on it, and a "QR Code" button beside it.
- **Coaches on the sideline** see each player's paperwork status and a "Call"
  link for a parent, right in the roster.
- **"Book Balance" is now just "Balance"** in the Money section.

---

## 2026-10-22 — An app for parents and coaches (3fb8f43..918423d)

The app has been rebuilt around the people who open it most: parents and
volunteer coaches, usually on a phone. Everything you could do before is still
there; it is just easier to find and easier to read.

- **Simpler navigation.** Instead of a long side menu, there are a few tabs
  along the bottom of your phone (or the top of a computer): Home, Schedule,
  Team, Money and Manage. Parents see only the three that matter to them.
  Club and admin pages are all together under Manage.
- **Your team's colours.** The app now takes on the selected team's colour, so
  it feels like your club's app rather than a generic one.
- **Home answers "when's the next game?" first.** A large card shows the next
  game's day, time and place, with buttons for directions and for adding it to
  your phone's calendar. The next few events are listed underneath.
- **What needs doing comes first.** If a form is overdue or due this week, or a
  balance is owed, a short list at the top of Home says so, with a button to
  finish it. When nothing is due, it does not appear. The Checklist tab shows a
  small number while anything is left to do.
- **A clearer page for each child.** A parent's page now reads top to bottom:
  your child, what is owed this season (with a Pay balance button), what
  paperwork is missing, then payments, paperwork and details.
- **A cleaner schedule.** Games are grouped by month, and the month stays in
  view as you scroll. Each game can be added to your calendar, and a Subscribe
  button keeps the whole team schedule in your phone's calendar. Past games can
  now show the final score, entered by the team's staff.
- **Coaches** get a single "season at a glance" summary of money in the bank,
  budget left and fees collected, each with a link to the page that handles it.

---

## 2026-10-21 — Game film, active season, and Google Calendar feeds (bae8fba..3161127)

Two changes, both visible the next time you open the app.

- **Game film is linked into the app.** Each team's game film site opens from the
  team page and the parent page, already unlocked for your account, with no
  passwords to pass around. Schedule entries link straight to that game's match
  report and highlights. Player profiles, the parent page and season evaluations
  show the season's numbers from the film: minutes, starts, positions, goals,
  assists, shots and cards. Parents see only their own child's numbers. There is
  a new **Scorekeeper** role for whoever keeps live stats. It opens the film's
  stat screen and nothing else, so a parent who keeps stats still sees the
  normal parent page.
- **Teams choose their active season.** The team manager picks the season the
  team is in, and everyone opens the app on it. Parents no longer briefly see last
  season's numbers while the page loads. Staff can still switch seasons in the
  sidebar to budget ahead.
- **Google Calendar schedules work.** A team can now use a public Google Calendar
  link as its schedule. Saving a new link brings in the games right away. Games
  are sorted into tournaments, league games and friendlies/scrimmages from what
  the calendar says about them. Past games stay on the schedule when the link
  changes, and upcoming games the calendar no longer lists drop off. Games that
  have money attached to them are always kept.

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
