// Smoke coverage for the public landing page. Three things can silently break
// it and none would fail a build: a missing i18n key (i18next renders the key
// path verbatim), a CTA that stops pointing at /login, and copy that only ever
// gets written in English. Assert those directly.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from '../../theme/ThemeContext';
import i18n from '../../i18n/landingConfig';
import LandingView from '../../views/general/LandingView';
import en from '../../i18n/en/landing';
import es from '../../i18n/es/landing';

// Mirrors src/landing-main.jsx — the landing page is its own entry and has no
// router, so a plain provider stack is the real mounting environment.
function renderLanding() {
  return render(
    <ThemeProvider>
      <I18nextProvider i18n={i18n}>
        <LandingView />
      </I18nextProvider>
    </ThemeProvider>,
  );
}

// Walks both locale objects in parallel and reports any leaf the translation
// is missing — a structural diff, not a spot check.
function missingLeaves(source, target, path = '') {
  const gaps = [];
  for (const [key, value] of Object.entries(source)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      if (typeof target?.[key] !== 'object' || target[key] === null) gaps.push(here);
      else gaps.push(...missingLeaves(value, target[key], here));
    } else if (typeof target?.[key] !== 'string' || target[key].trim() === '') {
      gaps.push(here);
    }
  }
  return gaps;
}

describe('LandingView', () => {
  it('renders the hero, every section heading, and one card per feature', async () => {
    await i18n.changeLanguage('en');
    const { container } = renderLanding();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.hero.title);
    for (const heading of [en.features.heading, en.roles.heading, en.workflow.heading, en.touchline.heading]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    // Every feature card is present, not just the first row. `features` also
    // carries the section's own heading + sub, hence the offset.
    const featureCount = Object.keys(en.features).length - 2;
    expect(container.querySelectorAll('#features article')).toHaveLength(featureCount);
    expect(container.querySelectorAll('#roles article')).toHaveLength(3);
  });

  // The landing page is served from the marketing origin, so its calls to
  // action cross to the app host via VITE_APP_URL. Unset (as in this test and
  // in preview deployments) they must stay relative rather than break.
  it('points its calls to action at the sign-in form and the public calendar', async () => {
    await i18n.changeLanguage('en');
    renderLanding();

    expect(screen.getByRole('link', { name: new RegExp(en.hero.ctaPrimary, 'i') })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: new RegExp(en.hero.ctaSecondary, 'i') })).toHaveAttribute(
      'href',
      '/calendar',
    );
  });

  it('never leaks a raw i18n key path into the page', async () => {
    await i18n.changeLanguage('en');
    const { container, unmount } = renderLanding();
    expect(container.textContent).not.toMatch(/landing\.[a-z]/i);
    unmount();

    await i18n.changeLanguage('es');
    const spanish = renderLanding();
    expect(spanish.container.textContent).not.toMatch(/landing\.[a-z]/i);
    expect(spanish.container.textContent).toContain(es.hero.title);
    await i18n.changeLanguage('en');
  });

  it('keeps the Spanish landing copy in step with English', () => {
    expect(missingLeaves(en, es)).toEqual([]);
    expect(missingLeaves(es, en)).toEqual([]);
  });
});
