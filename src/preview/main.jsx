import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../i18n/I18nContext';
import PreviewApp from './PreviewApp';
import '@fontsource-variable/geist';
import '@fontsource-variable/big-shoulders-display';
import '../index.css';

// Dev-only design preview — see preview.html. Query params pick what renders:
//   role=staff|parent  page=home|schedule|film  color=%23ffd700  theme=dark  lang=es
//   film=library|game/<slug>/report|game/<slug>/highlights   (with page=film)
//   keep=new | g/<slug>   (with page=keep: the scorekeeper)
//   team=t1 | chat=<id>   (with page=chat: open that team's chat, or a private or group chat)
const params = new URLSearchParams(window.location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
const film = params.get('film');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <MemoryRouter
        initialEntries={[
          params.get('page') === 'live'
            ? '/live/t1/2026-10-22-chelsea'
            : params.get('page') === 'keep'
              ? `/keep/t1${params.get('keep') ? `/${params.get('keep')}` : ''}`
              : params.get('page') === 'chat'
                ? `/chat${params.get('team') ? `?team=${params.get('team')}` : params.get('chat') ? `?chat=${params.get('chat')}` : ''}`
                : `/film/t1${film ? `/${film}` : ''}`,
        ]}
      >
        <PreviewApp params={params} />
      </MemoryRouter>
    </I18nProvider>
  </React.StrictMode>,
);
