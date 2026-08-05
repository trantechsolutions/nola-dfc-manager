import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarDays, Info } from 'lucide-react';
import { EVENT_TYPES, EVENT_CALENDAR_COLORS } from '../utils/eventClassifier';
import AdminCard from './layout/AdminCard';

/**
 * CalendarView — AdminLTE's calendar page layout.
 *
 * Two columns, matching `pages/calendar.html`: a narrow `col-lg-3` control
 * card on the left (there, the draggable-event palette; here, the event-type
 * key and the blackout instructions) and a `col-lg-9` FullCalendar card on the
 * right with a summary in its `card-footer`.
 */
export default function CalendarView({ events, blackoutDates = [], onToggleBlackout }) {
  const allEvents = [...events.upcoming, ...events.past];

  const calendarEvents = allEvents
    .filter((e) => !e.isCancelled)
    .map((event) => {
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
          description: event.description,
        },
      };
    });

  const blackoutEvents = blackoutDates.map((dateStr) => ({
    id: `blackout-${dateStr}`,
    title: 'BLACKOUT',
    start: dateStr,
    backgroundColor: '#212529',
    borderColor: '#212529',
    textColor: '#adb5bd',
    allDay: true,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      {/* ═══ col-lg-3 — legend + controls ═══ */}
      <div className="lg:col-span-1">
        <AdminCard title="Event types" className="lg:sticky lg:top-[4.5rem]">
          <p className="mb-3 text-xs text-muted-foreground">
            Each event on the calendar is coloured by its type. Types are set from the schedule list.
          </p>

          <ul className="space-y-1">
            {Object.entries(EVENT_TYPES).map(([key, type]) => (
              <li
                key={key}
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${type.color}`} />
                {type.label}
              </li>
            ))}
            <li className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#212529]" />
              Blackout
            </li>
          </ul>

          {onToggleBlackout && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-foreground/[0.03] p-2.5 text-xs text-muted-foreground">
              <Info size={14} className="mt-0.5 shrink-0 text-accent" />
              <span>
                Click any empty day to toggle a blackout date. Click a blackout to remove it.
                {blackoutDates.length > 0 && (
                  <span className="mt-1 block font-semibold text-foreground">
                    {blackoutDates.length} blackout {blackoutDates.length === 1 ? 'date' : 'dates'} set
                  </span>
                )}
              </span>
            </div>
          )}
        </AdminCard>
      </div>

      {/* ═══ col-lg-9 — the calendar ═══ */}
      <div className="lg:col-span-3">
        <AdminCard
          bodyClassName="p-2 md:p-4"
          footer={
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={13} />
              {calendarEvents.length} {calendarEvents.length === 1 ? 'event' : 'events'} this season
            </span>
          }
        >
          {/* FullCalendar has a hard minimum usable width; scrolling the grid
              alone keeps the surrounding card and page from scrolling too. */}
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }}
                events={[...calendarEvents, ...blackoutEvents]}
                dateClick={(info) => {
                  if (onToggleBlackout) onToggleBlackout(info.dateStr);
                }}
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
                        (props.description ? `\n\n${props.description}` : ''),
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
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
