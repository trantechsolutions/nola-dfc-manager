import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import { resolve } from 'path';

function gitInfoPlugin() {
  const virtualId = 'virtual:git-info';
  const resolvedId = '\0' + virtualId;
  return {
    name: 'git-info',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      try {
        const buildNumber = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
        const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
        return `export const buildNumber = ${JSON.stringify(buildNumber)};
export const commitHash = ${JSON.stringify(commitHash)};
export const buildDate = ${JSON.stringify(new Date().toISOString())};`;
      } catch {
        return `export const buildNumber = "0";
export const commitHash = "unknown";
export const buildDate = ${JSON.stringify(new Date().toISOString())};`;
      }
    },
  };
}

// Hosts that serve the marketing entry instead of the app. Mirrors the host
// rewrite in vercel.json — production is the source of truth; this list only
// exists so `npm run dev` and `npm run preview` behave the same way.
//
// `*.localhost` resolves to 127.0.0.1 in every current browser with no hosts-file
// entry, so http://landing.localhost:5173/ is a real local stand-in for the apex.
const MARKETING_HOSTS = [/^canteramanager\.com$/, /^www\.canteramanager\.com$/, /^landing\.localhost$/];

/**
 * Applies the vercel.json host → entry mapping to Vite's dev and preview
 * servers, which otherwise know nothing about it and would serve the app on
 * every host.
 *
 * Only navigations are rewritten (Accept: text/html). Module and asset requests
 * must fall through untouched or the dev client cannot load its own graph.
 */
function marketingHostPlugin() {
  const isMarketingHost = (req) => {
    const host = (req.headers.host || '').split(':')[0];
    return MARKETING_HOSTS.some((pattern) => pattern.test(host));
  };

  const middleware = (req, _res, next) => {
    if (req.headers.accept?.includes('text/html') && isMarketingHost(req)) {
      req.url = '/landing.html';
    }
    next();
  };

  // Braces, not a concise arrow body: returning the value of `.use()` hands
  // Vite connect's own app, which it would then call as a post-install hook.
  return {
    name: 'marketing-host',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // `.localhost` subdomains are loopback by definition — allow them so the
  // marketing host can be reached in dev without tripping Vite's host check.
  server: { allowedHosts: ['.localhost'] },
  preview: { allowedHosts: ['.localhost'] },
  plugins: [
    react(),
    gitInfoPlugin(),
    marketingHostPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'service-worker.js',
      // Generated SW is placed at /sw.js so it doesn't clobber the source file
      outDir: 'dist',
      injectRegister: null, // we register manually in main.jsx
      manifest: false, // manifest.json is already hand-crafted in /public
      injectManifest: {
        // Precache all JS/CSS/HTML build artefacts
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        // landing.html and its chunks belong to the marketing origin, which
        // never registers this service worker — precaching them would just make
        // every app install carry a copy of a page it can't reach.
        globIgnores: ['service-worker.js', 'landing.html', 'assets/landing-*'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src'),
    },
  },
  build: {
    rollupOptions: {
      // Two entries, two audiences. index.html is the app (app.canteramanager.com
      // and the club portal.* domains); landing.html is the marketing site on the
      // apex. vercel.json maps host → entry. Keeping them separate is the whole
      // point: the landing page must not ship Supabase, the PDF stack, or the
      // calendar libraries.
      input: {
        main: resolve(process.cwd(), 'index.html'),
        landing: resolve(process.cwd(), 'landing.html'),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          pdf: ['jspdf', 'pdf-lib', 'html2canvas'],
        },
      },
    },
  },
});
