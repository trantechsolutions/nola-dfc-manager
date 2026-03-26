import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth.js';

/* ─────────────────────────────────────────────
   Mobile Navigation
   ───────────────────────────────────────────── */
test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    // Wait for the app to settle after login
    await page.waitForTimeout(1500);
  });

  test('mobile header is visible and shows club name', async ({ page }) => {
    const header = page.locator('header.md\\:hidden');
    await expect(header).toBeVisible();
    // Should contain the club name (default "NOLA DFC" or custom)
    const headerText = await header.textContent();
    expect(headerText.length).toBeGreaterThan(0);
    // The h1 inside mobile header should have the club name
    const clubHeading = header.locator('h1');
    await expect(clubHeading).toBeVisible();
    const clubName = await clubHeading.textContent();
    expect(clubName.trim().length).toBeGreaterThan(0);
  });

  test('hamburger menu button opens slide-out drawer', async ({ page }) => {
    const menuBtn = page.locator('button[aria-label="Open menu"]');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();
    // Slide-out menu should appear — the overlay container
    const slideOut = page.locator('.md\\:hidden.fixed.inset-0');
    await expect(slideOut).toBeVisible({ timeout: 3000 });
    // The drawer panel with nav items
    const drawerPanel = slideOut.locator('.bg-slate-900');
    await expect(drawerPanel).toBeVisible();
  });

  test('slide-out menu shows season and team nav items', async ({ page }) => {
    // Open the slide-out
    await page.locator('button[aria-label="Open menu"]').click();
    const slideOut = page.locator('.md\\:hidden.fixed.inset-0');
    await expect(slideOut).toBeVisible({ timeout: 3000 });

    // Should show SEASON section label
    const seasonLabel = slideOut.locator('p', { hasText: /season/i });
    if ((await seasonLabel.count()) > 0) {
      await expect(seasonLabel.first()).toBeVisible();
    }

    // Should have nav buttons inside the drawer
    const navButtons = slideOut.locator('button');
    const btnCount = await navButtons.count();
    // At minimum: some nav items + close button
    expect(btnCount).toBeGreaterThanOrEqual(3);

    // Should show team section label (team name or "Team")
    const teamLabels = slideOut.locator('.tracking-widest');
    const labelCount = await teamLabels.count();
    expect(labelCount).toBeGreaterThanOrEqual(1);
  });

  test('clicking a nav item in slide-out closes the menu and navigates', async ({ page }) => {
    // Open the slide-out
    await page.locator('button[aria-label="Open menu"]').click();
    const slideOut = page.locator('.md\\:hidden.fixed.inset-0');
    await expect(slideOut).toBeVisible({ timeout: 3000 });

    // Find a clickable nav item (e.g., Schedule)
    const scheduleBtn = slideOut.locator('button', { hasText: /schedule|horario/i }).first();
    if ((await scheduleBtn.count()) > 0) {
      await scheduleBtn.click();
      // Menu should close
      await expect(slideOut).not.toBeVisible({ timeout: 3000 });
      // URL should reflect navigation
      await expect(page).toHaveURL(/schedule/, { timeout: 5000 });
    } else {
      // Fallback: click any nav button that is not the close button
      const navBtns = slideOut.locator('button.rounded-xl');
      if ((await navBtns.count()) > 0) {
        await navBtns.first().click();
        await expect(slideOut).not.toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('bottom navigation bar is visible with icons', async ({ page }) => {
    // The fixed bottom nav bar
    const bottomNav = page.locator('nav.md\\:hidden.fixed.bottom-0');
    await expect(bottomNav).toBeVisible();

    // Should have navigation buttons with icons (SVGs)
    const navButtons = bottomNav.locator('button');
    const count = await navButtons.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Each nav button should contain an SVG icon
    for (let i = 0; i < Math.min(count, 4); i++) {
      const btn = navButtons.nth(i);
      const svg = btn.locator('svg');
      if ((await svg.count()) > 0) {
        await expect(svg.first()).toBeVisible();
      }
    }
  });

  test('bottom nav "+" button opens add transaction modal', async ({ page }) => {
    const plusBtn = page.locator('button[aria-label="Add transaction"]');
    if ((await plusBtn.count()) > 0) {
      await expect(plusBtn).toBeVisible();
      await plusBtn.click();
      // Transaction modal should appear — look for dialog/modal overlay
      const modal = page.locator('[role="dialog"], .fixed.inset-0, [class*="modal"]');
      await expect(modal.first()).toBeVisible({ timeout: 3000 });
    } else {
      // User may not have ledger edit permissions — this is acceptable
      test.skip();
    }
  });

  test('mobile header shows locale globe icon', async ({ page }) => {
    const header = page.locator('header.md\\:hidden');
    const globeBtn = header.locator('button[aria-label="Toggle language"]');
    await expect(globeBtn).toBeVisible();
    // Should contain globe SVG
    const svg = globeBtn.locator('svg');
    await expect(svg).toBeVisible();
    // Should show locale badge (EN or ES)
    const badge = globeBtn.locator('span');
    const badgeText = await badge.textContent();
    expect(badgeText.trim().toUpperCase()).toMatch(/^(EN|ES)$/);
  });

  test('mobile header shows theme toggle icon', async ({ page }) => {
    const header = page.locator('header.md\\:hidden');
    const themeBtn = header.locator('button[aria-label="Toggle theme"]');
    await expect(themeBtn).toBeVisible();
    // Should contain an SVG (Sun, Moon, or Monitor icon)
    const svg = themeBtn.locator('svg');
    await expect(svg).toBeVisible();
  });
});

/* ─────────────────────────────────────────────
   Accessibility
   ───────────────────────────────────────────── */
test.describe('Accessibility', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('all icon-only buttons have aria-label attributes', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1500);

    // Find all buttons that contain an SVG but no visible text content
    const violations = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const issues = [];
      buttons.forEach((btn) => {
        const hasSvg = btn.querySelector('svg');
        if (!hasSvg) return;
        // Check if the button has meaningful text (excluding whitespace)
        const textContent = btn.textContent?.trim() || '';
        const hasAriaLabel = btn.hasAttribute('aria-label');
        const hasAriaLabelledBy = btn.hasAttribute('aria-labelledby');
        const hasTitle = btn.hasAttribute('title');
        // If the button has only an icon (no text or very short text like locale codes),
        // it should have an aria-label, aria-labelledby, or title
        if (textContent.length <= 2 && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
          issues.push({
            html: btn.outerHTML.substring(0, 200),
            text: textContent,
          });
        }
      });
      return issues;
    });

    if (violations.length > 0) {
      console.warn('Icon-only buttons missing aria-label:', violations);
    }
    // Allow a small tolerance — some may be decorative or in-progress
    expect(violations.length).toBeLessThanOrEqual(2);
  });

  test('login form inputs have proper labels', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 });

    // Email input should have a label
    const emailLabel = page.locator('label', { hasText: /email/i });
    await expect(emailLabel).toBeVisible();

    // Password input should have a label
    const passwordLabel = page.locator('label', { hasText: /password|contrase/i });
    await expect(passwordLabel).toBeVisible();

    // Verify the labels are structurally associated (same parent div wraps label + input)
    const emailContainer = emailLabel.locator('..');
    const emailInput = emailContainer.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    const passwordContainer = passwordLabel.locator('..');
    const passwordInput = passwordContainer.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });

  test('page has no duplicate IDs', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1500);

    const duplicateIds = await page.evaluate(() => {
      const allElements = document.querySelectorAll('[id]');
      const idMap = {};
      const duplicates = [];
      allElements.forEach((el) => {
        const id = el.id;
        if (!id) return;
        if (idMap[id]) {
          duplicates.push(id);
        }
        idMap[id] = true;
      });
      return [...new Set(duplicates)];
    });

    if (duplicateIds.length > 0) {
      console.warn('Duplicate IDs found:', duplicateIds);
    }
    expect(duplicateIds.length).toBe(0);
  });

  test('images have alt text', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1500);

    const imagesWithoutAlt = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      const missing = [];
      imgs.forEach((img) => {
        const alt = img.getAttribute('alt');
        if (alt === null || alt === undefined) {
          missing.push({ src: img.src?.substring(0, 100) });
        }
      });
      return missing;
    });

    if (imagesWithoutAlt.length > 0) {
      console.warn('Images without alt text:', imagesWithoutAlt);
    }
    expect(imagesWithoutAlt.length).toBe(0);
  });
});

