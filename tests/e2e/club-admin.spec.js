import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth.js';

test.describe('Club Overview (/club-overview)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/club-overview');
    await page.waitForTimeout(2000);
  });

  test('club overview page loads with club name', async ({ page }) => {
    // The overview header should include the club name (seeded as TEST_E2E_Club)
    const heading = page.locator('h2', { hasText: /TEST_E2E_Club/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('shows team summary cards', async ({ page }) => {
    // Per-team cards section should have a "Teams" heading and at least one team card
    const teamsHeading = page.locator('h3', { hasText: /teams/i });
    await expect(teamsHeading).toBeVisible({ timeout: 10_000 });

    // Each team card has a team name and player/staff counts
    const teamCards = page.locator('.rounded-2xl.border.cursor-pointer');
    const count = await teamCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('shows compliance section', async ({ page }) => {
    // Should show either compliance alerts or the "All Players Compliant" banner
    const complianceAlert = page.locator('text=/compliance|compliant/i');
    await expect(complianceAlert.first()).toBeVisible({ timeout: 10_000 });
  });

  test('displays financial summary stats', async ({ page }) => {
    // The summary cards grid should contain Total Players, Compliance Rate, Documents, Staff Members
    const summaryGrid = page.locator('.grid.grid-cols-2');
    await expect(summaryGrid.first()).toBeVisible({ timeout: 10_000 });

    // Check for stat labels (uppercase text in summary cards)
    const totalPlayersLabel = page.locator('text=/total players|jugadores totales/i');
    await expect(totalPlayersLabel.first()).toBeVisible({ timeout: 5_000 });

    const staffLabel = page.locator('text=/staff members|miembros/i');
    await expect(staffLabel.first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Club Teams (/club-teams) — Positive', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/club-teams');
    await page.waitForTimeout(2000);
  });

  test('teams page lists all teams', async ({ page }) => {
    // The page header should show team count
    const header = page.locator('h2');
    await expect(header.first()).toBeVisible({ timeout: 10_000 });

    // Should see at least one team card
    const teamCards = page.locator('.rounded-2xl.border');
    const count = await teamCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('team cards show name, age group, gender, tier badge', async ({ page }) => {
    // Find the first team card and verify it has the expected elements
    const firstTeamName = page.locator('h3.font-black', { hasText: /TEST_E2E_/ });
    await expect(firstTeamName.first()).toBeVisible({ timeout: 10_000 });

    // Age group and gender should be present within the card info area
    const ageGroupText = page.locator('text=/U14|U12/');
    await expect(ageGroupText.first()).toBeVisible({ timeout: 5_000 });

    const genderText = page.locator('text=/Boys|Girls/');
    await expect(genderText.first()).toBeVisible({ timeout: 5_000 });

    // Tier badge (uppercase label like COMPETITIVE or RECREATIONAL)
    const tierBadge = page.locator('span.uppercase', { hasText: /competitive|recreational/i });
    await expect(tierBadge.first()).toBeVisible({ timeout: 5_000 });
  });

  test('can expand a team card to see roles section', async ({ page }) => {
    // Click the settings/expand button (has Settings icon + chevron) on the first team card
    const expandBtn = page.locator('button[title="Manage roles"]').first();
    await expect(expandBtn).toBeVisible({ timeout: 10_000 });
    await expandBtn.click();
    await page.waitForTimeout(1000);

    // The expanded section should show "Team Roles" heading
    const rolesHeading = page.locator('text=/Team Roles/i');
    await expect(rolesHeading).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Club Teams — Negative', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/club-teams');
    await page.waitForTimeout(2000);
  });

  test('creating a team with empty name should not submit (button disabled or validation)', async ({ page }) => {
    // Click the "Add Team" button to open the create form
    const addBtn = page.locator('button', { hasText: /add team|agregar/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();
    await page.waitForTimeout(500);

    // The create form should be visible
    const modal = page.locator('text=/Create Team/i').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // The name field should be empty — verify the submit button is disabled
    const nameInput = page.locator('input[placeholder*="2014"]');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('');

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();

    // Type a space and clear it — still should be disabled
    await nameInput.fill('   ');
    await nameInput.clear();
    await expect(submitBtn).toBeDisabled();
  });
});

test.describe('Club Admin Hub (/club-admin)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/club-admin');
    await page.waitForTimeout(2000);
  });

  test('club admin hub loads with tabs', async ({ page }) => {
    // Should show three tabs: Club Settings, Users, Categories
    const settingsTab = page.locator('button', { hasText: /Club Settings/i });
    await expect(settingsTab).toBeVisible({ timeout: 10_000 });

    const usersTab = page.locator('button', { hasText: /Users/i });
    await expect(usersTab).toBeVisible({ timeout: 5_000 });

    const categoriesTab = page.locator('button', { hasText: /Categories/i });
    await expect(categoriesTab).toBeVisible({ timeout: 5_000 });
  });

  test('settings tab shows club name', async ({ page }) => {
    // The Settings tab is the default — should show the club name input or label
    const clubNameEl = page.locator('text=/TEST_E2E_Club/');
    await expect(clubNameEl.first()).toBeVisible({ timeout: 10_000 });
  });

  test('users tab shows staff directory', async ({ page }) => {
    // Click Users tab
    const usersTab = page.locator('button', { hasText: /Users/i });
    await usersTab.click();
    await page.waitForTimeout(2000);

    // Should show a directory or user listing area (search input, user cards, or invite button)
    const directoryContent = page.locator('text=/directory|staff|invite|search/i');
    if ((await directoryContent.count()) > 0) {
      await expect(directoryContent.first()).toBeVisible({ timeout: 10_000 });
    } else {
      // At minimum, the Users tab should render some content — check for any visible element
      const content = page.locator('main, [class*="space-y"]');
      await expect(content.first()).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe('Club Onboarding (/club-onboard)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/club-onboard');
    await page.waitForTimeout(2000);
  });

  test('onboarding page loads with step indicators', async ({ page }) => {
    // Should show a heading related to team setup/onboarding
    const heading = page.locator('h2').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
    const headingText = await heading.textContent();
    expect(headingText).toBeTruthy();

    // Should have some form content (inputs or step indicators)
    const formContent = page.locator('input, select, .rounded-full');
    const count = await formContent.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Blackbox — Multi-team', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/club-teams');
    await page.waitForTimeout(2000);
  });

  test('two teams visible in team list (TEST_E2E_Team U14 and TEST_E2E_Team U12)', async ({ page }) => {
    // Both seeded teams should be visible
    const teamU14 = page.locator('h3', { hasText: 'TEST_E2E_Team U14' });
    await expect(teamU14.first()).toBeVisible({ timeout: 10_000 });

    const teamU12 = page.locator('h3', { hasText: 'TEST_E2E_Team U12' });
    await expect(teamU12.first()).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a team navigates to that team dashboard', async ({ page }) => {
    // Click on the first team name (TEST_E2E_Team U14)
    const teamLink = page.locator('.cursor-pointer', { hasText: /TEST_E2E_Team U14/ }).first();
    await expect(teamLink).toBeVisible({ timeout: 10_000 });
    await teamLink.click();

    // Should navigate to the team dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await page.waitForTimeout(2000);

    // Dashboard should be visible — look for overview/dashboard indicators
    const dashboardContent = page.locator('main');
    await expect(dashboardContent).toBeVisible({ timeout: 5_000 });
  });
});
