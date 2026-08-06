import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors vite.config.js so `@/…` imports resolve under test too.
      '@': resolve(process.cwd(), 'src'),
      // vite.config.js generates this module from git at build time; tests get
      // a fixed stub so build-stamp assertions stay deterministic.
      'virtual:git-info': resolve(process.cwd(), 'src/__tests__/stubs/gitInfo.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.js',
    include: ['src/__tests__/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/hooks/**', 'src/utils/**'],
    },
  },
});
