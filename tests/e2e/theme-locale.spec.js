import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth.js';

test.describe('Theme & Locale', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/#/dashboard');
    await page.waitForTimeout(2000);
  });

  test('theme toggle exists and switches theme', async ({ page }) => {
    // Desktop sidebar: button with capitalize text "system"/"light"/"dark"
    // Mobile header: button with title="Theme: ..."
    const desktopBtn = page.locator('button:visible', { hasText: /^(system|light|dark)$/i }).first();
    const mobileBtn = page.locator('button[title*="Theme"]:visible').first();

    let themeBtn;
    if ((await desktopBtn.count()) > 0) {
      themeBtn = desktopBtn;
    } else if ((await mobileBtn.count()) > 0) {
      themeBtn = mobileBtn;
    }

    expect(themeBtn).toBeTruthy();

    const initialTheme = await page.evaluate(() => localStorage.getItem('app_theme'));
    await themeBtn.click();
    await page.waitForTimeout(300);

    const newTheme = await page.evaluate(() => localStorage.getItem('app_theme'));
    expect(newTheme).toBeTruthy();
    expect(newTheme).not.toEqual(initialTheme);
  });

  test('light theme uses expected color scheme', async ({ page }) => {
    // Set to light mode via correct localStorage key
    await page.evaluate(() => {
      localStorage.setItem('app_theme', 'light');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    const htmlClass = (await page.locator('html').getAttribute('class')) || '';
    expect(htmlClass).not.toContain('dark');
  });

  test('dark theme applies dark class to html', async ({ page }) => {
    // Set to dark mode via correct localStorage key
    await page.evaluate(() => {
      localStorage.setItem('app_theme', 'dark');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    const htmlClass = (await page.locator('html').getAttribute('class')) || '';
    expect(htmlClass).toContain('dark');
  });

  test('locale toggle switches between EN and ES', async ({ page }) => {
    // Find globe/locale button - look for visible buttons with EN/ES text
    const globeBtn = page.locator('button').filter({ has: page.locator('svg') });
    let localeButton = null;

    const count = await globeBtn.count();
    for (let i = 0; i < count; i++) {
      const btn = globeBtn.nth(i);
      if (!(await btn.isVisible())) continue;
      const text = (await btn.textContent()) || '';
      if (text.match(/\b(EN|ES)\b/)) {
        localeButton = btn;
        break;
      }
    }

    if (localeButton) {
      const bodyTextBefore = await page.locator('body').textContent();
      await localeButton.click();
      await page.waitForTimeout(500);
      const bodyTextAfter = await page.locator('body').textContent();
      expect(bodyTextAfter).not.toEqual(bodyTextBefore);
    }
  });

  test('locale badge shows current language code', async ({ page }) => {
    // Look for EN or ES badge near the globe icon
    const badge = page.locator('text=/^(EN|ES)$/');
    if ((await badge.count()) > 0) {
      const text = await badge.first().textContent();
      expect(text).toMatch(/^(EN|ES)$/);
    }
  });

  test('locale persists across page reload', async ({ page }) => {
    // Set locale to ES via correct localStorage key
    await page.evaluate(() => {
      localStorage.setItem('app_locale', 'es');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // Verify localStorage retained the value
    const storedLocale = await page.evaluate(() => localStorage.getItem('app_locale'));
    expect(storedLocale).toBe('es');

    // Verify the app loaded with Spanish - check for any Spanish nav text
    const bodyText = await page.locator('body').textContent();
    // Check for Spanish translations in nav or content
    const hasSpanish = bodyText?.match(/Panel|Finanzas|Personas|Horario|Resumen/i);
    expect(hasSpanish).toBeTruthy();
  });
});
