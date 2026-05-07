import { supabase } from '../supabase';

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

      const json = subscription.toJSON();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: 'endpoint' },
      );

      if (error) throw error;
      return { success: true, subscription };
    } catch (e) {
      console.error('[push] Subscribe failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  async unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return { success: true };

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      return { success: true };
    } catch (e) {
      console.error('[push] Unsubscribe failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  async getCurrentSubscription() {
    try {
      const reg = await navigator.serviceWorker.ready;
      return await reg.pushManager.getSubscription();
    } catch {
      return null;
    }
  },

  async isSubscribed() {
    const sub = await this.getCurrentSubscription();
    return !!sub;
  },

  // Send a broadcast notification to a team via Edge Function
  async broadcast({ teamId, clubId, title, body, url = '/' }) {
    const { data, error } = await supabase.functions.invoke('notify-push', {
      body: { eventType: 'broadcast', teamId, clubId, title, body, url },
    });
    if (error) throw error;
    return data;
  },

  // Notify specific user IDs (used for targeted alerts like compliance)
  async notifyUsers({ userIds, title, body, url = '/', eventType = 'alert' }) {
    const { data, error } = await supabase.functions.invoke('notify-push', {
      body: { eventType, userIds, title, body, url },
    });
    if (error) throw error;
    return data;
  },
};
