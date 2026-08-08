// src/utils/checklist.js
// Shape, validation, and progress maths for season checklists.
//
// A checklist belongs to exactly one (team, season) pair. Its items are an
// ordered array of plain objects persisted as jsonb — see
// sql/season_checklists_migration.sql for the stored shape.

export const CHECKLIST_ITEM_TYPES = {
  CHECK: 'check',
  ACK: 'ack',
  TEXT: 'text',
  DATE: 'date',
  LINK: 'link',
  FILE: 'file',
};

export const ITEM_TYPE_ORDER = [
  CHECKLIST_ITEM_TYPES.CHECK,
  CHECKLIST_ITEM_TYPES.ACK,
  CHECKLIST_ITEM_TYPES.TEXT,
  CHECKLIST_ITEM_TYPES.DATE,
  CHECKLIST_ITEM_TYPES.LINK,
  CHECKLIST_ITEM_TYPES.FILE,
];

export const CHECKLIST_AUDIENCE = {
  PARENT: 'parent',
  ADMIN: 'admin',
};

/**
 * LINKED FORMS — in-app flows that complete a checklist item on their own.
 *
 * An item carrying `linkedForm` is never ticked by hand: its completion is read
 * from whatever the form already records, so finishing the medical release marks
 * the item done wherever it appears, including for players who completed the
 * form before the item existed.
 *
 * Registry rather than a boolean so a second automated form is one entry here
 * plus a `forms` key from the caller. The editor renders a checkbox while this
 * has a single member — swap it for a select when it grows.
 */
export const CHECKLIST_FORMS = {
  MEDICAL_RELEASE: 'medical_release',
};

export const LINKED_FORM_KEYS = Object.values(CHECKLIST_FORMS);

/** Is this item driven by an in-app form rather than a manual tick? */
export function isFormItem(item) {
  return Boolean(item?.linkedForm) && LINKED_FORM_KEYS.includes(item.linkedForm);
}

/** Items a parent is asked to action. `admin` items are staff-tracked only. */
export function isParentItem(item) {
  return (item?.audience ?? CHECKLIST_AUDIENCE.PARENT) === CHECKLIST_AUDIENCE.PARENT;
}

/** Types whose completion requires the parent to supply something. */
export function itemNeedsValue(item) {
  return item?.type === CHECKLIST_ITEM_TYPES.TEXT || item?.type === CHECKLIST_ITEM_TYPES.DATE;
}

export function itemNeedsFile(item) {
  return item?.type === CHECKLIST_ITEM_TYPES.FILE;
}

export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

/**
 * Give every item a stable, unique key and drop anything malformed.
 *
 * Keys are what responses join on, so an existing key is always preserved —
 * only new or colliding items get a fresh one. Renaming an item's label
 * therefore keeps every response already recorded against it.
 */
export function normalizeItems(items) {
  const taken = new Set();
  const claim = (base) => {
    const root = slugify(base) || 'item';
    let key = root;
    let suffix = 1;
    while (taken.has(key)) {
      suffix += 1;
      key = `${root}_${suffix}`;
    }
    taken.add(key);
    return key;
  };

  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const key = item.key && !taken.has(item.key) ? (taken.add(item.key), item.key) : claim(item.label);
      const type = ITEM_TYPE_ORDER.includes(item.type) ? item.type : CHECKLIST_ITEM_TYPES.CHECK;
      return {
        key,
        label: String(item.label ?? '').trim(),
        description: String(item.description ?? '').trim(),
        type,
        url: type === CHECKLIST_ITEM_TYPES.LINK ? String(item.url ?? '').trim() : '',
        audience: item.audience === CHECKLIST_AUDIENCE.ADMIN ? CHECKLIST_AUDIENCE.ADMIN : CHECKLIST_AUDIENCE.PARENT,
        required: item.required !== false,
        requiresVerification: item.requiresVerification === true,
        dueDate: item.dueDate || null,
        linkedForm: LINKED_FORM_KEYS.includes(item.linkedForm) ? item.linkedForm : null,
      };
    });
}

