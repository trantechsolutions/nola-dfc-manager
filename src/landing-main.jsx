// Entry point for the marketing site (canteramanager.com).
//
// Deliberately NOT the app: no Supabase client, no router, no service worker,
// no PWA manifest. It mounts one view inside the two providers that view needs
// (theme + i18n), which keeps the landing bundle to React plus the design
// system instead of the whole product.
//
// The app entry is src/main.jsx — see vite.config.js for the two-entry build
// and vercel.json for the host that maps to each one.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import './index.css';
import { I18nextProvider } from 'react-i18next';
import landingI18n from './i18n/landingConfig';
import { ThemeProvider } from './theme/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import LandingView from './views/general/LandingView';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <I18nextProvider i18n={landingI18n}>
          <LandingView />
        </I18nextProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
