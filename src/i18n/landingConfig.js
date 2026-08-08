import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enLanding from './en/landing';
import esLanding from './es/landing';

/**
 * i18next instance for the marketing site only.
 *
 * The app's ./config pulls in every namespace in both locales — roughly 100 kB
 * gzipped of ledger, roster, and evaluation strings. The landing page reads
 * exactly one namespace, so it gets its own instance rather than dragging the
 * whole product's vocabulary onto a page that shows none of it.
 *
 * Behaviour otherwise mirrors ./config: English fallback, `{{var}}`
 * interpolation, and the same `app_locale` storage key — so a visitor who picks
 * Español here is not re-asked if the app is ever served from this origin.
 */
const landingI18n = i18n.createInstance();

landingI18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { landing: enLanding } },
      es: { translation: { landing: esLanding } },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app_locale',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  });

export default landingI18n;
