// Supabase Edge Function: notify-push
// Delivers one row of the `notifications` table (sql/notifications_migration.sql) to every device of everyone
// it's for: browsers through Web Push (VAPID), the iOS / Android app through Firebase Cloud Messaging (fcm.ts).
// The database calls this itself when the row is written, and again from its retry sweep, so a notification
// doesn't depend on the sender's phone staying online after saving. Each device's result is recorded in
// notification_deliveries; a retry only goes to devices that haven't got it yet.
// Deno runtime — uses npm:web-push specifier.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — npm specifier resolved by Deno
import webpush from 'npm:web-push@3.6.7';
import { fcmConfigured, sendFcm } from './fcm.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@teammanager.app';
// Shared with the database (Vault: notify_push_secret). Only the database's own dispatch carries it, so no app,
// browser or stranger holding the public key can make this function send anything.
const NOTIFY_PUSH_SECRET = Deno.env.get('NOTIFY_PUSH_SECRET') ?? '';
// Matches notify_retry() in the migration: after this many tries a notification is left as it is.
const MAX_ATTEMPTS = 4;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  tag: string | null;
  status: string;
  attempts: number;
}

interface SendResult {
  ok: boolean;
  gone?: boolean;
  retry?: boolean;
  error?: string;
}

interface Target {
  target: string;
  channel: 'web' | 'app';
  user_id: string;
  send: () => Promise<SendResult>;
  forget: () => PromiseLike<unknown>;
}

// Compares in constant time, so the secret can't be guessed a character at a time from response timings.
function secretMatches(given: string | null) {
  if (!NOTIFY_PUSH_SECRET || !given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(NOTIFY_PUSH_SECRET);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Every browser and phone the recipients have notifications turned on for.
async function targetsFor(n: Notification, userIds: string[]): Promise<Target[]> {
  if (!userIds.length) return [];
  const tag = n.tag || n.url;
  // A paperwork status can wait for the phone's next wake-up; chat, schedule and reminders can't.
  const urgent = n.kind !== 'alert';
  const targets: Target[] = [];

  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (subErr) throw subErr;
  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag });
  for (const sub of subs || []) {
    targets.push({
      target: sub.endpoint,
      channel: 'web',
      user_id: sub.user_id,
      send: async () => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 86400, urgency: urgent ? 'high' : 'normal' },
          );
          return { ok: true };
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          return {
            ok: false,
            // The browser threw this subscription away.
            gone: status === 404 || status === 410,
            retry: !status || status === 429 || status >= 500,
            error: `${status ?? 'network'}: ${String((err as Error).message ?? err).slice(0, 300)}`,
          };
        }
      },
      forget: () => supabase.from('push_subscriptions').delete().eq('id', sub.id),
    });
  }

  if (fcmConfigured()) {
    const { data: devices, error: devErr } = await supabase
      .from('device_tokens')
      .select('token, user_id')
      .in('user_id', userIds);
    if (devErr) throw devErr;
    const message = { title: n.title, body: n.body, url: n.url, tag, urgent };
    for (const d of devices || []) {
      targets.push({
        target: d.token,
        channel: 'app',
        user_id: d.user_id,
        send: () => sendFcm(d.token, message),
        forget: () => supabase.from('device_tokens').delete().eq('token', d.token),
      });
    }
  }
  return targets;
}

async function deliver(n: Notification) {
  const attempt = n.attempts + 1;
  await supabase
    .from('notifications')
    .update({ status: 'sending', attempts: attempt, attempted_at: new Date().toISOString() })
    .eq('id', n.id);

  const { data: recipients, error: rErr } = await supabase.rpc('notification_recipients', { p_id: n.id });
  if (rErr) throw rErr;
  const userIds = (recipients || []) as string[];

  // A retry skips devices that already have it (or no longer exist).
  const { data: done } = await supabase
    .from('notification_deliveries')
    .select('target')
    .eq('notification_id', n.id)
    .in('status', ['sent', 'gone']);
  const skip = new Set((done || []).map((d: { target: string }) => d.target));
  const targets = (await targetsFor(n, userIds)).filter((t) => !skip.has(t.target));

  const results = await Promise.all(targets.map(async (t) => ({ t, r: await t.send() })));

  const now = new Date().toISOString();
  const rows = results.map(({ t, r }) => ({
    notification_id: n.id,
    target: t.target,
    channel: t.channel,
    user_id: t.user_id,
    status: r.ok ? 'sent' : r.gone ? 'gone' : 'failed',
    error: r.ok ? null : r.error,
    attempts: attempt,
    updated_at: now,
  }));
  if (rows.length) await supabase.from('notification_deliveries').upsert(rows);
  await Promise.all(results.filter(({ r }) => r.gone).map(({ t }) => t.forget()));

  const sentNow = results.filter(({ r }) => r.ok).length;
  const retryable = results.filter(({ r }) => !r.ok && !r.gone && r.retry).length;
  const errors = results.filter(({ r }) => !r.ok && !r.gone).map(({ r }) => r.error);
  // Temporary failures go back to the sweep for another try; anything else is as done as it'll get.
  const status = retryable && attempt < MAX_ATTEMPTS ? 'failed' : 'sent';

  await supabase
    .from('notifications')
    .update({
      status,
      sent_count: skip.size + sentNow,
      last_error: errors.length ? errors.slice(0, 5).join('\n') : null,
      sent_at: status === 'sent' ? now : null,
    })
    .eq('id', n.id);

  return { recipients: userIds.length, devices: targets.length, sent: sentNow, failed: errors.length, status };
}

// Called only by the database (pg_net), never from a browser, so there's no CORS preflight to answer.
serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!secretMatches(req.headers.get('x-notify-secret'))) return json({ error: 'forbidden' }, 403);

  try {
    const { id } = await req.json();
    if (!id) return json({ error: 'id is required' }, 400);

    const { data: n, error } = await supabase.from('notifications').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!n) return json({ error: 'not found' }, 404);
    if (n.status === 'sent' || n.attempts >= MAX_ATTEMPTS) return json({ sent: 0, message: 'nothing to do' });

    return json(await deliver(n as Notification));
  } catch (err) {
    console.error('[notify-push] error:', err);
    return json({ error: String(err) }, 500);
  }
});
