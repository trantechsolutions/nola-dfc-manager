import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { scheduleService } from '../services/scheduleService';
import { ScheduleContext } from '../context/ScheduleContext';
import { DataContext } from '../context/DataContext';
import { NavigationContext } from '../context/NavigationContext';

/**
 * Every RSVP for the team's events, loaded once in App and shared through ScheduleContext, so an answer given
 * on Home shows on the schedule and the calendar too.
 *
 * An event can carry answers once it has a team_events row (every event, when the app runs the schedule).
 * Returns { rsvpsByEvent, dbEventOf, setRsvp }.
 */
export function useEventRsvps({ events, teamEvents = [] }) {
  // A feed event finds its saved row by uid, else by start time.
  const dbEventOf = useMemo(() => {
    const byUid = {};
    const byTime = {};
    teamEvents.forEach((e) => {
      byUid[e.uid] = e;
      const t = Math.floor(new Date(e.eventDate).getTime() / 1000);
      if (!(t in byTime)) byTime[t] = e;
    });
    return (event) => (event ? byUid[event.id] || byTime[event.timestamp] || null : null);
  }, [teamEvents]);

  const ids = useMemo(
    () =>
      [...(events?.upcoming || []), ...(events?.past || [])]
        .map((e) => dbEventOf(e)?.id)
        .filter(Boolean)
        .sort()
        .join(','),
    [events, dbEventOf],
  );

  const [rsvpsByEvent, setRsvpsByEvent] = useState({});
  useEffect(() => {
    let live = true;
    if (!ids) {
      setRsvpsByEvent({});
      return undefined;
    }
    scheduleService.getRsvps(ids.split(',')).then(
      (rows) => {
        if (!live) return;
        const byEvent = {};
        rows.forEach((row) => {
          (byEvent[row.eventId] ||= []).push(row);
        });
        setRsvpsByEvent(byEvent);
      },
      () => live && setRsvpsByEvent({}),
    );
    return () => {
      live = false;
    };
  }, [ids]);

  const setRsvp = useCallback(async (eventId, playerId, status, note = null) => {
    await scheduleService.setRsvp(eventId, playerId, status, note);
    setRsvpsByEvent((prev) => {
      const rest = (prev[eventId] || []).filter((row) => row.playerId !== playerId);
      const row = { eventId, playerId, status, note: status === 'no' ? note || null : null };
      return { ...prev, [eventId]: status ? [...rest, row] : rest };
    });
  }, []);

  return { rsvpsByEvent, dbEventOf, setRsvp };
}

/**
 * A function giving the props for <EventRsvp> on an event, or null when nobody here can answer for it: a
 * guardian answers for their players, a player for themselves, and staff who edit the schedule for anyone. Past
 * and cancelled events come back read-only. One function for a whole list (the calendar).
 */
export function useRsvpPropsFor() {
  const schedule = useContext(ScheduleContext);
  const data = useContext(DataContext);
  const nav = useContext(NavigationContext);
  return (event) => {
    if (!schedule?.dbEventOf || !event) return null;
    const db = schedule.dbEventOf(event);
    if (!db) return null;
    const teamId = nav?.selectedTeam?.id || db.teamId;
    const onTeam = (p) => !p.teamId || !teamId || p.teamId === teamId;
    const mine = (data?.myPlayers || []).filter(onTeam);
    const canManage = !!nav?.canEditSchedule && !!nav?.effectiveIsStaff;
    if (!mine.length && !canManage) return null;
    const past = event.timestamp * 1000 < Date.now() - 3 * 3600 * 1000;
    return {
      rsvps: schedule.rsvpsByEvent?.[db.id] || [],
      roster: canManage ? (data?.players || []).filter((p) => onTeam(p) && p.status !== 'archived') : [],
      mine,
      canManage,
      readOnly: past || !!event.isCancelled,
      onChange: (playerId, status, note) => schedule.setRsvp(db.id, playerId, status, note),
    };
  };
}

/** <EventRsvp> props for one event (see useRsvpPropsFor). */
export function useEventRsvpProps(event) {
  return useRsvpPropsFor()(event);
}
