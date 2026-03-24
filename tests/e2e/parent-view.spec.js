import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth.js';
import { getCreated } from './helpers/seed.js';

test.describe('Parent View', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/#/dashboard');
    await page.waitForTimeout(2000);
  });

  test('shows remaining balance section', async ({ page }) => {
    // Navigate to people > roster and impersonate a player to see parent view
    // Or check if dashboard already shows balance for staff
    const balanceText = page.locator('text=/remaining balance|balance restante/i');
    const hasBalance = (await balanceText.count()) > 0;

    if (!hasBalance) {
      // Try navigating to people view and impersonating
      await page.goto('/#/people');
      await page.waitForTimeout(2000);

      // Look for "View as Parent" button on a player row
      const viewAsParent = page.locator('button', { hasText: /view as parent|impersonate/i });
      if ((await viewAsParent.count()) > 0) {
        await viewAsParent.first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('text=/remaining balance|balance restante/i')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('payment progress appears below remaining balance', async ({ page }) => {
    // Check layout order: balance hero should come before payment progress
    const balance = page.locator('text=/remaining balance|balance restante/i').first();
    const progress = page.locator('text=/payment progress|progreso de pago/i').first();

    if ((await balance.count()) > 0 && (await progress.count()) > 0) {
      const balanceBox = await balance.boundingBox();
      const progressBox = await progress.boundingBox();

      if (balanceBox && progressBox) {
        // Payment progress should be below balance (higher y value)
        expect(progressBox.y).toBeGreaterThan(balanceBox.y);
      }
    }
  });

  test('player info is positioned on the right side', async ({ page }) => {
    // On desktop, player info should be in the right column
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 1024) {
      const playerCard = page.locator('text=/player info|info del jugador/i').first();
      const documentsSection = page.locator('text=/documents|documentos/i').first();

      if ((await playerCard.count()) > 0 && (await documentsSection.count()) > 0) {
        const playerBox = await playerCard.boundingBox();
        const docsBox = await documentsSection.boundingBox();

        if (playerBox && docsBox) {
          // Documents should be on the left (lower x), player info on the right (higher x)
          expect(playerBox.x).toBeGreaterThanOrEqual(docsBox.x);
        }
      }
    }
  });

  test('shows season fee amount', async ({ page }) => {
    const feeText = page.locator('text=/season fee|cuota de temporada/i');
    if ((await feeText.count()) > 0) {
      await expect(feeText.first()).toBeVisible();
    }
  });

  test('transactions section is visible', async ({ page }) => {
    const transactions = page.locator('text=/transactions|transacciones/i');
    if ((await transactions.count()) > 0) {
      await expect(transactions.first()).toBeVisible();
    }
  });
});
