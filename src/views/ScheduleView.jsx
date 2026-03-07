import React, { useState } from 'react';
import Schedule from '../components/Schedule';
import CalendarView from '../components/CalendarView';

export default function ScheduleView({ events, blackoutDates, onToggleBlackout }) {
  const [scheduleMode, setScheduleMode] = useState('list');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm">
          <button 
            onClick={() => setScheduleMode('list')}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${scheduleMode === 'list' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            List
          </button>
          <button 
            onClick={() => setScheduleMode('calendar')}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${scheduleMode === 'calendar' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Calendar
          </button>
        </div>
        
        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Live Feed
        </span>
      </div>

      {scheduleMode === 'list' ? (
        <Schedule events={events} />
      ) : (
        <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
          <div className="min-w-[700px]"> {/* Forces the calendar to stay wide enough to read */}
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