// Start-up wiring for the Capacitor shell. A no-op in a browser, so main.jsx calls it unconditionally.
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '../supabase';
import { isNative, nativePlatform, AUTH_CALLBACK_URL, publicOrigin } from './platform';
import { nativePush } from './push';

export { isNative, nativePlatform, publicOrigin, authRedirectUrl, AUTH_CALLBACK_URL } from './platform';

/**
 * Supabase returns to the shell with its tokens in the hash (implicit flow, see supabase.js). Putting them on
 * the page's own address and reloading hands them to the same code a browser uses: the Supabase client picks
 * up the session, and App.jsx spots a password-recovery link.
 */
function finishAuth(url) {
  const hash = url.slice(url.indexOf('#'));
  Browser.close().catch(() => {});
  if (!url.includes('#') || hash.length < 2) return;
  window.history.replaceState(null, '', `/${hash}`);
  window.location.reload();
}

// A link to the app itself (a tapped notification, a shared chat link) opens the screen it names.
function openInApp(url) {
  const { pathname, search, hash } = new URL(url, window.location.origin);
  window.history.pushState(null, '', pathname + search + hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function initNative() {
  if (!isNative) return;
  document.documentElement.classList.add('native', `native-${nativePlatform}`);

  App.addListener('appUrlOpen', ({ url }) => {
    if (url.startsWith(AUTH_CALLBACK_URL)) finishAuth(url);
    else if (url.startsWith(publicOrigin())) openInApp(url);
  });

  // Android's back button walks back through the app, and only leaves it from the first screen.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  });

  // Notifications: keep this phone's token on file for whoever is signed in, and open what a tap points at.
  nativePush.listen(openInApp);
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') nativePush.refresh();
  });
}

/**
 * Sends someone through an OAuth provider. In the shell the provider page opens in the system browser sheet
 * (Google refuses sign-in inside an embedded web view) and comes back through AUTH_CALLBACK_URL.
 */
export async function openAuthUrl(url) {
  if (isNative) await Browser.open({ url, presentationStyle: 'popover' });
  else window.location.assign(url);
}
