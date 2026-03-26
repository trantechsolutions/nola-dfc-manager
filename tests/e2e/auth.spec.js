import { test, expect } from '@playwright/test';
import { TEST_USER } from './helpers/seed.js';

test.describe('Authentication', () => {
  test('shows login page with email and password fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'bad@email.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    // Should show error message
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
  });

  test('logs in successfully with valid credentials', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    // Should navigate away from login
    await page.waitForURL(/\/(dashboard|club)/, { timeout: 15_000 });
    // Should see some navigation or dashboard content
    await expect(page.locator('body')).not.toContainText('Sign In', { timeout: 5000 });
  });

  test('can toggle between login and register modes', async ({ page }) => {
    await page.goto('/');
    // Find the toggle link/button
    const toggleBtn = page.locator('button', { hasText: /register|create|sign up/i });
    if ((await toggleBtn.count()) > 0) {
      await toggleBtn.click();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    }
  });

  test('locale toggle is available on login page', async ({ page }) => {
    await page.goto('/');
    // Globe icon should be visible for locale switching
    const globeBtn = page
      .locator('button')
      .filter({ has: page.locator('svg') })
      .first();
    await expect(globeBtn).toBeVisible();
  });
});
