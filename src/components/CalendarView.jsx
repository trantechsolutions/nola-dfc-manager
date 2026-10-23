import React, { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarDays, Clock, Info, MapPin } from 'lucide-react';
import { EVENT_TYPES, EVENT_CALENDAR_COLORS } from '../utils/eventClassifier';
import AdminCard from './layout/AdminCard';
import ResponsiveModal from './layout/ResponsiveModal';
import EventRsvp, { RSVP_STATUSES } from './EventRsvp';
import { useRsvpPropsFor } from '../hooks/useEventRsvps';

/**
 * CalendarView — AdminLTE's calendar page layout.
 *
 * Two columns, matching `pages/calendar.html`: a narrow `col-lg-3` control
 * card on the left (there, the draggable-event palette; here, the event-type
 * key and the blackout instructions) and a `col-lg-9` FullCalendar card on the
 * right with a summary in its `card-footer`.
 */
export default function CalendarView({ events, blackoutDates = [], onToggleBlackout }) {
  const rsvpFor = useRsvpPropsFor();
  const [openId, setOpenId] = useState(null);
  const allEvents = [...events.upcoming, ...events.past];
  const byId = Object.fromEntries(allEvents.map((e) => [e.id, e]));
  const openEvent = openId ? byId[openId] : null;
  const openRsvp = openEvent ? rsvpFor(openEvent) : null;

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
          rsvp: rsvpSummary(rsvpFor(event)),
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
                    setOpenId(info.event.id);
                  }
                }}
                eventContent={(arg) =>
                  arg.event.title === 'BLACKOUT' ? undefined : (
                    <span className="flex min-w-0 items-center gap-1 overflow-hidden px-0.5">
                      <RsvpBadges summary={arg.event.extendedProps.rsvp} />
                      {arg.timeText && <span className="shrink-0 opacity-90">{arg.timeText}</span>}
                      <span className="truncate font-semibold">{arg.event.title}</span>
                    </span>
                  )
                }
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

      {openEvent && (
        <ResponsiveModal onClose={() => setOpenId(null)} size="md">
          <ResponsiveModal.Header className="border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground">
              {EVENT_TYPES[openEvent.eventType]?.label || 'Event'}
            </p>
            <h2 className="text-lg font-bold text-foreground">{openEvent.title}</h2>
          </ResponsiveModal.Header>
          <ResponsiveModal.Body className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Clock size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              {new Date(openEvent.timestamp * 1000).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}{' '}
              · {openEvent.displayTime}
            </p>
            {openEvent.location && (
              <p className="flex items-start gap-2 text-sm text-foreground">
                <MapPin size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {openEvent.location}
              </p>
            )}
            {openEvent.description && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{openEvent.description}</p>
            )}
            {openRsvp && !openEvent.isCancelled && <EventRsvp {...openRsvp} />}
          </ResponsiveModal.Body>
        </ResponsiveModal>
      )}
    </div>
  );
}

/**
 * What a calendar chip shows: for a guardian or player, each of their answers; for staff, the going count.
 * Plain data, since FullCalendar keeps it in the event's extendedProps.
 */
function rsvpSummary(props) {
  if (!props) return null;
  const byPlayer = Object.fromEntries(props.rsvps.map((r) => [r.playerId, r.status]));
  // Past events show the answers given; only upcoming ones mark what still needs one.
  if (props.mine.length) {
    const mine = props.mine.map((p) => byPlayer[p.id] || null);
    return { mine: props.readOnly ? mine.filter(Boolean) : mine };
  }
  if (props.canManage) {
    return { going: props.roster.filter((p) => byPlayer[p.id] === 'going').length };
  }
  return null;
}

/** The answers as small icons in white discs, so they read on any event colour. */
function RsvpBadges({ summary }) {
  if (!summary) return null;
  const icon = (status, key) => {
    const s = RSVP_STATUSES.find((x) => x.id === status);
    // Not answered yet: an empty ring, so the events still waiting on an answer stand out.
    if (!s) return <span key={key} className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white" />;
    const Icon = s.icon;
    return (
      <span key={key} className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white">
        <Icon size={11} strokeWidth={3} className={s.text} aria-label={s.id} />
      </span>
    );
  };
  if (summary.mine) return <>{summary.mine.map((status, i) => icon(status, i))}</>;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white px-1 text-[10px] font-bold text-success">
      {icon('going', 'g')}
      {summary.going}
    </span>
  );
}
