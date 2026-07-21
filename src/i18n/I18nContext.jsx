import { useCallback } from 'react';
import { useTranslation, I18nextProvider } from 'react-i18next';
import i18n from './config';

/**
 * I18nProvider — wraps the app and supplies the i18next instance.
 *
 * Translation resolution, interpolation, and locale persistence are all handled
 * by i18next (see ./config). This provider keeps the same name and children API
 * the app already mounts in main.jsx.
 */
export function I18nProvider({ children }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

/**
 * useT() — access translation function and locale state.
 *
 * Backed by i18next but preserving the original public API so existing call
 * sites do not change:
 *
 * const { t, tp, locale, setLocale, toggleLocale } = useT();
 * t('common.save')                 // "Save" / "Guardar"
 * t('roster.count', { n: 5 })      // interpolates {{n}}
 * t('nav.players', 'Players')      // second string arg = fallback/default
 * tp('common.player', 1)           // "player" / "jugador"
 * tp('common.player', 3)           // "players" / "jugadores"
 *
 * Must call useTranslation() inside the hook so consumers re-render on the
 * i18next `languageChanged` event — do not read a module-level i18n.t here.
 */
export function useT() {
  const { t: translate, i18n: instance } = useTranslation();

  /**
   * t('key.path')             — simple lookup
   * t('key.path', { n: 5 })   — interpolation: replaces {{n}} with 5
   * t('key.path', 'Fallback') — string second arg used as default value
   */
  const t = useCallback(
    (key, vars) => {
      if (typeof vars === 'string') return translate(key, { defaultValue: vars });
      return translate(key, vars || undefined);
    },
    [translate],
  );

  /**
   * tp('common.player', count) — plural-aware lookup.
   * Uses `${key}_plural` when count !== 1, falling back to the base key.
   * Kept as a manual lookup so the existing `_plural` resource suffix works
   * regardless of i18next's own plural-suffix conventions.
   */
  const tp = useCallback(
    (key, count) => {
      if (count === 1) return translate(key);
      return translate(`${key}_plural`, { defaultValue: translate(key) });
    },
    [translate],
  );

  const locale = instance.language;

  const setLocale = useCallback((loc) => instance.changeLanguage(loc), [instance]);

  const toggleLocale = useCallback(() => instance.changeLanguage(instance.language === 'en' ? 'es' : 'en'), [instance]);

  return { locale, setLocale, toggleLocale, t, tp };
}
