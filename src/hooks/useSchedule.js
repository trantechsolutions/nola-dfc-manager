// src/hooks/useSchedule.js
// Fetches iCal events for a specific team using the team's ical_url.
// Falls back to the legacy hardcoded URL if no team is provided.

import { useState, useEffect, useCallback, useRef } from 'react';
import ICAL from 'ical.js';
import { supabaseService } from '../services/supabaseService';
import { classifyEvent, detectFeedSource, extractTournamentName } from '../utils/eventClassifier';
import { fetchIcs } from '../utils/fetchIcs';

const LEGACY_ICAL_URL =
  'https://gist.githubusercontent.com/DeMarko/6142417/raw/1cd301a5917141524b712f92c2e955e86a1add19/sample.ics';

const THREE_DAYS_S = 3 * 24 * 60 * 60; // 3 days in seconds

/**
 * Collapses tournament events that share the same title and fall within a
 * 3-day window of the first event in the group into a single entry.
 * A stable UID is derived from the title + first-game date so re-syncing
 * always maps back to the same row (upsert-safe).
 * League and friendly events are returned unchanged.
 */
function groupTournaments(events) {
  const tournaments = events.filter((e) => e.eventType === 'tournament');
  const others = events.filter((e) => e.eventType !== 'tournament');

  const sorted = [...tournaments].sort((a, b) => a.timestamp - b.timestamp);
  const used = new Set();
  const grouped = [];

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const anchor = sorted[i];
    const group = [anchor];
    used.add(i);

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      const candidate = sorted[j];
      if (candidate.title === anchor.title && candidate.timestamp - anchor.timestamp <= THREE_DAYS_S) {
        group.push(candidate);
        used.add(j);
      }
    }

    if (group.length === 1) {
      grouped.push(anchor);
    } else {
      const last = group[group.length - 1];
      const firstDate = new Date(anchor.timestamp * 1000).toISOString().split('T')[0];
      const lastDate = new Date(last.timestamp * 1000).toISOString().split('T')[0];
      const slug = anchor.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      grouped.push({
        ...anchor,
        id: `tournament-${slug}-${firstDate}`,
        description: `${group.length} games · ${firstDate} – ${lastDate}`,
      });
    }
  }

  return [...others, ...grouped];
}

const toDisplayFields = (jsDate) => ({
  displayDate: jsDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  displayTime: jsDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }),
  isoDate: jsDate.toISOString().split('T')[0],
});

/**
 * Fills in events the live feed no longer carries from the synced team_events
 * rows, so history survives a feed URL change, a provider trimming old events,
 * or a failed fetch. Past events always come from both sources; upcoming ones
 * only fall back to the DB when the feed couldn't be read, since the feed is
 * the source of truth going forward.
 * Feed events win on a UID match, and also on a start-time match: a new feed
 * URL lists the same games under different UIDs, and a synced tournament row
 * (UID `tournament-…`) starts at its first game's time. A team can't play two
 * events at the same moment, so a saved row at a feed event's start time is
 * the same event.
 */
export function mergeSavedEvents(feedEvents, savedEvents, { feedFailed = false, now, team = null } = {}) {
  const feedUids = new Set(feedEvents.map((e) => e.id));
  const feedTimestamps = new Set(feedEvents.map((e) => e.timestamp));

  const fromDb = savedEvents
    .map((row) => {
      const jsDate = new Date(row.eventDate);
      return {
        id: row.uid,
        title: row.title,
        description: row.description || '',
        location: row.location || 'TBD',
        timestamp: Math.floor(jsDate.getTime() / 1000),
        eventType: row.eventType,
        isCancelled: row.isCancelled || false,
        // Set on events the app runs (sql/app_schedule_migration.sql); absent on feed events.
        endTimestamp: row.endDate ? Math.floor(new Date(row.endDate).getTime() / 1000) : null,
        arrivalMinutes: row.arrivalMinutes ?? null,
        uniform: row.uniform || null,
        teamId: team?.id || null,
        teamName: team?.name || null,
        ...toDisplayFields(jsDate),
      };
    })
    .filter((e) => !feedUids.has(e.id))
    .filter((e) => !feedTimestamps.has(e.timestamp))
    .filter((e) => feedFailed || e.timestamp < now);

  return [...feedEvents, ...fromDb];
}

