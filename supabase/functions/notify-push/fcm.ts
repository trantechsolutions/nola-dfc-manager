// Firebase Cloud Messaging (HTTP v1): notifications for the iOS and Android app. Android goes straight through
// FCM; iOS goes through FCM to Apple (the APNs key is uploaded to the Firebase project once).
//
// Needs the edge function secret FCM_SERVICE_ACCOUNT: the JSON key of a Firebase service account with the
// "Firebase Cloud Messaging API Admin" role. Without it, phone-app notifications are skipped and web push still goes.

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface FcmMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
  urgent: boolean;
}

export type FcmResult = { ok: true } | { ok: false; gone: boolean; retry: boolean; error: string };

const account: ServiceAccount | null = (() => {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('[fcm] FCM_SERVICE_ACCOUNT is not valid JSON');
    return null;
  }
})();

export const fcmConfigured = () => !!account;

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Google's OAuth access tokens last an hour; one is reused across sends while the function stays warm.
let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (!account) throw new Error('FCM not configured');
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`FCM auth failed: ${res.status} ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  cached = { token: access_token, expires: Date.now() + expires_in * 1000 };
  return access_token;
}

export async function sendFcm(token: string, m: FcmMessage): Promise<FcmResult> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account!.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: m.title, body: m.body },
          // Read by the app when the notification is tapped (src/native/push.js).
          data: { url: m.url, tag: m.tag },
          android: {
            // High priority wakes a dozing phone straight away; normal may be held for battery.
            priority: m.urgent ? 'HIGH' : 'NORMAL',
            ttl: '86400s',
            notification: { tag: m.tag, channel_id: 'alerts' },
          },
          apns: {
            headers: {
              'apns-priority': m.urgent ? '10' : '5',
              // Replaces an earlier notification with the same id rather than stacking (max 64 bytes).
              'apns-collapse-id': m.tag.slice(0, 64),
            },
            payload: { aps: { sound: 'default', 'thread-id': m.tag } },
          },
        },
      }),
    });
    if (res.ok) return { ok: true };
    const text = await res.text();
    // The app was uninstalled or the token rotated: forget it.
    const gone = res.status === 404 || /UNREGISTERED|registration token is not a valid/i.test(text);
    const retry = res.status === 429 || res.status >= 500;
    return { ok: false, gone, retry, error: `${res.status}: ${text.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, gone: false, retry: true, error: String((err as Error).message ?? err) };
  }
}
