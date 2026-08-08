// Public marketing page copy (src/views/general/LandingView.jsx).
// Feature/role/step keys are looked up by id — keep the ids in sync with the
// arrays declared in the view.
export default {
  nav: {
    features: 'Features',
    roles: 'Who it is for',
    workflow: 'How it works',
    calendar: 'Public calendar',
    signIn: 'Sign in',
    menu: 'Menu',
  },

  hero: {
    badge: 'Built for U.S. youth soccer',
    title: 'Run the club, not the spreadsheet.',
    subtitle:
      'Cantera Manager keeps your roster, schedule, dues, documents, and parent updates in one place — from the first whistle of the season to the last line of the books.',
    ctaPrimary: 'Sign in to your club',
    ctaSecondary: 'See a public calendar',
    note: 'Works offline · Installs to your home screen · English & Español',
  },

  scoreboard: {
    label: 'Season at a glance',
    live: 'Sample',
    balance: 'Team balance',
    collected: 'Dues collected',
    nextEvent: 'Next event',
    nextEventValue: 'Sat · 9:00 AM · Home',
    compliance: 'Roster cleared',
    playersUnit: '{{done}} of {{total}} players',
    caption: 'Illustrative data — your club sees its own numbers.',
  },

  stats: {
    roles: { value: '8', label: 'permission levels, from club admin down to parent' },
    languages: { value: '2', label: 'languages, switchable per person' },
    offline: { value: '0', label: 'bars of signal required to check the roster' },
    spreadsheets: { value: '1', label: 'place the money actually lives' },
  },

  features: {
    heading: 'Everything a volunteer-run team actually needs',
    sub: 'Nine years of Saturday mornings, group texts, and shoebox receipts — replaced by tools built for exactly this job.',
    ledger: {
      title: 'Ledger & reconciliation',
      body: 'Every dollar in and out, categorized and tied to an account. Import a bank statement, match the lines, and close with a book balance you can defend at the parents meeting.',
    },
    budget: {
      title: 'Budgets that do the math',
      body: 'Build the season budget once. Per-player fees, waivers, and remaining balances recalculate themselves — and a forecast learns from your past seasons.',
    },
    fundraising: {
      title: 'Fundraising & sponsors',
      body: 'Record a sponsor check, then waterfall it down player balances or split it evenly. Every distribution is reversible and shows its work.',
    },
    schedule: {
      title: 'A schedule that syncs itself',
      body: 'Subscribe to your Ollie Sports, TeamSnap, or Google Calendar feed. Games, practices, and tournaments classify themselves, and blackout dates keep the field clear.',
    },
    matchups: {
      title: 'Friendlies without the group text',
      body: 'Keep opponent contacts on file, propose a date, confirm or reschedule, and hand the other coach a public availability link instead of forty replies.',
    },
    roster: {
      title: 'Roster & compliance',
      body: 'Players, guardians, jersey numbers, age groups. Documents tracked with expiration alerts, and medical releases generated as a filled PDF in English or Spanish.',
    },
    parents: {
      title: 'A portal parents understand',
      body: "Parents see one thing: their own child. Balance, what is due, how to pay, and Saturday's schedule. No invite codes — guardians are matched by email.",
    },
    evaluations: {
      title: 'Player evaluations',
      body: 'Score the season on a rubric you control. Each coach evaluates independently, and every player leaves with something written down.',
    },
    insights: {
      title: 'Insights worth acting on',
      body: 'Collection rate, expense trends, and budget burn — so you find out in October that dues are behind, not in May.',
    },
  },

  roles: {
    heading: 'Everyone on the sideline gets their own view',
    sub: 'Same data, same login. What you see is decided by the job you actually do.',
    manager: {
      title: 'Managers & coaches',
      body: 'The whole team in one screen — who is on the roster, who is cleared to play, and what is happening this week.',
      p1: 'Roster, jerseys, and age groups',
      p2: 'Schedule editing and calendar sync',
      p3: 'Documents and compliance status',
    },
    treasurer: {
      title: 'Treasurers',
      body: 'Spreadsheet-grade clarity with an audit trail, built for the person who has to answer for the number.',
      p1: 'Ledger, categories, and accounts',
      p2: 'Statement import and reconciliation',
      p3: 'Budgets, waivers, and fee math',
    },
    parent: {
      title: 'Parents',
      body: 'Open it on the way to the field. One tap to the only three things you needed to know.',
      p1: 'Your balance and what is due',
      p2: 'How to pay, with a QR code',
      p3: "Your child's schedule and forms",
    },
  },

  workflow: {
    heading: 'From the first whistle to the last line of the books',
    step1: {
      title: 'Set the season',
      body: 'Create the season, import the roster from a CSV, then set fees and waivers once.',
    },
    step2: {
      title: 'Sync the calendar',
      body: 'Paste your league feed. Games, practices, and tournaments sort themselves out.',
    },
    step3: {
      title: 'Collect and record',
      body: 'Log dues, sponsor checks, and event costs. Parents see the change the moment you save.',
    },
    step4: {
      title: 'Close the books',
      body: 'Import the bank statement, reconcile, and export the season as a clean record.',
    },
  },

  touchline: {
    heading: 'Built for the touchline, not the office',
    sub: 'The field has bad reception, your hands are full, and kickoff is in four minutes. It was designed for that.',
    offline: {
      title: 'Offline first',
      body: 'Rosters and schedules stay readable with no signal. Edits queue up and sync the moment you are back.',
    },
    install: {
      title: 'Installs like an app',
      body: 'Add it to the home screen on iPhone or Android, and get a push when something needs you.',
    },
    bilingual: {
      title: 'English & Español',
      body: 'Every screen and both medical release templates are translated. Each family picks their own language.',
    },
    secure: {
      title: 'Locked down by role',
      body: 'Permissions are enforced at the database, not just hidden in the UI. One family can never see another family’s balance.',
    },
  },

  calendarCta: {
    title: 'Scheduling a friendly? Send a link, not a thread.',
    body: 'Your team’s availability, shareable with any coach — no account, no login, and no event details given away.',
    button: 'Open the public calendar',
  },

  finalCta: {
    title: 'Get your club off the spreadsheet.',
    body: 'Sign in with the account your club set up, or create a parent account to follow your own player.',
    primary: 'Sign in',
    secondary: 'Create a parent account',
  },

  footer: {
    tagline: 'Youth soccer club operations — roster, schedule, money, and compliance in one place.',
    product: 'Product',
    account: 'Account',
    changelog: 'Changelog',
    rights: 'All rights reserved.',
  },
};
