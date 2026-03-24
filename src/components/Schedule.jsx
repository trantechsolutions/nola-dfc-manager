import React, { useState, useMemo } from 'react';
import { Search, Filter, MapPin, Clock, X, ChevronDown, ChevronUp } from 'lucide-react';
import { EVENT_TYPES } from '../utils/eventClassifier';

export default function Schedule({ events }) {
  const [showArchive, setShowArchive] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filterEvents = (list) => {
    let result = list;
    if (typeFilter !== 'all') result = result.filter((e) => e.eventType === typeFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q),
      );
    }
    return result;
  };

  const filteredUpcoming = useMemo(() => filterEvents(events.upcoming), [events.upcoming, typeFilter, searchTerm]);
  const filteredPast = useMemo(() => filterEvents(events.past), [events.past, typeFilter, searchTerm]);
  const hasFilters = typeFilter !== 'all' || searchTerm;

  const renderCard = (event, isPast = false) => {
    const type = EVENT_TYPES[event.eventType] || EVENT_TYPES.event;

    return (
      <div
        key={event.id}
        className={`bg-white dark:bg-slate-900 rounded-xl border overflow-hidden transition-all ${
          isPast
            ? 'opacity-60 border-slate-200 dark:border-slate-700'
            : `${type.border} hover:shadow-md hover:-translate-y-0.5`
        } ${event.isCancelled ? 'opacity-40' : ''}`}
      >
        {/* Color bar */}
        <div className={`h-1.5 ${type.color}`} />
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${type.colorLight}`}>
              {type.label}
            </span>
            <span className="text-[11px] font-bold text-slate-400">{event.displayDate}</span>
          </div>

          <h4
            className={`font-black text-slate-900 dark:text-white text-sm leading-tight mb-3 ${event.isCancelled ? 'line-through' : ''}`}
          >
            {event.title}
          </h4>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock size={12} className="text-slate-400 shrink-0" />
              <span className="font-medium">{event.displayTime}</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <MapPin size={12} className="text-slate-400 shrink-0 mt-0.5" />
              <span className="font-medium leading-tight" title={event.location}>
                {event.location}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search events, locations, or details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-slate-300 hover:text-slate-500"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} className="text-slate-400" />
          <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${typeFilter === 'all' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              All
            </button>
            {Object.entries(EVENT_TYPES).map(([key, type]) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                  typeFilter === key
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${type.dot}`}></span>
                {type.label}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              onClick={() => {
                setTypeFilter('all');
                setSearchTerm('');
              }}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-auto"
            >
              <X size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Upcoming */}
      <section>
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Upcoming</h2>
            <p className="text-xs text-slate-400 font-bold">{filteredUpcoming.length} events</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(EVENT_TYPES).map(([key, type]) => (
              <span key={key} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
                <span className={`w-2.5 h-2.5 rounded-full ${type.dot}`}></span> {type.label}
              </span>
            ))}
          </div>
        </div>

        {filteredUpcoming.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-slate-400 font-bold italic text-sm">
            {hasFilters ? 'No events match your filters.' : 'No upcoming events.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredUpcoming.map((event) => renderCard(event))}
          </div>
        )}
      </section>

      {/* Past */}
      {filteredPast.length > 0 && (
        <section>
          <button
            onClick={() => setShowArchive(!showArchive)}
            className="w-full flex justify-between items-center bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 p-4 rounded-xl transition-all border border-slate-200 dark:border-slate-700"
          >
            <span className="font-bold text-slate-500 text-sm">History ({filteredPast.length} past events)</span>
            {showArchive ? (
              <ChevronUp size={16} className="text-slate-400" />
            ) : (
              <ChevronDown size={16} className="text-slate-400" />
            )}
          </button>
          {showArchive && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {filteredPast.map((event) => renderCard(event, true))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
