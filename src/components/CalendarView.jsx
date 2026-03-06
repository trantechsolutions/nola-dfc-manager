import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

export default function CalendarView({ events, blackoutDates = [], onToggleBlackout }) {
  const allEvents = [...events.upcoming, ...events.past];

  const calendarEvents = allEvents.map(event => {
    const isGame = event.title.toLowerCase().includes(' vs ') || event.title.toLowerCase().includes(' @ ');
    return {
      id: event.id,
      title: event.title,
      start: new Date(event.timestamp * 1000).toISOString(),
      backgroundColor: isGame ? '#f59e0b' : '#38bdf8', 
      borderColor: isGame ? '#d97706' : '#0ea5e9',
      extendedProps: { location: event.location, time: event.displayTime }
    };
  });

  // Add blackout dates to the manager's view too, so you know they are blocked
  const blackoutEvents = blackoutDates.map(dateStr => ({
    id: `blackout-${dateStr}`,
    title: '⬛ BLACKOUT',
    start: dateStr,
    backgroundColor: '#1e293b', 
    borderColor: '#0f172a',
    allDay: true
  }));

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      {onToggleBlackout && (
        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium">
          <strong>Manager Tip:</strong> Click any empty day on the calendar to toggle a "Blackout" date for the public availability view.
        </div>
      )}
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }}
        events={[...calendarEvents, ...blackoutEvents]}
        dateClick={(info) => {
          if (onToggleBlackout) onToggleBlackout(info.dateStr);
        }}
        eventClick={(info) => {
          if (info.event.title === '⬛ BLACKOUT') {
            if (onToggleBlackout) onToggleBlackout(info.event.startStr); // Click the event to remove it
          } else {
            alert(`Event: ${info.event.title}\nTime: ${info.event.extendedProps.time}\nLocation: ${info.event.extendedProps.location}`);
          }
        }}
        height="auto"
        aspectRatio={1.35}
      />
    </div>
  );
}