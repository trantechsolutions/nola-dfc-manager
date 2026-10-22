import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../i18n/I18nContext';
import PreviewApp from './PreviewApp';
import '@fontsource-variable/geist';
import '@fontsource-variable/big-shoulders-display';
import '../index.css';

// Dev-only design preview — see preview.html. Query params pick what renders:
//   role=staff|parent  page=home|schedule  color=%23ffd700  theme=dark  lang=es
const params = new URLSearchParams(window.location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <MemoryRouter>
        <PreviewApp params={params} />
      </MemoryRouter>
    </I18nProvider>
  </React.StrictMode>,
);
