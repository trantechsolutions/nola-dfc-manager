// Supabase Edge Function: team-calendar
// A team's schedule as a calendar feed families subscribe to (webcal://…/team-calendar?t=<token>), for a team
// whose schedule runs in the app (teams.schedule_source = 'app'), or in the feed and the app together ('hybrid':
// the feed's synced events plus the ones added here, all in team_events). Phone calendars poll it and pick up
// new, moved and cancelled events on their own.
//
// Calendar apps can't sign in, so the link carries a secret instead: team_calendar_tokens.token, handed only
// to people on the team by team_calendar_token() (sql/app_schedule_migration.sql). Deploy with
// --no-verify-jwt for that reason; the token is the check.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// The feed covers last season's tail and everything ahead; calendars don't need years of history.
const HISTORY_DAYS = 120;
// An event with no end time shows as 90 minutes, like a single-event "Add to calendar".
const DEFAULT_MINUTES = 90;

const TYPE_LABEL: Record<string, string> = {
  league: 'League game',
  friendly: 'Friendly',
  tournament: 'Tournament',
  practice: 'Practice',
  event: 'Team event',
};

const stamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

// RFC 5545 text: backslash, semicolon and comma are escaped; newlines become \n.
const text = (v: unknown) =>
  String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// Lines over 75 octets are folded with CRLF + space (RFC 5545 §3.1).
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

interface Row {
  uid: string;
  title: string | null;
  description: string | null;
  location: string | null;
  event_date: string;
  end_date: string | null;
  event_type: string | null;
  is_cancelled: boolean | null;
  arrival_minutes: number | null;
  uniform: string | null;
  updated_at: string | null;
}

function vevent(r: Row, teamName: string) {
  const start = r.event_date;
  const end = r.end_date || new Date(new Date(start).getTime() + DEFAULT_MINUTES * 60_000).toISOString();
  const details = [
    TYPE_LABEL[r.event_type || 'event'] || TYPE_LABEL.event,
    r.arrival_minutes ? `Arrive ${r.arrival_minutes} min early` : '',
    r.uniform ? `Uniform: ${r.uniform}` : '',
    r.description || '',
  ].filter(Boolean);
  return [
    'BEGIN:VEVENT',
    `UID:${text(r.uid)}@cantera`,
    `DTSTAMP:${stamp(r.updated_at || new Date().toISOString())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(`${teamName}: ${r.title || TYPE_LABEL[r.event_type || 'event'] || 'Team event'}`)}`,
    r.location ? `LOCATION:${text(r.location)}` : '',
    `DESCRIPTION:${text(details.join('\n'))}`,
    `STATUS:${r.is_cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
  ].filter(Boolean);
}

serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const token = new URL(req.url).searchParams.get('t') || '';
  if (!/^[0-9a-f]{36}$/.test(token)) return new Response('Not found', { status: 404 });

  const { data: link } = await supabase.from('team_calendar_tokens').select('team_id').eq('token', token).maybeSingle();
  if (!link) return new Response('Not found', { status: 404 });

  const { data: team } = await supabase.from('teams').select('name').eq('id', link.team_id).maybeSingle();
  const teamName = team?.name || 'Team';
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
  const { data: rows, error } = await supabase
    .from('team_events')
    .select('uid, title, description, location, event_date, end_date, event_type, is_cancelled, arrival_minutes, uniform, updated_at')
    .eq('team_id', link.team_id)
    .gte('event_date', since)
    .order('event_date');
  if (error) return new Response('Could not read the schedule', { status: 500 });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cantera Manager//Team schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(teamName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...((rows || []) as Row[]).flatMap((r) => vevent(r, teamName)),
    'END:VCALENDAR',
  ];
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${teamName.replace(/[^\w -]/g, '')}.ics"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
});