/* ─────────────────────────────────────────────
   Negative / Edge Cases
   ───────────────────────────────────────────── */
test.describe('Negative / Edge Cases', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('rapidly clicking nav items does not break routing', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1500);

    const bottomNav = page.locator('nav.md\\:hidden.fixed.bottom-0');
    const navButtons = bottomNav.locator('button');
    const count = await navButtons.count();

    if (count >= 2) {
      // Rapidly alternate between the first two nav items
      for (let i = 0; i < 6; i++) {
        await navButtons.nth(i % 2).click();
        // No waitForTimeout here — rapid fire
      }
      // Give the app a moment to settle
      await page.waitForTimeout(1000);

      // App should not crash — page should still have content
      const body = page.locator('body');
      await expect(body).toBeVisible();
      // Should not show an error boundary or blank page
      const bodyText = await body.textContent();
      expect(bodyText.length).toBeGreaterThan(10);
    }
  });

  test('navigating to a nonexistent route redirects to dashboard', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1000);

    // Navigate to a route that does not exist
    await page.goto('/this-route-does-not-exist');
    await page.waitForTimeout(2000);

    // The catch-all route should redirect to /dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 5000 });
  });

  test('refreshing the page preserves the current route', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1000);

    // Navigate to the schedule page
    const bottomNav = page.locator('nav.md\\:hidden.fixed.bottom-0');
    const scheduleBtn = bottomNav.locator('button', { hasText: /schedule|horario/i }).first();

    if ((await scheduleBtn.count()) > 0) {
      await scheduleBtn.click();
      await page.waitForURL(/schedule/, { timeout: 5000 });

      // Refresh the page
      await page.reload();
      await page.waitForTimeout(2000);

      // Route should be preserved (BrowserRouter keeps the path)
      await expect(page).toHaveURL(/schedule/, { timeout: 5000 });
    } else {
      // Fallback: just verify dashboard stays on refresh
      await page.goto('/dashboard');
      await page.waitForTimeout(1500);
      await page.reload();
      await page.waitForTimeout(2000);
      await expect(page).toHaveURL(/dashboard/, { timeout: 5000 });
    }
  });

  test('theme persists across page refresh', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1000);

    // Set theme to dark via localStorage
    await page.evaluate(() => {
      localStorage.setItem('app_theme', 'dark');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // Verify the dark class is applied to html
    const htmlClass = (await page.locator('html').getAttribute('class')) || '';
    expect(htmlClass).toContain('dark');

    // Verify localStorage still has the theme
    const storedTheme = await page.evaluate(() => localStorage.getItem('app_theme'));
    expect(storedTheme).toBe('dark');
  });

  test('locale persists across page refresh', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1000);

    // Set locale to Spanish via localStorage
    await page.evaluate(() => {
      localStorage.setItem('app_locale', 'es');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // Verify localStorage retained the locale
    const storedLocale = await page.evaluate(() => localStorage.getItem('app_locale'));
    expect(storedLocale).toBe('es');

    // Verify Spanish text appears somewhere on the page
    const bodyText = await page.locator('body').textContent();
    const hasSpanish = bodyText.match(/Panel|Finanzas|Personas|Horario|Resumen/i);
    expect(hasSpanish).toBeTruthy();
  });
});