/** A blank item for the editor's "Add item" button. */
export function createItem(overrides = {}) {
  return {
    key: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    description: '',
    type: CHECKLIST_ITEM_TYPES.CHECK,
    url: '',
    audience: CHECKLIST_AUDIENCE.PARENT,
    required: true,
    requiresVerification: false,
    dueDate: null,
    linkedForm: null,
    ...overrides,
  };
}

/**
 * Reject a list the parent side could not answer. Returns null when valid,
 * otherwise `{ index, reason }` so the editor can point at the offending row.
 */
export function validateItems(items) {
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!String(item.label || '').trim()) return { index: i, reason: 'label' };
    if (item.type === CHECKLIST_ITEM_TYPES.LINK && !String(item.url || '').trim()) {
      return { index: i, reason: 'url' };
    }
  }
  return null;
}

/**
 * Has the parent done their part on this item?
 *
 * `forms` is the caller's map of linked-form completion for this player, e.g.
 * `{ medical_release: true }`. A linked-form item ignores its response row
 * entirely — the form is the record, so a player who filled it in before the
 * item was authored still reads as done.
 */
function isAnswered(item, response, forms) {
  if (isFormItem(item)) return forms?.[item.linkedForm] === true;
  if (!response?.completed) return false;
  if (itemNeedsValue(item) && !String(response.value ?? '').trim()) return false;
  if (itemNeedsFile(item) && !response.documentId) return false;
  return true;
}

/** Has this item been satisfied — answered, and signed off if it needs to be? */
export function isItemSatisfied(item, response, forms) {
  if (!isAnswered(item, response, forms)) return false;
  if (item?.requiresVerification && !response?.verified) return false;
  return true;
}

/** Awaiting a staff sign-off: the parent did their part but nobody confirmed it. */
export function isAwaitingVerification(item, response, forms) {
  if (!item?.requiresVerification) return false;
  if (!isAnswered(item, response, forms)) return false;
  return !response?.verified;
}

/**
 * Can staff cycle this cell from the admin matrix?
 *
 * Text/date/file items are satisfied by what the parent actually supplies, so a
 * staff tick could never complete one — the only staff move on them is the
 * sign-off, and only once the parent has answered. Returning false here keeps
 * bulk edit from staging changes that could never take effect.
 */
export function canStaffCycle(item, response, forms) {
  // Linked-form items are owned by the form; the only staff move is the sign-off.
  if (isFormItem(item) || itemNeedsValue(item) || itemNeedsFile(item)) {
    return item?.requiresVerification === true && isAnswered(item, response, forms);
  }
  return true;
}

/**
 * The state a cell moves to when staff click it:
 * not done → done → confirmed (only if the item needs it) → not done.
 *
 * Pure so the live path and the staged bulk path share one definition of the
 * cycle rather than each implementing their own.
 */
export function nextCellState(item, response) {
  const completed = response?.completed === true;
  const verified = response?.verified === true;

  // Form-linked and value-bearing items only toggle the sign-off (see canStaffCycle).
  if (isFormItem(item) || itemNeedsValue(item) || itemNeedsFile(item)) {
    return { completed, verified: !verified };
  }
  if (!completed) return { completed: true, verified: false };
  if (item?.requiresVerification && !verified) return { completed: true, verified: true };
  return { completed: false, verified: false };
}

export function isOverdue(item, response, today = new Date(), forms) {
  if (!item?.dueDate || isItemSatisfied(item, response, forms)) return false;
  // Compare date-only so an item is not "overdue" for the whole of its due day.
  const due = new Date(`${item.dueDate}T23:59:59`);
  return !Number.isNaN(due.getTime()) && due.getTime() < today.getTime();
}

/**
 * Progress for one player.
 *
 * `pct` and `complete` track REQUIRED items only — an optional item should never
 * hold a player at 90%. Optional items still show in `outstanding` so the parent
 * can see there is more to do.
 *
 * `complete` is also the player's compliance for the season: a player is in
 * compliance exactly when every required item is satisfied (see isPlayerCompliant).
 *
 * @param {object} [opts]
 * @param {Date}   [opts.today]  clock injection for overdue maths
 * @param {object} [opts.forms]  linked-form completion, e.g. `{ medical_release: true }`
 */
