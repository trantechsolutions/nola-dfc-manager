import { describe, it, expect } from 'vitest';
import {
  CHECKLIST_ITEM_TYPES,
  CHECKLIST_AUDIENCE,
  slugify,
  normalizeItems,
  createItem,
  validateItems,
  isItemSatisfied,
  isAwaitingVerification,
  isOverdue,
  canStaffCycle,
  nextCellState,
  isParentItem,
  isFormItem,
  isPlayerCompliant,
  formStatusForPlayer,
  CHECKLIST_FORMS,
  indexResponses,
  computePlayerProgress,
  computeChecklistSummary,
} from '../../utils/checklist';

const item = (overrides = {}) => ({
  key: 'k',
  label: 'Task',
  description: '',
  type: CHECKLIST_ITEM_TYPES.CHECK,
  url: '',
  audience: CHECKLIST_AUDIENCE.PARENT,
  required: true,
  requiresVerification: false,
  dueDate: null,
  ...overrides,
});

describe('slugify', () => {
  it('lowercases and underscores a label', () => {
    expect(slugify('Order Your Uniform!')).toBe('order_your_uniform');
  });

  it('returns an empty string for junk input', () => {
    expect(slugify('   ')).toBe('');
    expect(slugify(null)).toBe('');
  });
});

describe('normalizeItems', () => {
  it('preserves an existing key so recorded responses stay attached', () => {
    const [normalized] = normalizeItems([{ key: 'uniform_order', label: 'Renamed task' }]);
    expect(normalized.key).toBe('uniform_order');
    expect(normalized.label).toBe('Renamed task');
  });

  it('derives a key from the label when one is missing', () => {
    const [normalized] = normalizeItems([{ label: 'Pay the deposit' }]);
    expect(normalized.key).toBe('pay_the_deposit');
  });

  it('de-duplicates colliding keys', () => {
    const keys = normalizeItems([{ label: 'Sign form' }, { label: 'Sign form' }, { label: 'Sign form' }]).map(
      (i) => i.key,
    );
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toBe('sign_form');
  });

  it('falls back to a checkbox for an unknown type', () => {
    expect(normalizeItems([{ label: 'x', type: 'wat' }])[0].type).toBe(CHECKLIST_ITEM_TYPES.CHECK);
  });

  it('drops the url on a non-link item', () => {
    expect(normalizeItems([{ label: 'x', type: 'check', url: 'https://e.com' }])[0].url).toBe('');
  });

  it('defaults required to true and verification to false', () => {
    const [normalized] = normalizeItems([{ label: 'x' }]);
    expect(normalized.required).toBe(true);
    expect(normalized.requiresVerification).toBe(false);
    expect(normalized.audience).toBe(CHECKLIST_AUDIENCE.PARENT);
  });

  it('survives a non-array or malformed entry', () => {
    expect(normalizeItems(null)).toEqual([]);
    expect(normalizeItems([null, 'nope', { label: 'ok' }])).toHaveLength(1);
  });
});

describe('createItem', () => {
  it('mints a unique key each time', () => {
    expect(createItem().key).not.toBe(createItem().key);
  });
});

describe('validateItems', () => {
  it('accepts a well-formed list', () => {
    expect(validateItems([item(), item({ key: 'l', type: 'link', url: 'https://e.com' })])).toBeNull();
  });

  it('reports the index of an item with no label', () => {
    expect(validateItems([item(), item({ key: 'b', label: '  ' })])).toEqual({ index: 1, reason: 'label' });
  });

  it('reports a link item with no url', () => {
    expect(validateItems([item({ type: 'link', url: '' })])).toEqual({ index: 0, reason: 'url' });
  });
});

