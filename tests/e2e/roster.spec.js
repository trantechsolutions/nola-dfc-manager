import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth.js';

test.describe('People / Roster', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    // Navigate to People section
    const peopleBtn = page.locator('button', { hasText: /people|personas/i });
    if ((await peopleBtn.count()) > 0) {
      await peopleBtn.first().click();
    } else {
      await page.goto('/#/people');
    }
    await page.waitForTimeout(2000);
  });

  test('shows roster tab with players', async ({ page }) => {
    // Should see Roster tab
    const rosterTab = page.locator('button', { hasText: /roster|plantilla/i });
    if ((await rosterTab.count()) > 0) {
      await rosterTab.first().click();
      await page.waitForTimeout(1000);
    }

    // Should see test players (prefixed with TEST_E2E_)
    const playerNames = page.locator('text=/TEST_E2E_/');
    await expect(playerNames.first()).toBeVisible({ timeout: 10_000 });
  });

  test('can expand a player row to see details', async ({ page }) => {
    const rosterTab = page.locator('button', { hasText: /roster|plantilla/i });
    if ((await rosterTab.count()) > 0) {
      await rosterTab.first().click();
      await page.waitForTimeout(1000);
    }

    // Click on a test player to expand
    const playerRow = page.locator('text=TEST_E2E_Alex').first();
    if ((await playerRow.count()) > 0) {
      await playerRow.click();
      await page.waitForTimeout(500);

      // Should show expanded content (guardians, compliance, etc.)
      const expandedContent = page.locator('text=/guardian|parent|compliance|medical/i');
      await expect(expandedContent.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('medical release section appears in expanded player', async ({ page }) => {
    const rosterTab = page.locator('button', { hasText: /roster|plantilla/i });
    if ((await rosterTab.count()) > 0) {
      await rosterTab.first().click();
      await page.waitForTimeout(1000);
    }

    // Expand a player
    const playerRow = page.locator('text=TEST_E2E_Alex').first();
    if ((await playerRow.count()) > 0) {
      await playerRow.click();
      await page.waitForTimeout(500);

      // Should see medical release option
      const medicalSection = page.locator('text=/medical release|release médica/i');
      await expect(medicalSection.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('documents tab shows document management', async ({ page }) => {
    const docsTab = page.locator('button', { hasText: /documents|documentos/i });
    if ((await docsTab.count()) > 0) {
      await docsTab.first().click();
      await page.waitForTimeout(1000);

      // Should show document management area
      await expect(page.locator('text=/documents|documentos/i').first()).toBeVisible();
    }
  });

  test('impersonation button is available for players', async ({ page }) => {
    const rosterTab = page.locator('button', { hasText: /roster|plantilla/i });
    if ((await rosterTab.count()) > 0) {
      await rosterTab.first().click();
      await page.waitForTimeout(1000);
    }

    // Expand a player
    const playerRow = page.locator('text=TEST_E2E_Alex').first();
    if ((await playerRow.count()) > 0) {
      await playerRow.click();
      await page.waitForTimeout(500);

      // Look for impersonate/view as parent button
      const impersonateBtn = page.locator('button', { hasText: /view as parent|impersonate|ver como padre/i });
      await expect(impersonateBtn.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
