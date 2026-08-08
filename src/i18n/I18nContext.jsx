import { I18nextProvider } from 'react-i18next';
import i18n from './config';

/**
 * I18nProvider — wraps the app and supplies the i18next instance.
 *
 * Translation resolution, interpolation, and locale persistence are all handled
 * by i18next (see ./config). This provider keeps the same name and children API
 * the app already mounts in main.jsx.
 *
 * `instance` defaults to the app's full-vocabulary i18next instance; pass one
 * to scope a surface to fewer namespaces. Note that importing anything from
 * THIS module pulls ./config — every namespace in both locales — into the
 * bundle, which is why the marketing entry mounts I18nextProvider directly with
 * ./landingConfig and takes useT from ./useT instead.
 */
export function I18nProvider({ children, instance = i18n }) {
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

// Re-exported so the app's ~50 existing `import { useT } from '.../I18nContext'`
// call sites keep working. New code that must stay off the full vocabulary
// should import from './useT' directly.
export { useT } from './useT';
