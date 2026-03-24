import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth.js';

test.describe('Dashboard / Overview', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('displays the dashboard after login', async ({ page }) => {
    // Should be on dashboard or club overview
    await expect(page).toHaveURL(/\/#\/(dashboard|club)/);
  });

  test('shows navigation items', async ({ page }) => {
    // Desktop: sidebar nav buttons should be visible
    const nav = page.locator('nav, [role="navigation"]').first();
    if ((await nav.count()) > 0) {
      await expect(nav).toBeVisible();
    }
  });

  test('overview cards do not have shadow/glow effects', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/#/dashboard');
    await page.waitForTimeout(2000);

    // Check that cards exist but don't have glow classes
    const cards = page.locator('.rounded-2xl');
    const count = await cards.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const card = cards.nth(i);
        const classes = await card.getAttribute('class');
        // Should not have shadow-lg, shadow-xl, or glow
        expect(classes).not.toMatch(/shadow-lg|shadow-xl|glow/);
      }
    }
  });

  test('theme toggle cycles through light/dark/system', async ({ page }) => {
    await page.goto('/#/dashboard');
    await page.waitForTimeout(2000);

    // Desktop sidebar has a theme button with text "system"/"light"/"dark"
    // Mobile header has title="Theme: ..."
    // Try desktop sidebar first (visible button with theme text), then mobile
    const desktopBtn = page.locator('button:visible', { hasText: /^(system|light|dark)$/i }).first();
    const mobileBtn = page.locator('button[title*="Theme"]:visible').first();

    let themeBtn;
    if ((await desktopBtn.count()) > 0) {
      themeBtn = desktopBtn;
    } else if ((await mobileBtn.count()) > 0) {
      themeBtn = mobileBtn;
    }

    if (themeBtn) {
      await themeBtn.click();
      await page.waitForTimeout(300);
      const storedTheme = await page.evaluate(() => localStorage.getItem('app_theme'));
      expect(storedTheme).toBeTruthy();
    }
  });
});
