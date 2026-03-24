/**
 * Playwright global teardown — cleans up all test data after tests complete.
 */
import { cleanupAll } from './helpers/seed.js';

export default async function globalTeardown() {
  console.log('\n🧹 Global teardown: cleaning up test data...');
  await cleanupAll();
}
