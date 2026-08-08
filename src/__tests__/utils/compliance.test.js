import { describe, it, expect } from 'vitest';
import {
  getCompliance,
  buildCompliance,
  isCompliant,
  outstandingFor,
  progressFor,
  EMPTY_COMPLIANCE,
} from '../../utils/compliance';
import { CHECKLIST_FORMS } from '../../utils/checklist';

const player = {
  seasonProfiles: {
    '2024-2025': { medicalRelease: true, reePlayerWaiver: true, clubRegistration: true },
    '2025-2026': { medicalRelease: true, reePlayerWaiver: false, clubRegistration: true },
  },
};

describe('getCompliance', () => {
  it('resolves flags for the given season', () => {
    expect(getCompliance(player, '2024-2025')).toEqual({
      medicalRelease: true,
      reePlayerWaiver: true,
      clubRegistration: true,
    });
    expect(getCompliance(player, '2025-2026')).toEqual({
      medicalRelease: true,
      reePlayerWaiver: false,
      clubRegistration: true,
    });
  });

  it('treats an unenrolled or unknown season as non-compliant', () => {
    const empty = { medicalRelease: false, reePlayerWaiver: false, clubRegistration: false };
    expect(getCompliance(player, '2026-2027')).toEqual(empty);
    expect(getCompliance(player, null)).toEqual(empty);
    expect(getCompliance({}, '2025-2026')).toEqual(empty);
    expect(getCompliance(null, '2025-2026')).toEqual(empty);
  });

  it('does not leak compliance across seasons', () => {
    // Compliant in 2024-2025 must NOT imply compliant in a fresh season.
    expect(getCompliance(player, '2026-2027').medicalRelease).toBe(false);
  });
});

// Compliance is no longer the three flags above — it is the season checklist.
// getCompliance() survives only because PlayerModal still exposes those flags as
// staff toggles and because medical_release backs a linked checklist item.
const SEASON = '2025-2026';

const p = (id, overrides = {}) => ({
  id,
  seasonProfiles: { [SEASON]: { medicalRelease: false, ...overrides } },
});

const item = (key, label, overrides = {}) => ({
  key,
  label,
  type: 'check',
  audience: 'parent',
  required: true,
  requiresVerification: false,
  ...overrides,
});

describe('buildCompliance', () => {
  const players = [p('p1'), p('p2')];
  const items = [item('a', 'Task A'), item('b', 'Task B'), item('c', 'Optional', { required: false })];

  it('marks a player compliant once every required item is satisfied', () => {
    const compliance = buildCompliance({
      items,
      players,
      seasonId: SEASON,
      responses: [
        { playerId: 'p1', itemKey: 'a', completed: true },
        { playerId: 'p1', itemKey: 'b', completed: true },
        { playerId: 'p2', itemKey: 'a', completed: true },
      ],
    });

    expect(isCompliant(compliance, 'p1')).toBe(true);
    expect(isCompliant(compliance, 'p2')).toBe(false);
    expect(compliance.compliantCount).toBe(1);
    expect(compliance.total).toBe(2);
  });

  it('ignores optional items when deciding compliance', () => {
    const compliance = buildCompliance({
      items,
      players: [p('p1')],
      seasonId: SEASON,
      responses: [
        { playerId: 'p1', itemKey: 'a', completed: true },
        { playerId: 'p1', itemKey: 'b', completed: true },
      ],
    });
    expect(isCompliant(compliance, 'p1')).toBe(true);
    // The optional item is outstanding but does not block compliance.
    expect(outstandingFor(compliance, 'p1')).toEqual([]);
    expect(progressFor(compliance, 'p1').outstanding.map((i) => i.key)).toEqual(['c']);
  });

  it('reports what a player still owes, required items only', () => {
    const compliance = buildCompliance({ items, players, seasonId: SEASON, responses: [] });
    expect(outstandingFor(compliance, 'p1').map((i) => i.label)).toEqual(['Task A', 'Task B']);
  });

  it('treats a season with no checklist as compliant rather than red', () => {
    const compliance = buildCompliance({ items: [], players, seasonId: SEASON, responses: [] });
    expect(compliance.hasChecklist).toBe(false);
    expect(isCompliant(compliance, 'p1')).toBe(true);
    expect(compliance.compliantCount).toBe(2);
  });

  it('satisfies a linked medical item from the season flag, with no response row', () => {
    const medical = item('med', 'Medical Release', { linkedForm: CHECKLIST_FORMS.MEDICAL_RELEASE });
    const compliance = buildCompliance({
      items: [medical],
      players: [p('done', { medicalRelease: true }), p('todo', { medicalRelease: false })],
      seasonId: SEASON,
      responses: [],
    });
    expect(isCompliant(compliance, 'done')).toBe(true);
    expect(isCompliant(compliance, 'todo')).toBe(false);
  });

  it('counts completion per item for the breakdown tiles', () => {
    const compliance = buildCompliance({
      items,
      players,
      seasonId: SEASON,
      responses: [{ playerId: 'p1', itemKey: 'a', completed: true }],
    });
    const byKey = Object.fromEntries(compliance.perItem.map((row) => [row.item.key, row]));
    expect(byKey.a.completed).toBe(1);
    expect(byKey.b.completed).toBe(0);
    expect(compliance.requiredItems.map((i) => i.key)).toEqual(['a', 'b']);
  });
});

describe('compliance index accessors', () => {
  it('treat an unindexed player as compliant, not as failing', () => {
    // Views render before the checklist resolves; a momentary red badge on every
    // player would be worse than briefly showing them as fine.
    expect(isCompliant(EMPTY_COMPLIANCE, 'nobody')).toBe(true);
    expect(outstandingFor(EMPTY_COMPLIANCE, 'nobody')).toEqual([]);
    expect(progressFor(EMPTY_COMPLIANCE, 'nobody')).toMatchObject({ complete: true, pct: 100 });
  });

  it('tolerate a missing index entirely', () => {
    expect(isCompliant(undefined, 'p1')).toBe(true);
    expect(outstandingFor(null, 'p1')).toEqual([]);
  });
});