export function computePlayerProgress(items, responsesByKey = {}, opts = {}) {
  // Historically the third argument was `today`. Accept a bare Date so older
  // call sites keep working rather than silently reading undefined.
  const { today = new Date(), forms = {} } = opts instanceof Date ? { today: opts } : opts;

  const list = normalizeItems(items);
  const required = list.filter((item) => item.required);
  const done = required.filter((item) => isItemSatisfied(item, responsesByKey[item.key], forms)).length;
  const outstanding = list.filter((item) => !isItemSatisfied(item, responsesByKey[item.key], forms));

  return {
    total: list.length,
    requiredTotal: required.length,
    requiredDone: done,
    // A list with no required items is complete by definition, not 0%.
    pct: required.length === 0 ? 100 : Math.round((done / required.length) * 100),
    complete: done === required.length,
    outstanding,
    overdue: outstanding.filter((item) => isOverdue(item, responsesByKey[item.key], today, forms)),
    awaitingVerification: list.filter((item) => isAwaitingVerification(item, responsesByKey[item.key], forms)),
  };
}

/**
 * Season compliance for one player: every REQUIRED checklist item satisfied.
 *
 * This is the single definition the roster badges, team dashboard, and club
 * dashboard all read. A season with no checklist — or one whose items are all
 * optional — has nothing outstanding, so the player is compliant rather than
 * flagged; a brand-new season should not paint the roster red before an admin
 * has authored anything.
 */
export function isPlayerCompliant(items, responsesByKey = {}, forms = {}) {
  return computePlayerProgress(items, responsesByKey, { forms }).complete;
}

/**
 * Build the `forms` map for one player from their season profile.
 *
 * The medical release already has a source of truth — the per-season compliance
 * flag that MedicalReleaseForm sets — so a linked item reads that rather than
 * keeping a second copy in checklist_responses that could drift from it.
 */
export function formStatusForPlayer(player, seasonId) {
  const profile = (seasonId && player?.seasonProfiles?.[seasonId]) || {};
  return { [CHECKLIST_FORMS.MEDICAL_RELEASE]: profile.medicalRelease === true };
}

/** Same, keyed by player id, for the roster-wide roll-ups. */
export function formStatusByPlayer(players = [], seasonId) {
  const map = {};
  for (const player of players) {
    map[player.id] = formStatusForPlayer(player, seasonId);
  }
  return map;
}

/**
 * Index a flat response array into `{ [playerId]: { [itemKey]: response } }`
 * so progress maths is a lookup rather than a scan per player.
 */
export function indexResponses(responses = []) {
  const byPlayer = {};
  for (const response of responses) {
    if (!response?.playerId || !response?.itemKey) continue;
    (byPlayer[response.playerId] ||= {})[response.itemKey] = response;
  }
  return byPlayer;
}

/**
 * Roll-up for the admin view: per-item completion counts across the roster plus
 * the headline "N of M players finished".
 */
export function computeChecklistSummary(items, players = [], responses = [], opts = {}) {
  const { today = new Date(), formsByPlayer = {} } = opts instanceof Date ? { today: opts } : opts;

  const list = normalizeItems(items);
  const byPlayer = indexResponses(responses);

  const perItem = list.map((item) => {
    let completed = 0;
    let awaiting = 0;
    for (const player of players) {
      const response = byPlayer[player.id]?.[item.key];
      const forms = formsByPlayer[player.id] || {};
      if (isItemSatisfied(item, response, forms)) completed += 1;
      else if (isAwaitingVerification(item, response, forms)) awaiting += 1;
    }
    return {
      item,
      completed,
      awaiting,
      outstanding: players.length - completed,
      pct: players.length === 0 ? 0 : Math.round((completed / players.length) * 100),
    };
  });

  const progressByPlayer = {};
  let playersComplete = 0;
  for (const player of players) {
    const progress = computePlayerProgress(list, byPlayer[player.id] || {}, {
      today,
      forms: formsByPlayer[player.id] || {},
    });
    progressByPlayer[player.id] = progress;
    if (progress.complete) playersComplete += 1;
  }

  return {
    items: list,
    perItem,
    progressByPlayer,
    playersComplete,
    playerCount: players.length,
    pct: players.length === 0 ? 0 : Math.round((playersComplete / players.length) * 100),
  };
}