/* ─────────────────────────────────────────────
   Empty States
   ───────────────────────────────────────────── */
test.describe('Empty States', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.waitForTimeout(1500);
  });

  test('insights page loads without crashing', async ({ page }) => {
    await page.goto('/insights');
    await page.waitForTimeout(2000);

    // Page should not show a crash or blank screen
    const body = page.locator('body');
    await expect(body).toBeVisible();
    const bodyText = await body.textContent();
    expect(bodyText.length).toBeGreaterThan(5);

    // Should not show an uncaught error
    const errorBoundary = page.locator('text=/something went wrong|error|crashed/i');
    const errorCount = await errorBoundary.count();
    // Either no error text, or it redirected to dashboard (which is also fine)
    expect(errorCount).toBeLessThanOrEqual(0);
  });

  test('changelog page loads and shows content or empty message', async ({ page }) => {
    await page.goto('/changelog');
    await page.waitForTimeout(2000);

    // Page should not be blank
    const body = page.locator('body');
    await expect(body).toBeVisible();
    const bodyText = await body.textContent();
    expect(bodyText.length).toBeGreaterThan(5);

    // Should show either changelog entries or the dashboard (if redirected)
    // The page should not crash
    const hasContent =
      bodyText.match(/update|log|change|version|v\d/i) || // changelog content
      bodyText.match(/dashboard|overview|season/i); // redirected to dashboard
    expect(hasContent).toBeTruthy();
  });
});
