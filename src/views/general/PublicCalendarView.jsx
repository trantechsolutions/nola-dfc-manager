import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';

export default function PublicCalendarView({ events, blackoutDates, onBack }) {
  // 1. Safely map Ollie Events with a fallback to an empty array
  const sanitizedMatches = (events?.upcoming || []).map(event => {
    const isGame = event.title?.toLowerCase().includes(' vs ') || event.title?.toLowerCase().includes(' @ ');
    return {
      id: event.id,
      title: isGame ? 'Match (Busy)' : 'Team Event (Busy)',
      start: new Date(event.timestamp * 1000).toISOString(),
      backgroundColor: '#f87171', // Red for busy
      borderColor: '#ef4444',
      allDay: false
    };
  });

  // 2. Safely format Blackout Dates with a fallback
  const blackoutEvents = (blackoutDates || []).map(dateStr => ({
    id: `blackout-${dateStr}`,
    title: 'Unavailable (Rest/Holiday)',
    start: dateStr,
    backgroundColor: '#64748b', // Slate gray for blackouts
    borderColor: '#475569',
    allDay: true
  }));

  const publicEvents = [...sanitizedMatches, ...blackoutEvents];

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-900">NOLA DFC 2015 Boys</h1>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Public Availability</p>
          </div>
          <button 
            onClick={onBack}
            className="text-sm font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded-lg transition-colors"
          >
            Manager Login
          </button>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex gap-4 mb-4 text-xs font-bold text-slate-500 uppercase tracking-widest justify-center">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-400"></span> Scheduled Event</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-500"></span> Blackout / Rest</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-slate-200"></span> Available</span>
          </div>

          <FullCalendar
            plugins={[dayGridPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: 'prev,next', center: 'title', right: 'today' }}
            events={publicEvents}
            height="auto"
            aspectRatio={1.35}
            eventClick={() => alert("This team is currently unavailable on this date.")}
          />
        </div>
      </div>
    </div>
  );
}