describe('isItemSatisfied', () => {
  it('is false with no response at all', () => {
    expect(isItemSatisfied(item(), undefined)).toBe(false);
  });

  it('is true for a completed checkbox', () => {
    expect(isItemSatisfied(item(), { completed: true })).toBe(true);
  });

  it('requires a value for a text item', () => {
    const textItem = item({ type: CHECKLIST_ITEM_TYPES.TEXT });
    expect(isItemSatisfied(textItem, { completed: true, value: '   ' })).toBe(false);
    expect(isItemSatisfied(textItem, { completed: true, value: 'S' })).toBe(true);
  });

  it('requires an uploaded document for a file item', () => {
    const fileItem = item({ type: CHECKLIST_ITEM_TYPES.FILE });
    expect(isItemSatisfied(fileItem, { completed: true })).toBe(false);
    expect(isItemSatisfied(fileItem, { completed: true, documentId: 'doc-1' })).toBe(true);
  });

  it('withholds completion until staff confirm a verified item', () => {
    const verifyItem = item({ requiresVerification: true });
    expect(isItemSatisfied(verifyItem, { completed: true })).toBe(false);
    expect(isItemSatisfied(verifyItem, { completed: true, verified: true })).toBe(true);
  });
});

describe('isAwaitingVerification', () => {
  it('flags a completed item that still needs sign-off', () => {
    expect(isAwaitingVerification(item({ requiresVerification: true }), { completed: true })).toBe(true);
  });

  it('does not flag an item that needs no sign-off', () => {
    expect(isAwaitingVerification(item(), { completed: true })).toBe(false);
  });

  it('does not flag a text item whose answer is still blank', () => {
    const textItem = item({ type: CHECKLIST_ITEM_TYPES.TEXT, requiresVerification: true });
    expect(isAwaitingVerification(textItem, { completed: true, value: '' })).toBe(false);
  });
});

describe('linked-form items', () => {
  const medical = item({ key: 'med', label: 'Medical Release', linkedForm: CHECKLIST_FORMS.MEDICAL_RELEASE });
  const DONE = { [CHECKLIST_FORMS.MEDICAL_RELEASE]: true };
  const NOT_DONE = { [CHECKLIST_FORMS.MEDICAL_RELEASE]: false };

  it('round-trips the linkedForm key through normalizeItems', () => {
    const [normalized] = normalizeItems([{ label: 'Medical', linkedForm: CHECKLIST_FORMS.MEDICAL_RELEASE }]);
    expect(normalized.linkedForm).toBe(CHECKLIST_FORMS.MEDICAL_RELEASE);
    expect(isFormItem(normalized)).toBe(true);
  });

  it('drops an unrecognised form key rather than trusting it', () => {
    expect(normalizeItems([{ label: 'x', linkedForm: 'not_a_form' }])[0].linkedForm).toBeNull();
  });

  it('reads completion from the form, not from a response row', () => {
    // The whole point: a player who filled the form in before this item was
    // authored has no response row at all, and must still read as done.
    expect(isItemSatisfied(medical, undefined, DONE)).toBe(true);
    expect(isItemSatisfied(medical, undefined, NOT_DONE)).toBe(false);
  });

  it('ignores a response row that disagrees with the form', () => {
    expect(isItemSatisfied(medical, { completed: true }, NOT_DONE)).toBe(false);
    expect(isItemSatisfied(medical, { completed: false }, DONE)).toBe(true);
  });

  it('still honours a required sign-off on top of the form', () => {
    const verified = { ...medical, requiresVerification: true };
    expect(isItemSatisfied(verified, undefined, DONE)).toBe(false);
    expect(isAwaitingVerification(verified, undefined, DONE)).toBe(true);
    expect(isItemSatisfied(verified, { verified: true }, DONE)).toBe(true);
  });

  it('never lets staff tick it by hand', () => {
    expect(canStaffCycle(medical, undefined, DONE)).toBe(false);
    expect(canStaffCycle(medical, undefined, NOT_DONE)).toBe(false);
  });

  it('lets staff sign it off once the form is in', () => {
    const verified = { ...medical, requiresVerification: true };
    expect(canStaffCycle(verified, undefined, NOT_DONE)).toBe(false);
    expect(canStaffCycle(verified, undefined, DONE)).toBe(true);
  });

  it('counts toward progress and compliance from the form alone', () => {
    const items = [medical, item({ key: 'other', label: 'Other' })];
    expect(isPlayerCompliant(items, { other: { completed: true } }, DONE)).toBe(true);
    expect(isPlayerCompliant(items, { other: { completed: true } }, NOT_DONE)).toBe(false);
  });
});

