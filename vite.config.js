/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

function gitChangelogPlugin() {
  const virtualId = 'virtual:changelog';
  const resolvedId = '\0' + virtualId;
  return {
    name: 'git-changelog',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      try {
        const log = execSync('git log --pretty=format:"%H||%h||%s||%an||%aI" -50', { encoding: 'utf-8' });
        const buildNumber = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
        const entries = log
          .trim()
          .split('\n')
          .map((line) => {
            const [hash, short, message, author, date] = line.split('||');
            return { hash, short, message, author, date };
          });
        return `export const changelog = ${JSON.stringify(entries)};
export const buildNumber = ${JSON.stringify(buildNumber)};
export const buildDate = ${JSON.stringify(new Date().toISOString())};`;
      } catch {
        return `export const changelog = [];
export const buildNumber = "0";
export const buildDate = ${JSON.stringify(new Date().toISOString())};`;
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), gitChangelogPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          pdf: ['jspdf', 'pdf-lib', 'html2canvas'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/hooks/**', 'src/utils/**'],
      exclude: ['src/setupTests.js'],
    },
  },
});
