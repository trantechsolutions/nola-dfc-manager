import React, { useState } from 'react';
import { List, CalendarDays } from 'lucide-react';
import Schedule from '../components/Schedule';
import CalendarView from '../components/CalendarView';

export default function ScheduleView({ events, blackoutDates, onToggleBlackout }) {
  const [scheduleMode, setScheduleMode] = useState('list');

  return (
    <div className="space-y-4">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Schedule</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {events.upcoming.length} upcoming · {events.past.length} past
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="bg-white p-0.5 rounded-lg border border-slate-200 flex shadow-sm">
            <button 
              onClick={() => setScheduleMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                scheduleMode === 'list' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <List size={14} /> List
            </button>
            <button 
              onClick={() => setScheduleMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                scheduleMode === 'calendar' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <CalendarDays size={14} /> Calendar
            </button>
          </div>
          
          {/* Live indicator */}
          <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Live
          </span>
        </div>
      </div>

      {/* ── CONTENT ── */}
      {scheduleMode === 'list' ? (
        <Schedule events={events} />
      ) : (
        <div className="w-full overflow-x-auto pb-4">
          <div className="min-w-[640px]">
            <CalendarView 
              events={events} 
              blackoutDates={blackoutDates} 
              onToggleBlackout={onToggleBlackout} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
