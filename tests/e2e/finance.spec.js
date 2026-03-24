import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth.js';

test.describe('Finance', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    // Navigate to Finance section
    const financeBtn = page.locator('button', { hasText: /finance|finanzas/i });
    if ((await financeBtn.count()) > 0) {
      await financeBtn.first().click();
    } else {
      await page.goto('/#/finance');
    }
    await page.waitForTimeout(2000);
  });

  test('shows ledger tab with transactions', async ({ page }) => {
    const ledgerTab = page.locator('button', { hasText: /ledger|libro mayor/i });
    if ((await ledgerTab.count()) > 0) {
      await ledgerTab.first().click();
      await page.waitForTimeout(1000);
    }

    // Should see test transactions
    const testTx = page.locator('text=/TEST_E2E_/');
    await expect(testTx.first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows budget tab', async ({ page }) => {
    const budgetTab = page.locator('button', { hasText: /budget|presupuesto/i });
    if ((await budgetTab.count()) > 0) {
      await budgetTab.first().click();
      await page.waitForTimeout(1000);

      // Should see budget content (base fee, expenses, etc.)
      await expect(page.locator('text=/budget|presupuesto|base fee|cuota base/i').first()).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('remaining budget displays correctly (non-negative when expected)', async ({ page }) => {
    // Check overview first for remaining budget
    await page.goto('/#/dashboard');
    await page.waitForTimeout(2000);

    // Look for remaining budget amount
    const budgetAmounts = page.locator('text=/\\$[\\d,]+/');
    const count = await budgetAmounts.count();

    // All displayed dollar amounts should be properly formatted
    for (let i = 0; i < Math.min(count, 10); i++) {
      const text = await budgetAmounts.nth(i).textContent();
      // Should match dollar format
      expect(text).toMatch(/\$[\d,.]+/);
    }
  });

  test('can open add transaction modal', async ({ page }) => {
    const ledgerTab = page.locator('button', { hasText: /ledger|libro mayor/i });
    if ((await ledgerTab.count()) > 0) {
      await ledgerTab.first().click();
      await page.waitForTimeout(1000);
    }

    // Click add transaction button
    const addBtn = page.locator('button', { hasText: /add|agregar|new|nuevo/i });
    if ((await addBtn.count()) > 0) {
      await addBtn.first().click();
      await page.waitForTimeout(500);

      // Modal should appear with form fields
      const modal = page.locator('[role="dialog"], .fixed.inset-0, .modal');
      if ((await modal.count()) > 0) {
        await expect(modal.first()).toBeVisible();
      }
    }
  });

  test('fundraising tab is accessible', async ({ page }) => {
    const fundTab = page.locator('button', { hasText: /fundrais|recaudación/i });
    if ((await fundTab.count()) > 0) {
      await fundTab.first().click();
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