describe('formStatusForPlayer', () => {
  it("reads the season profile's medical release flag", () => {
    const player = { seasonProfiles: { '2025-26': { medicalRelease: true } } };
    expect(formStatusForPlayer(player, '2025-26')).toEqual({ [CHECKLIST_FORMS.MEDICAL_RELEASE]: true });
  });

  it('is false for a season the player has no profile for', () => {
    const player = { seasonProfiles: { '2025-26': { medicalRelease: true } } };
    expect(formStatusForPlayer(player, '2026-27')).toEqual({ [CHECKLIST_FORMS.MEDICAL_RELEASE]: false });
    expect(formStatusForPlayer(undefined, '2025-26')).toEqual({ [CHECKLIST_FORMS.MEDICAL_RELEASE]: false });
  });
});

describe('isPlayerCompliant', () => {
  it('is true once every required item is satisfied', () => {
    const items = [item({ key: 'a' }), item({ key: 'b', required: false })];
    expect(isPlayerCompliant(items, {})).toBe(false);
    expect(isPlayerCompliant(items, { a: { completed: true } })).toBe(true);
  });

  it('treats a season with no checklist as compliant, not as a red roster', () => {
    expect(isPlayerCompliant([], {})).toBe(true);
    expect(isPlayerCompliant(undefined, {})).toBe(true);
  });

  it('ignores optional items entirely', () => {
    const items = [item({ key: 'a', required: false }), item({ key: 'b', required: false })];
    expect(isPlayerCompliant(items, {})).toBe(true);
  });
});

describe('canStaffCycle', () => {
  it('lets staff cycle a plain checkbox', () => {
    expect(canStaffCycle(item(), undefined)).toBe(true);
  });

  it('refuses a text item — a staff tick could never satisfy it', () => {
    // isItemSatisfied demands a value, so allowing the click would leave the
    // cell looking stuck on "incomplete" no matter how often it was pressed.
    expect(canStaffCycle(item({ type: CHECKLIST_ITEM_TYPES.TEXT }), undefined)).toBe(false);
    expect(canStaffCycle(item({ type: CHECKLIST_ITEM_TYPES.FILE }), undefined)).toBe(false);
  });

  it('allows the sign-off on a text item the parent has already answered', () => {
    const verifyText = item({ type: CHECKLIST_ITEM_TYPES.TEXT, requiresVerification: true });
    expect(canStaffCycle(verifyText, { completed: false })).toBe(false);
    expect(canStaffCycle(verifyText, { completed: true, value: 'S' })).toBe(true);
  });
});

describe('nextCellState', () => {
  it('cycles not done → done → not done when no sign-off is needed', () => {
    expect(nextCellState(item(), undefined)).toEqual({ completed: true, verified: false });
    expect(nextCellState(item(), { completed: true })).toEqual({ completed: false, verified: false });
  });

  it('inserts the confirmed step for an item that requires it', () => {
    const v = item({ requiresVerification: true });
    expect(nextCellState(v, undefined)).toEqual({ completed: true, verified: false });
    expect(nextCellState(v, { completed: true })).toEqual({ completed: true, verified: true });
    expect(nextCellState(v, { completed: true, verified: true })).toEqual({ completed: false, verified: false });
  });

  it('only toggles the sign-off on a value-bearing item', () => {
    const textItem = item({ type: CHECKLIST_ITEM_TYPES.TEXT, requiresVerification: true });
    const answered = { completed: true, value: 'S' };
    expect(nextCellState(textItem, answered)).toEqual({ completed: true, verified: true });
    expect(nextCellState(textItem, { ...answered, verified: true })).toEqual({ completed: true, verified: false });
  });

  it('round-trips back to the starting state', () => {
    const v = item({ requiresVerification: true });
    let state;
    state = nextCellState(v, undefined);
    state = nextCellState(v, state);
    state = nextCellState(v, state);
    expect(state).toEqual({ completed: false, verified: false });
  });
});

describe('isOverdue', () => {
  const today = new Date('2026-08-07T12:00:00');

  it('is false with no due date', () => {
    expect(isOverdue(item(), undefined, today)).toBe(false);
  });

  it('is false on the due day itself', () => {
    expect(isOverdue(item({ dueDate: '2026-08-07' }), undefined, today)).toBe(false);
  });

  it('is true the day after', () => {
    expect(isOverdue(item({ dueDate: '2026-08-06' }), undefined, today)).toBe(true);
  });

  it('is false once the item is done, however late', () => {
    expect(isOverdue(item({ dueDate: '2020-01-01' }), { completed: true }, today)).toBe(false);
  });
});

