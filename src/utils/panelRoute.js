// Panels live in the query string rather than in a path segment, and that is a
// deliberate trade.
//
// A path-segment panel (/finance/ledger/tx/:id) needs the list underneath it to
// become a layout route rendering an <Outlet/>. Every list in this app carries
// state the URL does not — filters, a search box, a scroll offset, an expanded
// row — and restructuring those routes risks unmounting the list when a panel
// opens, which is exactly the "I lost my place" bug the panels were meant to
// avoid. A query param changes the location without changing which route
// matched, so the list stays mounted and keeps everything it was holding.
//
// The panel still gets what routing was for: a shareable URL, a page that
// survives a reload, and a history entry so Back closes it.
//
// Shape:  ?panel=<name>&panel.<key>=<value>
// e.g.    ?panel=tx&panel.id=8f21
//         ?panel=tx&panel.eventId=4a2&panel.amount=125.00   (a prefilled new)

export const PANEL_KEY = 'panel';
export const PANEL_PARAM_PREFIX = 'panel.';

/**
 * Every panel name in the app, in one place.
 *
 * Only one panel is open at a time and the name is global to the URL, so two
 * views picking the same string would be a genuine collision — the wrong panel
 * opening, or two opening at once. Spelled out as constants, that collision is
 * a duplicated value a test can catch rather than a string nobody diffed.
 *
 * ADD_PLAYER and MEDICAL are each shared on purpose: the club roster and the
 * budget's roster gap open the same kind of panel, as do the team roster and
 * the parent view.
 */
export const PANELS = {
  // Global — rendered by AppRoutes on every route
  PLAYER: 'player',
  PLAYER_FORM: 'playerForm',
  TX: 'tx',
  REFUND: 'refund',
  PAYMENT: 'payment',

  // Finance
  DISTRIBUTE: 'distribute',
  RECORD_FUNDS: 'recordFunds',
  NEW_SEASON: 'newSeason',
  IMPORT_LEDGER: 'importLedger',
  STATEMENT: 'statement',
  ACCOUNT: 'account',

  // Roster and people
  ADD_PLAYER: 'addPlayer',
  EDIT_PLAYER: 'editPlayer',
  IMPORT_ROSTER: 'importRoster',
  MEDICAL: 'medical',
  INVITE: 'invite',

  // Schedule and fields
  EVENT_EXPENSE: 'eventExpense',
  BULK_EXPENSES: 'bulkExpenses',
  BOOKING: 'booking',
  CLOSURE: 'closure',

  // Checklists
  CHECKLIST_EDITOR: 'checklistEditor',
  CHECKLIST_CLONE: 'checklistClone',

  // Evaluations
  NEW_SESSION: 'newSession',
  CLUB_PICKER: 'clubPicker',
  GUEST_PICKER: 'guestPicker',
  RUBRIC: 'rubric',

  // Club and app admin
  NEW_TEAM: 'newTeam',
  NEW_CLUB: 'newClub',
};

/**
 * A React key for the component behind a panel, scoped by panel name.
 *
 * The panels are siblings, and several are keyed off `panel.id` so their form
 * state resets when the record changes. Keyed on the bare id they collide the
 * instant one is open — every sibling reading the same id gets the same key,
 * and React starts reusing the wrong component's state. The name keeps them
 * apart; `panelKey` exists so no call site has to remember that.
 */
export function panelKey(name, id) {
  return `${name}:${id || 'new'}`;
}

/** Coerce whatever react-router hands us into a URLSearchParams. */
function toParams(search) {
  if (search instanceof URLSearchParams) return search;
  return new URLSearchParams(search ?? '');
}

/**
 * Read the open panel out of a location's search string.
 *
 * Returns `{ name: null, params: {} }` when no panel is open, so callers can
 * destructure without guarding. Values always come back as strings — the URL
 * has no other type, and a panel that wants a number should parse it.
 */
export function readPanel(search) {
  const params = toParams(search);
  const name = params.get(PANEL_KEY);
  if (!name) return { name: null, params: {} };

  const panelParams = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith(PANEL_PARAM_PREFIX)) {
      panelParams[key.slice(PANEL_PARAM_PREFIX.length)] = value;
    }
  }
  return { name, params: panelParams };
}

/**
 * A new URLSearchParams with `name` open and `params` attached, leaving every
 * non-panel param (a view's own filters, ?admin=1) untouched.
 *
 * Null, undefined and empty values are dropped rather than written as empty
 * strings: `?panel.id=` would read back as a present-but-blank id and send a
 * panel looking for a record that was never named.
 */
export function withPanel(search, name, params = {}) {
  const next = withoutPanel(search);
  next.set(PANEL_KEY, name);

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    next.set(`${PANEL_PARAM_PREFIX}${key}`, String(value));
  }
  return next;
}

/** A new URLSearchParams with the panel and all of its params stripped. */
export function withoutPanel(search) {
  const next = new URLSearchParams(toParams(search));
  next.delete(PANEL_KEY);

  // Collect first: deleting while iterating skips entries.
  const stale = [];
  for (const key of next.keys()) {
    if (key.startsWith(PANEL_PARAM_PREFIX)) stale.push(key);
  }
  stale.forEach((key) => next.delete(key));

  return next;
}

/** True when `search` already has exactly this panel and these params open. */
export function isPanelOpen(search, name, params = {}) {
  const current = readPanel(search);
  if (current.name !== name) return false;

  const wanted = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (Object.keys(current.params).length !== wanted.length) return false;

  return wanted.every(([key, value]) => current.params[key] === String(value));
}
