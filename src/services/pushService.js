import { supabase } from '../supabase';
import { isNative } from '../native/platform';
import { nativePush } from '../native/push';

// VAPID public key — generated once per deployment, must match the private key in Edge Function secrets
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const pushService = {
  isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  async getPermission() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  async registerServiceWorker() {
    if (!this.isSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      return reg;
    } catch (e) {
      console.warn('[push] SW registration failed:', e.message);
      return null;
    }
  },

  async subscribe() {
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[push] VITE_VAPID_PUBLIC_KEY not set — push disabled');
      return { success: false, error: 'VAPID key not configured' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permission denied' };
    }

    try {
      const reg = await this.registerServiceWorker();
      if (!reg) return { success: false, error: 'Service worker unavailable' };

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await this.saveSubscription(subscription.toJSON());
      return { success: true, subscription };
    } catch (e) {
      console.error('[push] Subscribe failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  // Files this browser's subscription under whoever is signed in now.
  async saveSubscription(json) {
    if (!json?.endpoint || !json.keys) return;
    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
    });
    if (error) throw error;
  },

  /**
   * On every start with notifications allowed: make sure the server has this browser's current subscription.
   * Browsers quietly replace or drop subscriptions now and then, and a notification sent to the old one never
   * arrives — so it's re-saved (or renewed) here rather than only when someone taps "turn on".
   */
  async refresh() {
    if (!this.isSupported() || Notification.permission !== 'granted' || !VAPID_PUBLIC_KEY) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const reg = await this.registerServiceWorker();
      if (!reg) return;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      await this.saveSubscription(sub.toJSON());
    } catch (e) {
      console.warn('[push] refresh failed:', e?.message);
    }
  },

  async unsubscribe() {
    try {
      const subscription = await this.getCurrentSubscription();
      if (!subscription) return { success: true };

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await supabase.rpc('unregister_push_subscription', { p_endpoint: endpoint });
      return { success: true };
    } catch (e) {
      console.error('[push] Unsubscribe failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  async getCurrentSubscription() {
    try {
      // getRegistration, not `ready`: `ready` never settles where no worker was registered (dev, the app shell),
      // which would hang anything waiting on it — signing out included.
      if (!this.isSupported()) return null;
      const reg = await navigator.serviceWorker.getRegistration('/');
      return reg ? await reg.pushManager.getSubscription() : null;
    } catch {
      return null;
    }
  },

  async isSubscribed() {
    const sub = await this.getCurrentSubscription();
    return !!sub;
  },

  // Called just before signing out: this device stops getting the account's notifications.
  async forgetDevice() {
    if (isNative) return nativePush.forgetDevice();
    try {
      const sub = await this.getCurrentSubscription();
      if (sub) await supabase.rpc('unregister_push_subscription', { p_endpoint: sub.endpoint });
    } catch {
      // Signing out goes ahead regardless.
    }
  },

  // Notifications are rows in `notifications`; the database sends them (sql/notifications_migration.sql), so
  // one only fails here if it couldn't be saved — not because this phone went offline afterwards.
  // Chat messages need nothing from the app: a trigger turns each new message into a notification.
  async queue({ kind, teamId, playerId = null, title, body, url = '/', tag = null }) {
    const { error } = await supabase.from('notifications').insert({
      kind,
      team_id: teamId,
      player_id: playerId,
      title: String(title).slice(0, 120),
      body: String(body).slice(0, 500),
      url,
      tag,
    });
    if (error) throw error;
  },

  // A message from staff to everyone on a team.
  broadcast({ teamId, title, body, url = '/' }) {
    return this.queue({ kind: 'broadcast', teamId, title, body, url });
  },

  // A schedule change, to everyone on the team.
  scheduleChange({ teamId, title, body }) {
    return this.queue({ kind: 'schedule', teamId, title, body, url: '/schedule', tag: `schedule-${teamId}` });
  },

  // Something about one player (a compliance item approved or flagged), to that player's family.
  playerAlert({ teamId, playerId, title, body, url = '/dashboard' }) {
    return this.queue({ kind: 'alert', teamId, playerId, title, body, url });
  },
};
