import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider, useT } from '../i18n/I18nContext';

function Consumer() {
  const { t, tp, locale, toggleLocale, setLocale } = useT();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="save">{t('common.save')}</span>
      <span data-testid="plural">{tp('common.player', 3)}</span>
      <span data-testid="single">{tp('common.player', 1)}</span>
      <span data-testid="fallback">{t('made.up.key', 'Fallback text')}</span>
      <span data-testid="interp">{t('__interp__', { name: 'A & B <c>' })}</span>
      <button onClick={toggleLocale}>toggle</button>
      <button onClick={() => setLocale('es')}>es</button>
    </div>
  );
}

describe('i18next adapter (useT)', () => {
  beforeEach(async () => {
    localStorage.clear();
    const i18n = (await import('../i18n/config')).default;
    // Seed an interpolation probe key on both languages.
    i18n.addResource('en', 'translation', '__interp__', 'Hi {{name}}');
    i18n.addResource('es', 'translation', '__interp__', 'Hola {{name}}');
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('renders English by default and resolves keys, plurals, and fallbacks', () => {
    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('save')).toHaveTextContent('Save');
    expect(screen.getByTestId('plural')).toHaveTextContent('players');
    expect(screen.getByTestId('single')).toHaveTextContent('player');
    expect(screen.getByTestId('fallback')).toHaveTextContent('Fallback text');
  });

  it('does NOT html-escape interpolated values (matches old raw-replace engine)', () => {
    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    );
    // If escapeValue were on, this would be "Hi A &amp; B &lt;c&gt;".
    expect(screen.getByTestId('interp')).toHaveTextContent('Hi A & B <c>');
  });

  it('re-renders every consumer when the language toggles (live subscription)', () => {
    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    );
    expect(screen.getByTestId('save')).toHaveTextContent('Save');

    fireEvent.click(screen.getByText('toggle'));

    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    expect(screen.getByTestId('save')).toHaveTextContent('Guardar');
    expect(screen.getByTestId('plural')).toHaveTextContent('jugadores');
    expect(screen.getByTestId('interp')).toHaveTextContent('Hola A & B <c>');
  });

  it('persists the locale choice to localStorage under app_locale', () => {
    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('es'));
    expect(localStorage.getItem('app_locale')).toBe('es');
  });
});
