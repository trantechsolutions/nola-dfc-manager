// Where the app is running: a browser tab, an installed PWA, or the Capacitor shell on iOS / Android.
// Everything that has to behave differently inside the shell asks here rather than sniffing user agents.
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/** 'ios' | 'android' | 'web' */
export const nativePlatform = Capacitor.getPlatform();

// Must match appId in capacitor.config.json and the URL scheme registered by the iOS and Android projects.
export const APP_SCHEME = 'com.canteramanager.app';

// Where Supabase sends someone back after Google, a magic link or a password reset when they started in the
// shell. Add it to the Supabase Auth redirect allow-list.
export const AUTH_CALLBACK_URL = `${APP_SCHEME}://auth-callback`;

/**
 * The app's public web address. Inside the shell the page's own origin is capacitor://localhost (iOS) or
 * https://localhost (Android), which means nothing to someone a link is shared with.
 */
export function publicOrigin() {
  if (isNative) return (import.meta.env.VITE_PUBLIC_APP_URL || 'https://app.canteramanager.com').replace(/\/$/, '');
  return window.location.origin;
}

/** Where an auth email or provider should return to: this page on the web, the app's callback in the shell. */
export function authRedirectUrl(path = window.location.pathname) {
  return isNative ? AUTH_CALLBACK_URL : window.location.origin + path;
}
