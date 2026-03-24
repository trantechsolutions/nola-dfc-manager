// src/hooks/useSchedule.js
// Fetches iCal events for a specific team using the team's ical_url.
// Falls back to the legacy hardcoded URL if no team is provided.

import { useState, useEffect, useCallback } from 'react';
import ICAL from 'ical.js';
import { supabaseService } from '../services/supabaseService';
import { classifyEvent, extractTournamentName } from '../utils/eventClassifier';

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

export const useSchedule = (user, team = null) => {
  const [events, setEvents] = useState({ upcoming: [], past: [] });
  const [blackoutDates, setBlackoutDates] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchScheduleData = useCallback(async () => {
    setLoading(true);

    // 1. Blackouts
    let blackoutsList = [];
    try {
      blackoutsList = await supabaseService.getAllBlackouts(team?.id || null);
    } catch (err) {
      console.warn('Skipping blackouts:', err.message);
    }
    setBlackoutDates(blackoutsList);

    // 2. Determine iCal URL
    const icsUrl = team?.icalUrl || LEGACY_ICAL_URL;
    if (!icsUrl) {
      setEvents({ upcoming: [], past: [] });
      setLoading(false);
      return;
    }

    // 3. Fetch & parse iCal
    try {
      const response = await fetch(icsUrl);
      const icsString = await response.text();

      const jcalData = ICAL.parse(icsString);
      const vcalendar = new ICAL.Component(jcalData);

      const parsedEvents = vcalendar.getAllSubcomponents('vevent').map((vevent) => {
        const event = new ICAL.Event(vevent);
        const jsDate = event.startDate.toJSDate();

        const descProp = vevent.getFirstPropertyValue('description');
        const description = descProp ? String(descProp) : '';
        const status = vevent.getFirstPropertyValue('status') || 'CONFIRMED';
        const isCancelled = status.toUpperCase() === 'CANCELLED';
        const eventType = classifyEvent(event.summary, description);

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
          displayDate: jsDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          displayTime: jsDate.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          }),
          isoDate: jsDate.toISOString().split('T')[0],
        };
      });

      const now = Math.floor(Date.now() / 1000);
      setEvents({
        upcoming: parsedEvents
          .filter((e) => e.timestamp >= now && !e.isCancelled)
          .sort((a, b) => a.timestamp - b.timestamp),
        past: parsedEvents.filter((e) => e.timestamp < now).sort((a, b) => b.timestamp - a.timestamp),
      });
    } catch (error) {
      console.error('iCal fetch error:', error);
      setEvents({ upcoming: [], past: [] });
    } finally {
      setLoading(false);
    }
  }, [team?.id, team?.icalUrl]);

  useEffect(() => {
    fetchScheduleData();
  }, [user, fetchScheduleData]);

  const syncCalendar = useCallback(async () => {
    const icsUrl = team?.icalUrl;
    if (!icsUrl || !team?.id) throw new Error('No calendar URL configured');

    const response = await fetch(icsUrl);
    const icsString = await response.text();
    const jcalData = ICAL.parse(icsString);
    const vcalendar = new ICAL.Component(jcalData);

    const parsedEvents = vcalendar.getAllSubcomponents('vevent').map((vevent) => {
      const event = new ICAL.Event(vevent);
      const descProp = vevent.getFirstPropertyValue('description');
      const description = descProp ? String(descProp) : '';
      const status = vevent.getFirstPropertyValue('status') || 'CONFIRMED';
      const isCancelled = status.toUpperCase() === 'CANCELLED';
      const eventType = classifyEvent(event.summary, description);
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

  return { events, blackoutDates, toggleBlackout, refreshSchedule: fetchScheduleData, syncCalendar, loading };
};
