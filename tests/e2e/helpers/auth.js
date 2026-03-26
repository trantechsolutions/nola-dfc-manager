/**
 * Auth helper — logs in via the UI or directly via Supabase auth
 * and stores the session in localStorage for the app to pick up.
 */
import { adminClient } from './supabaseAdmin.js';
import { TEST_USER } from './seed.js';

/**
 * Login via the app's login page UI.
 */
export async function loginViaUI(page) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10_000 });
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');

  // Wait for navigation — retry once if login fails (e.g., transient auth error)
  try {
    await page.waitForURL(/\/(dashboard|club)/, { timeout: 15_000 });
  } catch {
    // Check if we got an error message and retry
    const errorMsg = page.locator('text=/invalid|error/i');
    if ((await errorMsg.count()) > 0) {
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|club)/, { timeout: 15_000 });
    }
  }
}

/**
 * Login by injecting a Supabase session directly (faster, for non-auth tests).
 */
export async function loginDirect(page) {
  // Get a valid session token via admin API
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_USER.email,
  });
  if (error) throw new Error(`Failed to generate link: ${error.message}`);

  // Sign in with password to get session tokens
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
  });

  if (!response.ok) {
    throw new Error(`Direct login failed: ${response.statusText}`);
  }

  const session = await response.json();

  // Navigate to the app and inject session into localStorage
  await page.goto('/');
  await page.evaluate((sessionData) => {
    const storageKey = Object.keys(sessionData).length
      ? `sb-${new URL(sessionData.url).hostname.split('.')[0]}-auth-token`
      : null;
    // Supabase stores session under this key pattern
    const key = `sb-drzxqlptwizicihkdfbi-auth-token`;
    localStorage.setItem(
      key,
      JSON.stringify({
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
        expires_at: sessionData.expires_at,
        expires_in: sessionData.expires_in,
        token_type: sessionData.token_type,
        user: sessionData.user,
      }),
    );
  }, session);

  // Reload to pick up the session
  await page.reload();
  await page.waitForURL(/\/(dashboard|club)/, { timeout: 15_000 });
}
