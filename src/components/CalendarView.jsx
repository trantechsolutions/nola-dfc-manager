import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Info } from 'lucide-react';
import { EVENT_TYPES, EVENT_CALENDAR_COLORS } from '../utils/eventClassifier';

export default function CalendarView({ events, blackoutDates = [], onToggleBlackout }) {
  const allEvents = [...events.upcoming, ...events.past];

  const calendarEvents = allEvents
    .filter(e => !e.isCancelled)
    .map(event => {
      const colors = EVENT_CALENDAR_COLORS[event.eventType] || EVENT_CALENDAR_COLORS.event;
      return {
        id: event.id,
        title: event.title,
        start: new Date(event.timestamp * 1000).toISOString(),
        backgroundColor: colors.bg,
        borderColor: colors.border,
        textColor: '#ffffff',
        extendedProps: { 
          location: event.location, 
          time: event.displayTime,
          eventType: event.eventType,
          description: event.description
        }
      };
    });

  const blackoutEvents = blackoutDates.map(dateStr => ({
    id: `blackout-${dateStr}`,
    title: 'BLACKOUT',
    start: dateStr,
    backgroundColor: '#1e293b',
    borderColor: '#0f172a',
    textColor: '#94a3b8',
    allDay: true
  }));

  return (
    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        {Object.entries(EVENT_TYPES).map(([key, type]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${type.color}`}></span> {type.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-800"></span> Blackout
        </span>
      </div>

      {onToggleBlackout && (
        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-medium flex items-start gap-2">
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <span>Click any empty day to toggle a blackout date. Click a blackout event to remove it.</span>
        </div>
      )}

      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }}
        events={[...calendarEvents, ...blackoutEvents]}
        dateClick={(info) => { if (onToggleBlackout) onToggleBlackout(info.dateStr); }}
        eventClick={(info) => {
          if (info.event.title === 'BLACKOUT') {
            if (onToggleBlackout) onToggleBlackout(info.event.startStr);
          } else {
            const props = info.event.extendedProps;
            const typeLabel = EVENT_TYPES[props.eventType]?.label || 'Event';
            alert(
              `[${typeLabel}] ${info.event.title}\n` +
              `Time: ${props.time}\n` +
              `Location: ${props.location}` +
              (props.description ? `\n\n${props.description}` : '')
            );
          }
        }}
        height="auto"
        aspectRatio={1.35}
        dayMaxEvents={3}
        eventDisplay="block"
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
      />
    </div>
  );
}