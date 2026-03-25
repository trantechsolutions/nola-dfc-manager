/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), gitInfoPlugin()],
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
