import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Loader2, Filter, X } from 'lucide-react';
import ICAL from 'ical.js';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import { classifyEvent, EVENT_TYPES } from '../../utils/eventClassifier';

export default function ClubCalendarView({ club, teams }) {
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [view, setView] = useState('calendar'); // calendar | list

  // Fetch iCal from all teams in parallel
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const events = [];

      await Promise.allSettled(teams.filter(t => t.icalUrl).map(async (team) => {
        try {
          const response = await fetch(team.icalUrl);
          const icsString = await response.text();
          const jcalData = ICAL.parse(icsString);
          const vcalendar = new ICAL.Component(jcalData);

          vcalendar.getAllSubcomponents('vevent').forEach(vevent => {
            const event = new ICAL.Event(vevent);
            const jsDate = event.startDate.toJSDate();
            const descProp = vevent.getFirstPropertyValue('description');
            const description = descProp ? String(descProp) : '';
            const status = vevent.getFirstPropertyValue('status') || 'CONFIRMED';
            if (status.toUpperCase() === 'CANCELLED') return;

            events.push({
              id: `${team.id}-${event.uid}`,
              title: event.summary,
              description,
              location: event.location || 'TBD',
              start: jsDate.toISOString(),
              timestamp: event.startDate.toUnixTime(),
              eventType: classifyEvent(event.summary, description),
              teamId: team.id,
              teamName: team.name,
              teamColor: team.colorPrimary || '#1e293b',
              displayDate: jsDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
              displayTime: jsDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
            });
          });
        } catch (e) {
          console.error(`Failed to fetch iCal for ${team.name}:`, e);
        }
      }));

      events.sort((a, b) => a.timestamp - b.timestamp);
      setAllEvents(events);
      setLoading(false);
    };
    fetchAll();
  }, [teams]);

  const now = Math.floor(Date.now() / 1000);

  const filteredEvents = useMemo(() => {
    return allEvents.filter(e => {
      if (filterTeam !== 'all' && e.teamId !== filterTeam) return false;
      if (filterType !== 'all' && e.eventType !== filterType) return false;
      return true;
    });
  }, [allEvents, filterTeam, filterType]);

  const upcomingFiltered = filteredEvents.filter(e => e.timestamp >= now);
  const calendarEvents = filteredEvents.map(e => ({
    id: e.id, title: `${e.teamName}: ${e.title}`,
    start: e.start,
    backgroundColor: e.teamColor,
    borderColor: e.teamColor,
    textColor: '#ffffff',
    extendedProps: { ...e },
  }));

  const teamsWithEvents = teams.filter(t => allEvents.some(e => e.teamId === t.id));
  const hasFilters = filterTeam !== 'all' || filterType !== 'all';

  if (loading) return (
    <div className="p-20 text-center">
      <Loader2 size={24} className="text-slate-400 animate-spin mx-auto mb-2" />
      <p className="text-xs font-bold text-slate-400">Loading calendars from {teams.filter(t => t.icalUrl).length} teams...</p>
    </div>
  );

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <Calendar size={24} className="text-blue-600" /> Club Calendar
        </h2>
        <p className="text-xs text-slate-400 font-bold">{allEvents.length} events from {teamsWithEvents.length} teams</p>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-slate-400" />
          {/* Team filter */}
          <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setFilterTeam('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${filterTeam === 'all' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
              All Teams
            </button>
            {teamsWithEvents.map(t => (
              <button key={t.id} onClick={() => setFilterTeam(t.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${filterTeam === t.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.colorPrimary }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Type filter */}
          <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${filterType === 'all' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>All</button>
            {Object.entries(EVENT_TYPES).map(([key, type]) => (
              <button key={key} onClick={() => setFilterType(key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${filterType === key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                <span className={`w-2 h-2 rounded-full ${type.dot}`} />{type.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button onClick={() => { setFilterTeam('all'); setFilterType('all'); }}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-auto">
              <X size={12} /> Reset
            </button>
          )}

          {/* View toggle */}
          <div className="ml-auto flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView('calendar')} className={`px-3 py-1 rounded-md text-[11px] font-bold ${view === 'calendar' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Calendar</button>
            <button onClick={() => setView('list')} className={`px-3 py-1 rounded-md text-[11px] font-bold ${view === 'list' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>List</button>
          </div>
        </div>

        {/* Team legend */}
        <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {teamsWithEvents.map(t => (
            <span key={t.id} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.colorPrimary }} /> {t.name}
            </span>
          ))}
        </div>
      </div>

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <FullCalendar
            plugins={[dayGridPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }}
            events={calendarEvents}
            eventClick={(info) => {
              const p = info.event.extendedProps;
              alert(`[${p.teamName}] ${p.title}\nType: ${EVENT_TYPES[p.eventType]?.label || p.eventType}\nTime: ${p.displayTime}\nLocation: ${p.location}`);
            }}
            height="auto" aspectRatio={1.35} dayMaxEvents={4}
            eventDisplay="block"
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          />
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="space-y-2">
          {upcomingFiltered.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400 font-bold text-sm">
              No upcoming events match your filters.
            </div>
          ) : upcomingFiltered.map(e => {
            const type = EVENT_TYPES[e.eventType] || EVENT_TYPES.event;
            return (
              <div key={e.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex">
                <div className="w-1.5 shrink-0" style={{ backgroundColor: e.teamColor }} />
                <div className="p-3 flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${type.colorLight}`}>{type.label}</span>
                    <span className="text-[10px] font-bold text-slate-400">{e.teamName}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800">{e.title}</p>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">{e.displayDate} · {e.displayTime} · {e.location}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
