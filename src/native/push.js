// Notifications inside the iOS / Android app. The web's push (service worker + VAPID) doesn't exist in the
// shell, so the phone registers a Firebase Cloud Messaging token and notify-push sends to it. Mirrors the shape
// of pushService's web half so usePushNotifications can use either.
import { registerPlugin } from '@capacitor/core';
import { supabase } from '../supabase';
import { isNative, nativePlatform } from './platform';

// The native half comes from @capacitor-firebase/messaging (installed so `cap sync` builds it into the app).
// Registered by name rather than imported: the package's own entry pulls in the Firebase web SDK for browsers,
// which this app never uses — the web keeps its own push.
const FirebaseMessaging = registerPlugin('FirebaseMessaging');

const TOKEN_KEY = 'native_push_token_v1';

const remember = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token is fetched again next time.
  }
};
const remembered = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

async function save(token) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || !token) return;
  const { error } = await supabase.rpc('register_device_token', { p_token: token, p_platform: nativePlatform });
  if (error) throw error;
  remember(token);
}

export const nativePush = {
  isSupported: () => isNative,

  // Same words as the browser's Notification.permission, so the UI doesn't care which it's talking to.
  async getPermission() {
    const { receive } = await FirebaseMessaging.checkPermissions();
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'default';
  },

  async subscribe() {
    try {
      const { receive } = await FirebaseMessaging.requestPermissions();
      if (receive !== 'granted') return { success: false, error: 'Permission denied' };
      const { token } = await FirebaseMessaging.getToken();
      await save(token);
      return { success: true };
    } catch (e) {
      console.error('[push] native subscribe failed:', e?.message);
      return { success: false, error: e?.message || 'Could not turn on notifications' };
    }
  },

  async unsubscribe() {
    try {
      const token = remembered();
      if (token) await supabase.rpc('unregister_device_token', { p_token: token });
      await FirebaseMessaging.deleteToken();
      remember(null);
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message };
    }
  },

  async isSubscribed() {
    return (await this.getPermission()) === 'granted' && !!remembered();
  },

  /**
   * Every launch and sign-in: re-save this phone's current token (Firebase rotates them now and then, and a
   * phone that changed hands should follow its new owner). Silent when notifications aren't turned on.
   */
  async refresh() {
    if (!isNative || (await this.getPermission()) !== 'granted') return;
    try {
      const { token } = await FirebaseMessaging.getToken();
      await save(token);
    } catch (e) {
      console.warn('[push] native token refresh failed:', e?.message);
    }
  },

  // Signing out stops this phone's notifications; turning them back on happens at the next sign-in.
  async forgetDevice() {
    const token = remembered();
    if (token) await supabase.rpc('unregister_device_token', { p_token: token }).catch(() => {});
  },

  /** Keeps the token current and opens the screen a tapped notification points at. */
  listen(openUrl) {
    if (!isNative) return;
    // Android 8+ needs a channel, and only a high-importance one pops up over other apps.
    if (nativePlatform === 'android') {
      FirebaseMessaging.createChannel({
        id: 'alerts',
        name: 'Team alerts',
        description: 'Chat, schedule changes and reminders',
        importance: 4,
        visibility: 1,
      }).catch(() => {});
    }
    FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
      save(token).catch(() => {});
    });
    FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
      const url = notification?.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) openUrl(url);
    });
  },
};
