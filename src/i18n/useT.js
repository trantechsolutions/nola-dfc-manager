import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * useT() — access translation function and locale state.
 *
 * Lives apart from ./I18nContext on purpose: that module statically imports the
 * app's full-vocabulary i18next instance, so anything importing the hook from
 * there drags every namespace in both locales into its bundle. The marketing
 * entry needs the hook but not the vocabulary. The hook itself reads whichever
 * instance is in React context, so it is agnostic either way.
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
