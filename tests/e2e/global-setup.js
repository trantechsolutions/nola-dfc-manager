/**
 * Playwright global setup — seeds test data before all tests run.
 */
import { seedAll } from './helpers/seed.js';

export default async function globalSetup() {
  console.log('\n🔧 Global setup: seeding test data...');
  await seedAll();
}
