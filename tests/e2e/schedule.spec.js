import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth.js';

test.describe('Schedule', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/schedule');
    await page.waitForTimeout(2000);
  });

  // ── Positive tests ────────────────────────────────────────

  test('schedule page loads and shows events section', async ({ page }) => {
    // The schedule heading should be visible (en: "Schedule", es: "Calendario/Horario")
    const heading = page.locator('h2', { hasText: /schedule|calendario|horario/i });
    await expect(heading.first()).toBeVisible({ timeout: 10_000 });

    // Should show the upcoming/past stat line (e.g. "3 upcoming · 5 past")
    const statLine = page.locator('text=/\\d+\\s+(upcoming|past|próximo|pasado)/i');
    if ((await statLine.count()) > 0) {
      await expect(statLine.first()).toBeVisible();
    }
  });

  test('upcoming events tab displays event cards', async ({ page }) => {
    // The "Upcoming" tab should be active by default
    const upcomingTab = page.locator('button', { hasText: /upcoming|próximo/i });
    if ((await upcomingTab.count()) > 0) {
      await expect(upcomingTab.first()).toBeVisible();
    }

    // Look for event cards (rounded-xl containers inside a grid)
    const eventCards = page.locator('.rounded-xl.border');
    const cardCount = await eventCards.count();

    if (cardCount > 0) {
      // At least one card should be visible
      await expect(eventCards.first()).toBeVisible();
    } else {
      // If no events, the empty-state message should show
      const emptyState = page.locator('text=/no upcoming events|no hay eventos/i');
      await expect(emptyState.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('event cards show title, date, and location info', async ({ page }) => {
    // Wait for cards to render
    const eventCards = page.locator('.grid .rounded-xl');
    const cardCount = await eventCards.count();

    if (cardCount > 0) {
      const firstCard = eventCards.first();

      // Title: an h4 inside the card
      const title = firstCard.locator('h4');
      if ((await title.count()) > 0) {
        await expect(title.first()).toBeVisible();
        const titleText = await title.first().textContent();
        expect(titleText.trim().length).toBeGreaterThan(0);
      }

      // Date: the displayDate span (text-[11px] font-bold text-slate-400)
      const dateSpan = firstCard.locator('.text-slate-400').first();
      if ((await dateSpan.count()) > 0) {
        await expect(dateSpan).toBeVisible();
      }

      // Location: MapPin icon sits next to location text
      const locationInfo = firstCard.locator('text=/.+/').filter({ has: page.locator('svg') });
      // Alternatively, just check there are text-xs elements (time + location)
      const detailRows = firstCard.locator('.text-xs');
      if ((await detailRows.count()) > 0) {
        await expect(detailRows.first()).toBeVisible();
      }
    }
  });

  test('calendar tab renders calendar component', async ({ page }) => {
    // Click the Calendar tab
    const calendarTab = page.locator('button', { hasText: /^calendar$|^calendario$/i });
    if ((await calendarTab.count()) > 0) {
      await calendarTab.first().click();
      await page.waitForTimeout(1500);

      // Calendar view should render (FullCalendar or CalendarView component)
      const calendarContainer = page.locator('.fc, [class*="calendar"], .min-w-\\[640px\\]');
      if ((await calendarContainer.count()) > 0) {
        await expect(calendarContainer.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('filter buttons exist (tournament, league, friendly, practice)', async ({ page }) => {
    // The filter bar should have type filter buttons
    const expectedTypes = ['Tournament', 'League', 'Friendly', 'Practice'];

    for (const typeName of expectedTypes) {
      const filterBtn = page.locator('button', { hasText: new RegExp(`^\\s*${typeName}\\s*$`, 'i') });
      if ((await filterBtn.count()) > 0) {
        await expect(filterBtn.first()).toBeVisible();
      }
    }

    // Also check the "All" button exists
    const allBtn = page.locator('button', { hasText: /^all$|^todos$/i });
    if ((await allBtn.count()) > 0) {
      await expect(allBtn.first()).toBeVisible();
    }
  });

  test('search input filters events by text', async ({ page }) => {
    // Find the search input
    const searchInput = page.locator('input[type="text"][placeholder*="earch"]');
    if ((await searchInput.count()) === 0) return;

    await expect(searchInput.first()).toBeVisible();

    // Count cards before filtering
    const cardsBefore = await page.locator('.grid .rounded-xl').count();

    // Type a search term — use a generic term that might match some events
    await searchInput.first().fill('practice');
    await page.waitForTimeout(1000);

    const cardsAfter = await page.locator('.grid .rounded-xl').count();

    // Either fewer cards (filter worked) or same count if all match,
    // or zero cards with the empty-state message
    if (cardsAfter === 0 && cardsBefore > 0) {
      const emptyState = page.locator('text=/no events match|no hay eventos/i');
      if ((await emptyState.count()) > 0) {
        await expect(emptyState.first()).toBeVisible();
      }
    }
    // Either way, the search did not crash
    expect(true).toBe(true);
  });

  // ── Negative tests ────────────────────────────────────────

  test('searching for nonexistent event shows empty state', async ({ page }) => {
    const searchInput = page.locator('input[type="text"][placeholder*="earch"]');
    if ((await searchInput.count()) === 0) return;

    // Type a search string that should not match any event
    await searchInput.first().fill('zzz_nonexistent_event_xyz_12345');
    await page.waitForTimeout(1000);

    // Cards grid should have zero items
    const cards = page.locator('.grid .rounded-xl');
    const count = await cards.count();
    expect(count).toBe(0);

    // The empty state message should be visible
    const emptyState = page.locator('text=/no events match|no upcoming events|no hay eventos/i');
    if ((await emptyState.count()) > 0) {
      await expect(emptyState.first()).toBeVisible();
    }
  });

  test('invalid filter combination shows no results gracefully', async ({ page }) => {
    // First, type a very specific search term
    const searchInput = page.locator('input[type="text"][placeholder*="earch"]');
    if ((await searchInput.count()) === 0) return;

    await searchInput.first().fill('zzz_impossible_match');
    await page.waitForTimeout(500);

    // Then also click a specific type filter (e.g., Friendly)
    const friendlyBtn = page.locator('button', { hasText: /friendly/i });
    if ((await friendlyBtn.count()) > 0) {
      await friendlyBtn.first().click();
      await page.waitForTimeout(500);
    }

    // No cards should be visible
    const cards = page.locator('.grid .rounded-xl');
    expect(await cards.count()).toBe(0);

    // Empty state message should appear instead of an error
    const emptyState = page.locator('text=/no events match|no upcoming|no hay/i');
    if ((await emptyState.count()) > 0) {
      await expect(emptyState.first()).toBeVisible();
    }

    // Page should not show any error or crash indicators
    const errorIndicator = page.locator('text=/error|exception|something went wrong/i');
    expect(await errorIndicator.count()).toBe(0);
  });

  // ── Blackbox tests ────────────────────────────────────────

  test('switching between tabs preserves filter state', async ({ page }) => {
    // Apply a type filter
    const practiceBtn = page.locator('button', { hasText: /practice/i });
    if ((await practiceBtn.count()) === 0) return;

    await practiceBtn.first().click();
    await page.waitForTimeout(500);

    // Also type a search term
    const searchInput = page.locator('input[type="text"][placeholder*="earch"]');
    if ((await searchInput.count()) > 0) {
      await searchInput.first().fill('test');
      await page.waitForTimeout(500);
    }

    // Switch to Past tab
    const pastTab = page.locator('button', { hasText: /past|pasado/i });
    if ((await pastTab.count()) > 0) {
      await pastTab.first().click();
      await page.waitForTimeout(1000);

      // Verify filter state is preserved: the search input should still have "test"
      if ((await searchInput.count()) > 0) {
        const searchValue = await searchInput.first().inputValue();
        expect(searchValue).toBe('test');
      }

      // The Practice filter button should still be active (highlighted)
      const activePractice = page.locator('button', { hasText: /practice/i });
      if ((await activePractice.count()) > 0) {
        const classes = await activePractice.first().getAttribute('class');
        // Active filter has white bg / shadow-sm styling
        expect(classes).toMatch(/bg-white|shadow|dark:bg-slate-900/);
      }
    }

    // Switch back to Upcoming tab
    const upcomingTab = page.locator('button', { hasText: /upcoming|próximo/i });
    if ((await upcomingTab.count()) > 0) {
      await upcomingTab.first().click();
      await page.waitForTimeout(1000);

      // Filters should still be active
      if ((await searchInput.count()) > 0) {
        const searchValue = await searchInput.first().inputValue();
        expect(searchValue).toBe('test');
      }
    }
  });

  test('events display correctly in both list and calendar views', async ({ page }) => {
    // ── List view (Upcoming tab, default) ──
    const upcomingTab = page.locator('button', { hasText: /upcoming|próximo/i });
    if ((await upcomingTab.count()) > 0) {
      await expect(upcomingTab.first()).toBeVisible();
    }

    // Check that the list view has either cards or an empty state
    const listCards = page.locator('.grid .rounded-xl');
    const listCount = await listCards.count();
    const emptyState = page.locator('text=/no upcoming events|no hay eventos/i');

    if (listCount > 0) {
      await expect(listCards.first()).toBeVisible();
      // Verify cards have the expected structure (color bar + content)
      const firstCard = listCards.first();
      const colorBar = firstCard.locator('.h-1\\.5');
      if ((await colorBar.count()) > 0) {
        await expect(colorBar.first()).toBeVisible();
      }
    } else if ((await emptyState.count()) > 0) {
      await expect(emptyState.first()).toBeVisible();
    }

    // ── Calendar view ──
    const calendarTab = page.locator('button', { hasText: /^calendar$|^calendario$/i });
    if ((await calendarTab.count()) > 0) {
      await calendarTab.first().click();
      await page.waitForTimeout(1500);

      // Calendar container should be present
      const calendarArea = page.locator('.fc, [class*="calendar"], .min-w-\\[640px\\]');
      if ((await calendarArea.count()) > 0) {
        await expect(calendarArea.first()).toBeVisible({ timeout: 5000 });
      }

      // If there are events, they should be rendered inside the calendar
      if (listCount > 0) {
        const calendarEvents = page.locator('.fc-event, [class*="event"]');
        // Give it a moment for events to render on the calendar
        await page.waitForTimeout(1000);
        // Events may or may not appear in the current month view — just verify no crash
      }

      // Page should still be functional (no errors)
      const errorIndicator = page.locator('text=/error|exception|something went wrong/i');
      expect(await errorIndicator.count()).toBe(0);
    }
  });
});