describe('isParentItem', () => {
  it('treats a missing audience as parent-facing', () => {
    expect(isParentItem({ label: 'x' })).toBe(true);
    expect(isParentItem(item({ audience: CHECKLIST_AUDIENCE.ADMIN }))).toBe(false);
  });
});

describe('indexResponses', () => {
  it('buckets responses by player then item key', () => {
    const index = indexResponses([
      { playerId: 'p1', itemKey: 'a', completed: true },
      { playerId: 'p1', itemKey: 'b', completed: false },
      { playerId: 'p2', itemKey: 'a', completed: true },
    ]);
    expect(index.p1.a.completed).toBe(true);
    expect(index.p2.a.completed).toBe(true);
    expect(index.p1.b.completed).toBe(false);
  });

  it('skips rows missing an id or key', () => {
    expect(indexResponses([{ itemKey: 'a' }, { playerId: 'p1' }, null])).toEqual({});
  });
});

describe('computePlayerProgress', () => {
  const items = [
    item({ key: 'a', label: 'A' }),
    item({ key: 'b', label: 'B' }),
    item({ key: 'c', label: 'C', required: false }),
  ];

  it('counts only required items toward the percentage', () => {
    const progress = computePlayerProgress(items, { a: { completed: true } });
    expect(progress.requiredTotal).toBe(2);
    expect(progress.requiredDone).toBe(1);
    expect(progress.pct).toBe(50);
    expect(progress.complete).toBe(false);
  });

  it('is complete once every required item is done, optional or not', () => {
    const progress = computePlayerProgress(items, { a: { completed: true }, b: { completed: true } });
    expect(progress.complete).toBe(true);
    expect(progress.pct).toBe(100);
    // The optional item is still listed as outstanding.
    expect(progress.outstanding.map((i) => i.key)).toEqual(['c']);
  });

  it('treats a list with no required items as complete rather than 0%', () => {
    const progress = computePlayerProgress([item({ key: 'c', required: false })], {});
    expect(progress.pct).toBe(100);
    expect(progress.complete).toBe(true);
  });

  it('reports overdue and awaiting-verification items separately', () => {
    const today = new Date('2026-08-07T12:00:00');
    const progress = computePlayerProgress(
      [item({ key: 'late', dueDate: '2026-01-01' }), item({ key: 'pending', requiresVerification: true })],
      { pending: { completed: true } },
      today,
    );
    expect(progress.overdue.map((i) => i.key)).toEqual(['late']);
    expect(progress.awaitingVerification.map((i) => i.key)).toEqual(['pending']);
  });
});

describe('computeChecklistSummary', () => {
  const items = [item({ key: 'a', label: 'A' }), item({ key: 'b', label: 'B', requiresVerification: true })];
  const players = [{ id: 'p1' }, { id: 'p2' }];

  it('rolls completion up per item and per player', () => {
    const summary = computeChecklistSummary(items, players, [
      { playerId: 'p1', itemKey: 'a', completed: true },
      { playerId: 'p1', itemKey: 'b', completed: true, verified: true },
      { playerId: 'p2', itemKey: 'a', completed: true },
      { playerId: 'p2', itemKey: 'b', completed: true },
    ]);

    expect(summary.perItem[0]).toMatchObject({ completed: 2, awaiting: 0, outstanding: 0, pct: 100 });
    // p2's 'b' is done but unconfirmed, so it counts as awaiting, not complete.
    expect(summary.perItem[1]).toMatchObject({ completed: 1, awaiting: 1, outstanding: 1, pct: 50 });

    expect(summary.playersComplete).toBe(1);
    expect(summary.playerCount).toBe(2);
    expect(summary.pct).toBe(50);
    expect(summary.progressByPlayer.p1.complete).toBe(true);
    expect(summary.progressByPlayer.p2.complete).toBe(false);
  });

  it('handles an empty roster without dividing by zero', () => {
    const summary = computeChecklistSummary(items, [], []);
    expect(summary.pct).toBe(0);
    expect(summary.perItem.every((row) => row.pct === 0)).toBe(true);
  });
});
