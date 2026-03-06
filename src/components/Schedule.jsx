import React, { useState } from 'react';

export default function Schedule({ events }) {
  const [showArchive, setShowArchive] = useState(false);

  // Helper to determine if an event is a "Game"
  const isGame = (title) => {
    const lowerTitle = title.toLowerCase();
    return lowerTitle.includes(' vs ') || lowerTitle.includes(' @ ') || lowerTitle.includes(' at ');
  };

  const renderCard = (event, isPast = false) => {
    const eventIsGame = isGame(event.title);
    
    // Theme logic: Gold for Games, Sky Blue for Others
    const themeClass = eventIsGame 
      ? (isPast ? 'bg-yellow-600/60' : 'bg-yellow-500') 
      : (isPast ? 'bg-blue-500/60' : 'bg-blue-400');

    const borderClass = eventIsGame 
      ? (isPast ? 'border-yellow-100' : 'border-yellow-200') 
      : (isPast ? 'border-blue-100' : 'border-blue-200');

    return (
      <div key={event.id} className={`bg-white rounded-2xl shadow-sm border ${borderClass} overflow-hidden flex flex-col transition-all ${isPast ? 'opacity-70 grayscale-[0.3]' : 'hover:-translate-y-1 hover:shadow-md'}`}>
        {/* Header with Theme Color */}
        <div className={`px-5 py-3 text-white font-bold flex flex-col ${themeClass}`}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">
              {eventIsGame ? 'Match' : 'Event'}
            </span>
            <span className="text-xs opacity-90">{event.displayDate}</span>
          </div>
          <span className="truncate text-lg leading-tight font-black">
            {event.title.split(' vs ')[0].split(' @ ')[0]}
          </span>
        </div>

        <div className="p-5 flex-grow space-y-4">
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Details</p>
            <p className="font-bold text-slate-800 leading-tight mt-1">{event.title}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Time</p>
              <p className="font-bold text-slate-700">{event.displayTime}</p>
            </div>
            <div className="overflow-hidden">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Location</p>
              <p className="font-bold text-slate-700 truncate" title={event.location}>{event.location}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Upcoming Section */}
      <section className="space-y-6">
        <div className="flex justify-between items-end border-b border-slate-200 pb-2">
          <h2 className="text-2xl font-black text-slate-900">Upcoming Schedule</h2>
          <span className="text-sm font-bold text-slate-400">{events.upcoming.length} Events Total</span>
        </div>
        
        {events.upcoming.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400 font-bold italic">
            No upcoming events.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.upcoming.map(event => renderCard(event))}
          </div>
        )}
      </section>

      {/* Archive Section */}
      {events.past.length > 0 && (
        <section className="pt-4">
          <button 
            onClick={() => setShowArchive(!showArchive)}
            className="w-full flex justify-between items-center bg-slate-100 hover:bg-slate-200 p-4 rounded-xl transition-all border border-slate-200 group"
          >
            <span className="font-bold text-slate-500 flex items-center gap-2">
              📂 History ({events.past.length} past events)
            </span>
            <span className="text-slate-400 font-black">
              {showArchive ? 'Collapse ▲' : 'Expand ▼'}
            </span>
          </button>

          {showArchive && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 animate-in fade-in slide-in-from-top-4 duration-300">
              {events.past.map(event => renderCard(event, true))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}