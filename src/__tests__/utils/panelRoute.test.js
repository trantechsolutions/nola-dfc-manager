import { describe, it, expect } from 'vitest';
import { readPanel, withPanel, withoutPanel, isPanelOpen, panelKey, PANEL_KEY, PANELS } from '../../utils/panelRoute';

describe('readPanel', () => {
  it('reports no panel for an empty search', () => {
    expect(readPanel('')).toEqual({ name: null, params: {} });
  });

  it('reports no panel when only unrelated params are present', () => {
    expect(readPanel('?admin=1&tab=ledger')).toEqual({ name: null, params: {} });
  });

  it('reads the panel name and its prefixed params', () => {
    expect(readPanel('?panel=tx&panel.id=8f21')).toEqual({ name: 'tx', params: { id: '8f21' } });
  });

  it('ignores params that are not the panel’s', () => {
    const { params } = readPanel('?tab=ledger&panel=tx&panel.id=8f21&admin=1');
    expect(params).toEqual({ id: '8f21' });
  });

  it('carries every prefill param, not just an id', () => {
    const { params } = readPanel('?panel=tx&panel.eventId=4a2&panel.amount=125.00');
    expect(params).toEqual({ eventId: '4a2', amount: '125.00' });
  });

  it('accepts a URLSearchParams as readily as a string', () => {
    expect(readPanel(new URLSearchParams('panel=player&panel.id=p1'))).toEqual({
      name: 'player',
      params: { id: 'p1' },
    });
  });
});

describe('withPanel', () => {
  it('opens a panel on an empty search', () => {
    expect(withPanel('', 'tx', { id: '8f21' }).toString()).toBe('panel=tx&panel.id=8f21');
  });

  it('leaves the view’s own params alone', () => {
    const next = withPanel('?tab=ledger&admin=1', 'tx', { id: '8f21' });
    expect(next.get('tab')).toBe('ledger');
    expect(next.get('admin')).toBe('1');
    expect(next.get(PANEL_KEY)).toBe('tx');
  });

  it('replaces an already-open panel rather than merging into it', () => {
    const next = withPanel('?panel=player&panel.id=p1', 'tx', { id: '8f21' });
    expect(readPanel(next)).toEqual({ name: 'tx', params: { id: '8f21' } });
  });

  // A blank value reads back as a present-but-empty id, which sends a panel
  // looking for a record nobody named.
  it('drops empty, null and undefined params instead of writing blanks', () => {
    const next = withPanel('', 'tx', { id: '', eventId: null, amount: undefined, title: 'Dues' });
    expect(readPanel(next).params).toEqual({ title: 'Dues' });
  });

  it('stringifies non-string values', () => {
    expect(readPanel(withPanel('', 'tx', { amount: 125 })).params).toEqual({ amount: '125' });
  });

  it('returns a new object rather than mutating the search it was given', () => {
    const original = new URLSearchParams('tab=ledger');
    withPanel(original, 'tx', { id: '8f21' });
    expect(original.toString()).toBe('tab=ledger');
  });
});

describe('withoutPanel', () => {
  it('strips the panel and all of its params', () => {
    expect(withoutPanel('?panel=tx&panel.id=8f21&panel.amount=125').toString()).toBe('');
  });

  it('keeps the view’s own params', () => {
    expect(withoutPanel('?tab=ledger&panel=tx&panel.id=8f21').toString()).toBe('tab=ledger');
  });

  it('is a no-op when no panel is open', () => {
    expect(withoutPanel('?tab=ledger').toString()).toBe('tab=ledger');
  });

  it('returns a new object rather than mutating the search it was given', () => {
    const original = new URLSearchParams('panel=tx&panel.id=8f21');
    withoutPanel(original);
    expect(original.get('panel')).toBe('tx');
  });
});

describe('isPanelOpen', () => {
  it('matches a panel with the same name and params', () => {
    expect(isPanelOpen('?panel=tx&panel.id=8f21', 'tx', { id: '8f21' })).toBe(true);
  });

  it('rejects a different panel name', () => {
    expect(isPanelOpen('?panel=player&panel.id=8f21', 'tx', { id: '8f21' })).toBe(false);
  });

  it('rejects the same panel showing a different record', () => {
    expect(isPanelOpen('?panel=tx&panel.id=8f21', 'tx', { id: 'other' })).toBe(false);
  });

  it('rejects a panel carrying extra params', () => {
    expect(isPanelOpen('?panel=tx&panel.id=8f21&panel.amount=125', 'tx', { id: '8f21' })).toBe(false);
  });

  it('compares stringified values, matching what the URL round-trips', () => {
    expect(isPanelOpen('?panel=tx&panel.amount=125', 'tx', { amount: 125 })).toBe(true);
  });
});

// The three helpers have to agree, or a panel opens and then cannot be closed.
describe('round trip', () => {
  it('opens and closes back to the original search', () => {
    const search = '?tab=ledger&admin=1';
    const opened = withPanel(search, 'tx', { id: '8f21' });
    expect(readPanel(opened).name).toBe('tx');
    expect(withoutPanel(opened).toString()).toBe(new URLSearchParams(search).toString());
  });
});

// Only one panel is open at a time and the name is global to the URL, so two
// views reaching for the same string is a real collision — the wrong panel
// opening, or two at once. The registry exists to make that a test failure
// rather than something nobody diffed.
describe('PANELS', () => {
  it('gives every panel a distinct name', () => {
    const names = Object.values(PANELS);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names them the way the URL will carry them', () => {
    Object.entries(PANELS).forEach(([key, value]) => {
      expect(value, `${key} should be a non-empty string`).toMatch(/^[a-z][a-zA-Z]*$/);
    });
  });

  // A name with a dot would collide with the panel.<key> prefix and be read
  // back as a param rather than a panel.
  it('keeps names clear of the param prefix', () => {
    Object.values(PANELS).forEach((name) => {
      expect(readPanel(withPanel('', name)).name).toBe(name);
    });
  });
});

// AppRoutes renders its panels as siblings and keys several of them off the
// same panel.id, so their forms reset when the record changes. Keyed on the
// bare id they collided the moment one was open — React saw three siblings
// with one key and warned about duplicated identity.
describe('panelKey', () => {
  it('keeps sibling panels apart when they read the same id', () => {
    const id = '4cafc61-d96d-4639-9659-193bb06973b6';
    const keys = [PANELS.PLAYER_FORM, PANELS.TX, PANELS.REFUND].map((name) => panelKey(name, id));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps them apart with no id at all', () => {
    const keys = [PANELS.PLAYER_FORM, PANELS.TX, PANELS.REFUND].map((name) => panelKey(name));
    expect(new Set(keys).size).toBe(keys.length);
  });

  // The key exists to remount a form when the record changes; same record has
  // to mean the same key, or every render throws away what was typed.
  it('is stable for the same panel and record', () => {
    expect(panelKey(PANELS.TX, '8f21')).toBe(panelKey(PANELS.TX, '8f21'));
  });

  it('changes when the record does', () => {
    expect(panelKey(PANELS.TX, '8f21')).not.toBe(panelKey(PANELS.TX, 'other'));
  });

  it('treats a missing id as the new-record key', () => {
    expect(panelKey(PANELS.TX, undefined)).toBe(panelKey(PANELS.TX, ''));
  });
});
