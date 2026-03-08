import { useState, useEffect, useCallback } from 'react';
import ICAL from 'ical.js';
import { supabaseService } from '../services/supabaseService';

export const useSchedule = (user) => {
  const [events, setEvents] = useState({ upcoming: [], past: [] });
  const [blackoutDates, setBlackoutDates] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchScheduleData = useCallback(async () => {
    setLoading(true);
    // 1. Fetch Blackouts from Supabase
    let blackoutsList = [];
    try {
      blackoutsList = await supabaseService.getAllBlackouts();
    } catch (err) {
      console.warn("Skipping blackouts:", err.message);
    }
    setBlackoutDates(blackoutsList);

    // 2. Fetch Ollie Sports iCal
    try {
      const icsUrl = `https://api.olliesports.com/ical/team-McFNdDsJbcFwAO8L5yCQShQ_DJN_.ics`;
      const response = await fetch(icsUrl);
      const icsString = await response.text();
      
      const jcalData = ICAL.parse(icsString);
      const vcalendar = new ICAL.Component(jcalData);
      
      const parsedEvents = vcalendar.getAllSubcomponents('vevent').map(vevent => {
        const event = new ICAL.Event(vevent);
        const jsDate = event.startDate.toJSDate();
        return {
          id: event.uid,
          title: event.summary,
          location: event.location || 'TBD',
          timestamp: event.startDate.toUnixTime(),
          displayDate: jsDate.toLocaleDateString(undefined, { 
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
          }),
          displayTime: jsDate.toLocaleTimeString(undefined, { 
            hour: '2-digit', minute: '2-digit' 
          }),
          isoDate: jsDate.toISOString().split('T')[0]
        };
      });

      const now = Math.floor(Date.now() / 1000);
      setEvents({
        upcoming: parsedEvents.filter(e => e.timestamp >= now).sort((a, b) => a.timestamp - b.timestamp),
        past: parsedEvents.filter(e => e.timestamp < now).sort((a, b) => b.timestamp - a.timestamp)
      });
    } catch (error) {
      console.error("iCal fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScheduleData();
  }, [user, fetchScheduleData]);

  const toggleBlackout = async (dateStr) => {
    const isCurrentlyBlackout = blackoutDates.includes(dateStr);
    try {
      if (isCurrentlyBlackout) {
        await supabaseService.deleteBlackout(dateStr);
        setBlackoutDates(prev => prev.filter(d => d !== dateStr));
      } else {
        await supabaseService.saveBlackout(dateStr);
        setBlackoutDates(prev => [...prev, dateStr]);
      }
    } catch (e) {
      console.error("Blackout toggle failed", e);
    }
  };

  return { events, blackoutDates, toggleBlackout, refreshSchedule: fetchScheduleData, loading };
};