export const useSchedule = (user, team = null) => {
  const [events, setEvents] = useState({ upcoming: [], past: [] });
  const [blackoutDates, setBlackoutDates] = useState([]);
  const [loading, setLoading] = useState(true);
  // The team the last finished schedule load was for ('' for none).
  const [loadedFor, setLoadedFor] = useState(null);
  const scheduleFetchRef = useRef(0);

  const fetchScheduleData = useCallback(async () => {
    setLoading(true);
    const fetchId = ++scheduleFetchRef.current;
    const done = () => fetchId === scheduleFetchRef.current && setLoadedFor(team?.id || '');

    // 1. Blackouts
    let blackoutsList = [];
    try {
      blackoutsList = await supabaseService.getAllBlackouts(team?.id || null);
    } catch (err) {
      console.warn('Skipping blackouts:', err.message);
    }
    setBlackoutDates(blackoutsList);

    // 2. A schedule the app runs is read from team_events alone: no feed.
    if (team?.scheduleSource === 'app') {
      let saved = [];
      try {
        saved = await supabaseService.getTeamEvents(team.id);
      } catch (err) {
        console.warn('Skipping saved events:', err.message);
      }
      const now = Math.floor(Date.now() / 1000);
      const all = mergeSavedEvents([], saved, { feedFailed: true, now, team });
      setEvents({
        upcoming: all.filter((e) => e.timestamp >= now && !e.isCancelled).sort((a, b) => a.timestamp - b.timestamp),
        past: all.filter((e) => e.timestamp < now).sort((a, b) => b.timestamp - a.timestamp),
      });
      setLoading(false);
      done();
      return;
    }

    // 3. Determine iCal URL
    const icsUrl = team?.icalUrl || LEGACY_ICAL_URL;
    if (!icsUrl) {
      setEvents({ upcoming: [], past: [] });
      setLoading(false);
      done();
      return;
    }

    // 3. Fetch & parse iCal, alongside the synced rows that back-fill history
    const savedEventsPromise = team?.id
      ? supabaseService.getTeamEvents(team.id).catch((err) => {
          console.warn('Skipping saved events:', err.message);
          return [];
        })
      : Promise.resolve([]);

    let feedEvents = [];
    let feedFailed = false;
    try {
      const icsString = await fetchIcs(icsUrl);

      const jcalData = ICAL.parse(icsString);
      const vcalendar = new ICAL.Component(jcalData);

      feedEvents = vcalendar.getAllSubcomponents('vevent').map((vevent) => {
        const event = new ICAL.Event(vevent);
        const jsDate = event.startDate.toJSDate();

        const descProp = vevent.getFirstPropertyValue('description');
        const description = descProp ? String(descProp) : '';
        const status = vevent.getFirstPropertyValue('status') || 'CONFIRMED';
        const isCancelled = status.toUpperCase() === 'CANCELLED';
        const eventType = classifyEvent(event.summary, description, detectFeedSource(icsUrl));

        return {
          id: event.uid,
          title: event.summary,
          description,
          location: event.location || 'TBD',
          timestamp: event.startDate.toUnixTime(),
          eventType,
          isCancelled,
          teamId: team?.id || null,
          teamName: team?.name || null,
          ...toDisplayFields(jsDate),
        };
      });
    } catch (error) {
      console.error('iCal fetch error:', error);
      feedFailed = true;
    }

    const savedEvents = await savedEventsPromise;
    const now = Math.floor(Date.now() / 1000);
    const allEvents = mergeSavedEvents(feedEvents, savedEvents, { feedFailed, now, team });
    setEvents({
      upcoming: allEvents.filter((e) => e.timestamp >= now && !e.isCancelled).sort((a, b) => a.timestamp - b.timestamp),
      past: allEvents.filter((e) => e.timestamp < now).sort((a, b) => b.timestamp - a.timestamp),
    });
    setLoading(false);
    done();
  }, [team?.id, team?.icalUrl, team?.scheduleSource]);

  useEffect(() => {
    fetchScheduleData();
  }, [user, fetchScheduleData]);

  // urlOverride lets a caller sync a just-saved feed URL before the team
  // record in context has refreshed.
  const syncCalendar = useCallback(
    async (urlOverride) => {
      const icsUrl = urlOverride || team?.icalUrl;
      if (!icsUrl || !team?.id) throw new Error('No calendar URL configured');

      const icsString = await fetchIcs(icsUrl);
      const jcalData = ICAL.parse(icsString);
      const vcalendar = new ICAL.Component(jcalData);

      const parsedEvents = vcalendar.getAllSubcomponents('vevent').map((vevent) => {
        const event = new ICAL.Event(vevent);
        const descProp = vevent.getFirstPropertyValue('description');
        const description = descProp ? String(descProp) : '';
        const status = vevent.getFirstPropertyValue('status') || 'CONFIRMED';
        const isCancelled = status.toUpperCase() === 'CANCELLED';
        const eventType = classifyEvent(event.summary, description, detectFeedSource(icsUrl));
        const title = eventType === 'tournament' ? extractTournamentName(description) || event.summary : event.summary;
        return {
          id: event.uid,
          title,
          description,
          location: event.location || 'TBD',
          timestamp: event.startDate.toUnixTime(),
          eventType,
          isCancelled,
        };
      });

      const gameEvents = groupTournaments(
        parsedEvents.filter((e) => ['tournament', 'league', 'friendly'].includes(e.eventType)),
      );

      return await supabaseService.syncTeamEvents(team.id, gameEvents);
    },
    [team?.id, team?.icalUrl],
  );

  // Switching a team to run its schedule here: everything the feed lists (practices too, not only the games a
  // sync keeps) is copied into team_events once, owned by the app from then on.
  const importFeed = useCallback(async () => {
    const icsUrl = team?.icalUrl;
    if (!icsUrl || !team?.id) return 0;
    const icsString = await fetchIcs(icsUrl);
    const vcalendar = new ICAL.Component(ICAL.parse(icsString));
    const parsed = vcalendar.getAllSubcomponents('vevent').map((vevent) => {
      const event = new ICAL.Event(vevent);
      const descProp = vevent.getFirstPropertyValue('description');
      const description = descProp ? String(descProp) : '';
      const status = vevent.getFirstPropertyValue('status') || 'CONFIRMED';
      const eventType = classifyEvent(event.summary, description, detectFeedSource(icsUrl));
      const title = eventType === 'tournament' ? extractTournamentName(description) || event.summary : event.summary;
      return {
        id: event.uid,
        title,
        description,
        location: event.location || 'TBD',
        timestamp: event.startDate.toUnixTime(),
        eventType,
        isCancelled: status.toUpperCase() === 'CANCELLED',
      };
    });
    return await supabaseService.syncTeamEvents(team.id, groupTournaments(parsed), { source: 'app' });
  }, [team?.id, team?.icalUrl]);

  const toggleBlackout = async (dateStr) => {
    const isCurrentlyBlackout = blackoutDates.includes(dateStr);
    try {
      if (isCurrentlyBlackout) {
        await supabaseService.deleteBlackout(dateStr);
        setBlackoutDates((prev) => prev.filter((d) => d !== dateStr));
      } else {
        await supabaseService.saveBlackout(dateStr, team?.id || null);
        setBlackoutDates((prev) => [...prev, dateStr]);
      }
    } catch (e) {
      console.error('Blackout toggle failed', e);
    }
  };

  return {
    events,
    blackoutDates,
    toggleBlackout,
    refreshSchedule: fetchScheduleData,
    syncCalendar,
    importFeed,
    loading,
    loadedFor,
  };
};
