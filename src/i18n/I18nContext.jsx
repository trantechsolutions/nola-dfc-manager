import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import en from './en';
import es from './es';

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
      const str = resolve(LOCALES[locale], key) ?? resolve(LOCALES.en, key) ?? key;
      if (!vars || typeof str !== 'string') return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, toggleLocale, t }), [locale, setLocale, toggleLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * useT() — access translation function and locale state.
 *
 * const { t, locale, setLocale, toggleLocale } = useT();
 * t('common.save')            // "Save" or "Guardar"
 * t('roster.count', { n: 5 }) // "5 players"
 */
export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within I18nProvider');
  return ctx;
}
