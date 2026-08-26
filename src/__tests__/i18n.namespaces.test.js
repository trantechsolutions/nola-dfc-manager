// The locale bundle is assembled by hand: each locale file groups several
// namespaces, and `index.js` lifts them out one by one into the flat shape the
// app looks keys up in. Adding a namespace to a locale file without adding the
// matching line to the index leaves every key in it rendering as its own name —
// a whole dialog reading `paymentModal.title` — and nothing else fails.
//
// These pin the wiring so that mistake is a red test rather than a screenshot.
import { describe, it, expect } from 'vitest';

import enBundle from '../i18n/en/index';
import esBundle from '../i18n/es/index';

// The grouped locale files. `common`, `nav` and `auth` are excluded: they are
// namespaces in their own right rather than containers of them.
const GROUPED = ['finance', 'schedule', 'people', 'club', 'evaluations', 'checklist', 'field'];

const modules = import.meta.glob('../i18n/*/*.js', { eager: true });

const groupsFor = (locale) =>
  GROUPED.map((name) => [name, modules[`../i18n/${locale}/${name}.js`]?.default]).filter(([, mod]) => mod);

describe.each(['en', 'es'])('%s locale bundle', (locale) => {
  const bundle = locale === 'en' ? enBundle : esBundle;

  it.each(groupsFor(locale))('registers every namespace in %s.js', (_name, mod) => {
    const missing = Object.keys(mod).filter((ns) => !(ns in bundle));
    expect(missing).toEqual([]);
  });

  it.each(groupsFor(locale))('registers the namespaces in %s.js by reference, not a copy', (_name, mod) => {
    // A hand-copied object drifts the moment one side is edited. The index must
    // point at the same object the locale file exports.
    Object.entries(mod).forEach(([ns, value]) => {
      expect(bundle[ns]).toBe(value);
    });
  });
});

describe('locale parity', () => {
  it('exposes the same namespaces in English and Spanish', () => {
    expect(Object.keys(esBundle).sort()).toEqual(Object.keys(enBundle).sort());
  });

  it.each(Object.keys(enBundle))('translates every key of %s in both locales', (ns) => {
    const en = enBundle[ns];
    const es = esBundle[ns];
    if (typeof en !== 'object' || en === null) return;
    expect(Object.keys(es || {}).sort()).toEqual(Object.keys(en).sort());
  });
});
