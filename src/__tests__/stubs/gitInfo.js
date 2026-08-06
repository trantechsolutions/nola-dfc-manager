// Test stand-in for the `virtual:git-info` module that vite.config.js generates
// at build time. Aliased in vitest.config.js so components reading the build
// stamp (AppFooter, Changelog) resolve to fixed, assertable values instead of
// shelling out to git on every test run.
export const buildNumber = '123';
export const commitHash = 'abc1234';
export const buildDate = '2026-01-01T00:00:00.000Z';
