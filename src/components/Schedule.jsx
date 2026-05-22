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
        className={`bg-card rounded-lg border overflow-hidden transition-all ${
          isPast ? 'opacity-60 border-border' : `${type.border} hover:shadow-md hover:-translate-y-0.5`
        } ${event.isCancelled ? 'opacity-40' : ''}`}
      >
        {/* Color bar */}
        <div className={`h-1.5 ${type.color}`} />
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${type.colorLight}`}>{type.label}</span>
            <span className="text-xs font-semibold text-muted-foreground">{event.displayDate}</span>
          </div>

          <h4
            className={`font-bold text-foreground text-sm leading-tight mb-3 ${event.isCancelled ? 'line-through' : ''}`}
          >
            {event.title}
          </h4>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock size={12} className="text-muted-foreground shrink-0" />
              <span className="font-medium">{event.displayTime}</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin size={12} className="text-muted-foreground shrink-0 mt-0.5" />
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
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search events, locations, or details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-muted-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} className="text-muted-foreground" />
          <div className="flex flex-wrap gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${typeFilter === 'all' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >
              All
            </button>
            {Object.entries(EVENT_TYPES).map(([key, type]) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                  typeFilter === key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
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
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 flex items-center gap-1 ml-auto"
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
            <h2 className="text-xl font-bold text-foreground">Upcoming</h2>
            <p className="text-xs text-muted-foreground font-semibold">{filteredUpcoming.length} events</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(EVENT_TYPES).map(([key, type]) => (
              <span key={key} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase">
                <span className={`w-2.5 h-2.5 rounded-full ${type.dot}`}></span> {type.label}
              </span>
            ))}
          </div>
        </div>

        {filteredUpcoming.length === 0 ? (
          <div className="bg-card rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground font-semibold italic text-sm">
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
            className="w-full flex justify-between items-center bg-card hover:bg-background p-4 rounded-lg transition-all border border-border"
          >
            <span className="font-semibold text-muted-foreground text-sm">
              History ({filteredPast.length} past events)
            </span>
            {showArchive ? (
              <ChevronUp size={16} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={16} className="text-muted-foreground" />
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
