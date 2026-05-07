import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import en from './en/index';
import es from './es/index';

const LOCALES = { en, es };
const STORAGE_KEY = 'app_locale';

const I18nContext = createContext();

/**
 * Resolve a dot-path key like 'nav.dashboard' from a nested object.
 */
function resolve(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * I18nProvider — wraps the app and provides translation context.
 *
 * Persists locale choice in localStorage.
 */
export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'en';
    } catch {
      return 'en';
    }
  });

  const setLocale = useCallback((loc) => {
    setLocaleState(loc);
    try {
      localStorage.setItem(STORAGE_KEY, loc);
    } catch {
      /* noop */
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'es' : 'en');
  }, [locale, setLocale]);

  /**
   * t('key.path')              — simple lookup
   * t('key.path', { n: 5 })   — interpolation: replaces {{n}} with 5
   */
  const t = useCallback(
    (key, vars) => {
      const resolved = resolve(LOCALES[locale], key) ?? resolve(LOCALES.en, key);
      // If vars is a string, treat it as a fallback for missing keys
      if (typeof vars === 'string') {
        return resolved ?? vars;
      }
      const str = resolved ?? key;
      if (!vars || typeof str !== 'string') return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    },
    [locale],
  );

  /**
   * tp('common.player', count) — plural-aware lookup
   * Uses key_plural when count !== 1, falls back to key if _plural missing.
   */
  const tp = useCallback(
    (key, count) => {
      const pluralKey = count === 1 ? key : `${key}_plural`;
      const resolved =
        resolve(LOCALES[locale], pluralKey) ??
        resolve(LOCALES[locale], key) ??
        resolve(LOCALES.en, pluralKey) ??
        resolve(LOCALES.en, key);
      return typeof resolved === 'string' ? resolved : key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, toggleLocale, t, tp }), [locale, setLocale, toggleLocale, t, tp]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * useT() — access translation function and locale state.
 *
 * const { t, tp, locale, setLocale, toggleLocale } = useT();
 * t('common.save')              // "Save" or "Guardar"
 * t('roster.count', { n: 5 })  // "5 players"
 * tp('common.player', 1)        // "player" / "jugador"
 * tp('common.player', 3)        // "players" / "jugadores"
 */
export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within I18nProvider');
  return ctx;
}
