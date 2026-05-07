// Supabase Edge Function: notify-push
// Sends Web Push notifications to target users via VAPID.
// Deno runtime — uses npm:web-push specifier.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — npm specifier resolved by Deno
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@teammanager.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface NotifyPayload {
  eventType: string;
  teamId?: string;
  clubId?: string;
  userIds?: string[];
  title: string;
  body: string;
  url?: string;
}

async function resolveTargetUserIds(payload: NotifyPayload): Promise<string[]> {
  if (payload.userIds?.length) return payload.userIds;

  if (payload.teamId) {
    // All user_roles for this team + guardian user_ids via user_profiles matched to player guardians
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('team_id', payload.teamId);

    const staffIds = (roles || []).map((r: { user_id: string }) => r.user_id);

    // Get guardian emails for active players on this team
    const { data: players } = await supabase
      .from('players')
      .select('guardians(email)')
      .eq('team_id', payload.teamId)
      .eq('status', 'active');

    const guardianEmails = [
      ...new Set(
        (players || [])
          .flatMap((p: { guardians: { email: string }[] }) => p.guardians || [])
          .map((g: { email: string }) => g.email?.toLowerCase())
          .filter(Boolean),
      ),
    ];

    let guardianIds: string[] = [];
    if (guardianEmails.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id')
        .in('email', guardianEmails);
      guardianIds = (profiles || []).map((p: { user_id: string }) => p.user_id);
    }

    return [...new Set([...staffIds, ...guardianIds])];
  }

  if (payload.clubId) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('club_id', payload.clubId);
    return (roles || []).map((r: { user_id: string }) => r.user_id);
  }

  return [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const payload: NotifyPayload = await req.json();
    const { title, body, url = '/', eventType } = payload;

    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title and body are required' }), { status: 400 });
    }

    const targetUserIds = await resolveTargetUserIds(payload);
    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No target users found' }), { status: 200 });
    }

    // Fetch push subscriptions for all targets
    const { data: subscriptions, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', targetUserIds);

    if (subErr) throw subErr;
    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No push subscriptions found' }), { status: 200 });
    }

    const pushPayload = JSON.stringify({ title, body, url });
    const staleIds: string[] = [];
    let sent = 0;

    await Promise.allSettled(
      subscriptions.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload,
            { TTL: 86400 }, // 24h TTL
          );
          sent++;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410 || status === 404) {
            // Subscription expired — queue for cleanup
            staleIds.push(sub.id);
          } else {
            console.error('[notify-push] send failed:', sub.endpoint, err);
          }
        }
      }),
    );

    // Clean up stale subscriptions
    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    // Log the notification
    await supabase.from('notification_log').insert({
      team_id: payload.teamId ?? null,
      club_id: payload.clubId ?? null,
      event_type: eventType,
      title,
      body,
      target_count: sent,
    });

    return new Response(
      JSON.stringify({ sent, staleRemoved: staleIds.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[notify-push] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
