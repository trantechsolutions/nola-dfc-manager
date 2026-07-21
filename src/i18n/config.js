import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en/index';
import es from './es/index';

/**
 * i18next configuration.
 *
 * Behaviour intentionally mirrors the previous hand-rolled engine:
 *  - English is the fallback for any key missing in the active locale.
 *  - Interpolation uses the `{{var}}` syntax already present in the resources.
 *  - The locale choice persists in localStorage under `app_locale`.
 *
 * Init runs synchronously with inline resources, so `i18n.isInitialized` is
 * true before the first render — no first-paint key flash.
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    // Normalise any region variant (e.g. es-MX) down to the base code so
    // consumers comparing `locale === 'es'` always match.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    // Match the prior hard default of English; do not sniff the browser.
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'app_locale',
      caches: ['localStorage'],
    },
    interpolation: {
      // React already escapes output; the old engine did a raw replace.
      escapeValue: false,
    },
    // Missing keys returned the key itself in the old engine.
    returnNull: false,
    react: {
      useSuspense: false,
    },
  });

export default i18n;
