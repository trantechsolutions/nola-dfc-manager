import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Calendar,
  ChevronDown,
  MapPin,
  Clock,
  Share2,
  Check,
  Link2,
  LogIn,
  Filter,
  X,
  List,
  CalendarDays,
  Loader2,
} from 'lucide-react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import ICAL from 'ical.js';
import { classifyEvent, EVENT_TYPES, EVENT_CALENDAR_COLORS } from '../../utils/eventClassifier';

const PUBLIC_HEADERS = {
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
};

// ── Fetch teams directly (no auth required — uses anon key + public RLS policy) ──
async function fetchPublicTeams() {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/teams?select=id,name,age_group,gender,tier,ical_url,color_primary,status&status=eq.active&order=name`,
      { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((t) => ({
      id: t.id,
      name: t.name,
      ageGroup: t.age_group,
      gender: t.gender,
      tier: t.tier,
      icalUrl: t.ical_url,
      colorPrimary: t.color_primary || '#1e293b',
    }));
  } catch (err) {
    console.warn('[PublicCalendar] Could not fetch teams:', err);
    return [];
  }
}

// ── Fetch & parse iCal for a team ──
async function fetchTeamEvents(team) {
  if (!team?.icalUrl) return [];
  try {
    const response = await fetch(team.icalUrl);
    const icsString = await response.text();
    const jcalData = ICAL.parse(icsString);
    const vcalendar = new ICAL.Component(jcalData);

    return vcalendar
      .getAllSubcomponents('vevent')
      .map((vevent) => {
        const event = new ICAL.Event(vevent);
        const jsDate = event.startDate.toJSDate();
        const descProp = vevent.getFirstPropertyValue('description');
        const description = descProp ? String(descProp) : '';
        const status = vevent.getFirstPropertyValue('status') || 'CONFIRMED';
        const isCancelled = status.toUpperCase() === 'CANCELLED';

        return {
          id: `${team.id}-${event.uid}`,
          title: event.summary,
          description,
          location: event.location || 'TBD',
          timestamp: event.startDate.toUnixTime(),
          eventType: classifyEvent(event.summary, description),
          isCancelled,
          teamId: team.id,
          teamName: team.name,
          teamColor: team.colorPrimary,
          displayDate: jsDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          displayTime: jsDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
          isoDate: jsDate.toISOString().split('T')[0],
          start: jsDate.toISOString(),
        };
      })
      .filter((e) => !e.isCancelled);
  } catch (err) {
    console.error(`[PublicCalendar] iCal fetch failed for ${team.name}:`, err);
    return [];
  }
}

// ── Fetch blackout dates ──
async function fetchBlackouts() {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/blackouts?select=date_str`, {
      headers: PUBLIC_HEADERS,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data;
  } catch {
    return [];
  }
}

export default function PublicCalendarView({ onBack }) {
  const { teamId: routeTeamId } = useParams();
  const navigate = useNavigate();

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(routeTeamId || 'all');
  const [events, setEvents] = useState([]);
  const [blackoutDates, setBlackoutDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('calendar');
  const [typeFilter, setTypeFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  // ── Load teams on mount ──
  useEffect(() => {
    const init = async () => {
      const [teamList, blackouts] = await Promise.all([fetchPublicTeams(), fetchBlackouts()]);
      setTeams(teamList);
      setBlackoutDates(blackouts);

      // If a team ID was in the URL, validate it
      if (routeTeamId && teamList.find((t) => t.id === routeTeamId)) {
        setSelectedTeamId(routeTeamId);
      }
    };
    init();
  }, [routeTeamId]);

  // ── Fetch events when team selection changes ──
  const fetchEvents = useCallback(async () => {
    if (teams.length === 0) return;
    setLoading(true);

    let allEvents = [];
    if (selectedTeamId === 'all') {
      // Fetch all teams in parallel
      const results = await Promise.allSettled(teams.filter((t) => t.icalUrl).map((t) => fetchTeamEvents(t)));
      results.forEach((r) => {
        if (r.status === 'fulfilled') allEvents.push(...r.value);
      });
    } else {
      const team = teams.find((t) => t.id === selectedTeamId);
      if (team) allEvents = await fetchTeamEvents(team);
    }

    allEvents.sort((a, b) => a.timestamp - b.timestamp);
    setEvents(allEvents);
    setLoading(false);
  }, [teams, selectedTeamId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ── Derived data ──
  const now = Math.floor(Date.now() / 1000);
  const upcomingEvents = useMemo(() => events.filter((e) => e.timestamp >= now), [events, now]);
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || null;

  const filteredEvents = useMemo(() => {
    if (typeFilter === 'all') return upcomingEvents;
    return upcomingEvents.filter((e) => e.eventType === typeFilter);
  }, [upcomingEvents, typeFilter]);

  // Calendar events for FullCalendar
  const calendarEvents = useMemo(() => {
    const mapped = events
      .filter((e) => e.timestamp >= now)
      .map((event) => {
        const colors = EVENT_CALENDAR_COLORS[event.eventType] || EVENT_CALENDAR_COLORS.event;
        return {
          id: event.id,
          title: selectedTeamId === 'all' ? `[${event.teamName}] ${event.title}` : event.title,
          start: event.start,
          backgroundColor: selectedTeamId === 'all' ? event.teamColor : colors.bg,
          borderColor: selectedTeamId === 'all' ? event.teamColor : colors.border,
          textColor: '#ffffff',
          extendedProps: {
            location: event.location,
            time: event.displayTime,
            eventType: event.eventType,
            teamName: event.teamName,
          },
        };
      });

    const relevantBlackouts = blackoutDates.filter(
      (b) =>
        selectedTeamId === 'all'
          ? true // Show all blackouts when viewing all teams
          : !b.team_id || b.team_id === selectedTeamId, // Team-specific + global
    );

    const blackouts = relevantBlackouts.map((b) => ({
      id: `blackout-${b.date_str}`,
      title: 'Unavailable',
      start: b.date_str,
      backgroundColor: '#1e293b',
      borderColor: '#0f172a',
      textColor: '#94a3b8',
      allDay: true,
    }));

    return [...mapped, ...blackouts];
  }, [events, blackoutDates, selectedTeamId, now]);

  // ── Share link ──
  const shareUrl = useMemo(() => {
    const base = `${window.location.origin}${window.location.pathname}`;
    if (selectedTeamId === 'all') return `${base}#/calendar`;
    return `${base}#/calendar/${selectedTeamId}`;
  }, [selectedTeamId]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleTeamChange = (teamId) => {
    setSelectedTeamId(teamId);
    setShowTeamDropdown(false);
    // Update URL without full navigation
    if (teamId === 'all') {
      navigate('/calendar', { replace: true });
    } else {
      navigate(`/calendar/${teamId}`, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      {/* ── HEADER ── */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={20} className="text-blue-400" />
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Public Schedule</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Team Schedule</h1>
              <p className="text-slate-400 text-sm font-medium mt-1">
                {selectedTeamId === 'all'
                  ? `${teams.length} teams · ${upcomingEvents.length} upcoming events`
                  : `${selectedTeam?.name || 'Team'} · ${upcomingEvents.length} upcoming`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Share Button */}
              <button
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  copied ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {copied ? <Check size={14} /> : <Share2 size={14} />}
                {copied ? 'Link Copied!' : 'Share Calendar'}
              </button>

              {/* Login link */}
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-white/10 text-white hover:bg-white/20 transition-all"
                >
                  <LogIn size={14} /> Sign In
                </button>
              )}
            </div>
          </div>

          {/* ── TEAM SELECTOR ── */}
          <div className="mt-4 relative">
            <button
              onClick={() => setShowTeamDropdown(!showTeamDropdown)}
              className="w-full md:w-auto flex items-center justify-between gap-3 px-4 py-3 bg-white/10 rounded-xl hover:bg-white/15 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {selectedTeam && (
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: selectedTeam.colorPrimary }}
                  />
                )}
                {selectedTeamId === 'all' && (
                  <span className="w-3 h-3 rounded-full shrink-0 bg-gradient-to-br from-blue-400 to-violet-400" />
                )}
                <span className="font-bold text-sm">
                  {selectedTeamId === 'all' ? 'All Teams' : selectedTeam?.name || 'Select Team'}
                </span>
                {selectedTeam && (
                  <span className="text-[10px] text-slate-400 font-medium hidden md:inline">
                    {selectedTeam.ageGroup} · {selectedTeam.gender} · {selectedTeam.tier}
                  </span>
                )}
              </div>
              <ChevronDown
                size={16}
                className={`text-slate-400 transition-transform ${showTeamDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {showTeamDropdown && (
              <div className="absolute left-0 right-0 md:right-auto md:w-80 top-full mt-1 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl z-50 overflow-hidden max-h-72 overflow-y-auto">
                <button
                  onClick={() => handleTeamChange('all')}
                  className={`w-full text-left px-4 py-3 flex items-center gap-2.5 hover:bg-slate-700 transition-colors ${selectedTeamId === 'all' ? 'bg-slate-700' : ''}`}
                >
                  <span className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 shrink-0" />
                  <span className="text-sm font-bold text-white">All Teams</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{teams.length} teams</span>
                </button>
                <div className="border-t border-slate-700" />
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTeamChange(t.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-2.5 hover:bg-slate-700 transition-colors ${selectedTeamId === t.id ? 'bg-slate-700' : ''}`}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.colorPrimary }} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {t.ageGroup} · {t.gender} · {t.tier}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── TOOLBAR ── */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none flex flex-wrap items-center justify-between gap-3">
          {/* View Toggle */}
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                view === 'calendar'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm dark:shadow-none'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <CalendarDays size={14} /> Calendar
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                view === 'list'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm dark:shadow-none'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <List size={14} /> List
            </button>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={13} className="text-slate-400" />
            <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  typeFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 shadow-sm dark:shadow-none text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                All
              </button>
              {Object.entries(EVENT_TYPES).map(([key, type]) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                    typeFilter === key
                      ? 'bg-white dark:bg-slate-700 shadow-sm dark:shadow-none text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${type.dot}`} />
                  {type.label}
                </button>
              ))}
            </div>
            {typeFilter !== 'all' && (
              <button
                onClick={() => setTypeFilter('all')}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {/* Share URL (desktop) */}
          <div className="hidden md:flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5 border border-slate-200 dark:border-slate-700 max-w-xs">
            <Link2 size={12} className="text-slate-400 shrink-0" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">{shareUrl}</span>
            <button
              onClick={handleCopyLink}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="max-w-5xl mx-auto px-4 pb-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-slate-300" />
          </div>
        ) : view === 'calendar' ? (
          /* ── CALENDAR VIEW ── */
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {selectedTeamId === 'all'
                ? // Team color legend for all-teams view
                  teams
                    .filter((t) => t.icalUrl)
                    .map((t) => (
                      <span key={t.id} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.colorPrimary }} />
                        {t.name}
                      </span>
                    ))
                : // Event type legend for single-team view
                  Object.entries(EVENT_TYPES).map(([key, type]) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-sm ${type.color}`} />
                      {type.label}
                    </span>
                  ))}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-800" />
                Unavailable
              </span>
            </div>

            <FullCalendar
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }}
              events={calendarEvents}
              eventClick={(info) => {
                const p = info.event.extendedProps;
                if (info.event.title === 'Unavailable') {
                  alert('This date is unavailable (blackout / rest day).');
                } else {
                  alert(
                    `${p.teamName ? `[${p.teamName}] ` : ''}${info.event.title}\n` +
                      `Type: ${EVENT_TYPES[p.eventType]?.label || 'Event'}\n` +
                      `Time: ${p.time}\n` +
                      `Location: ${p.location}`,
                  );
                }
              }}
              height="auto"
              aspectRatio={1.35}
              dayMaxEvents={4}
              eventDisplay="block"
              eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
            />
          </div>
        ) : (
          /* ── LIST VIEW ── */
          <div className="space-y-2">
            {filteredEvents.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 text-center text-slate-400 dark:text-slate-500 font-bold text-sm">
                {typeFilter !== 'all' ? 'No events match your filter.' : 'No upcoming events scheduled.'}
              </div>
            ) : (
              filteredEvents.map((event) => {
                const type = EVENT_TYPES[event.eventType] || EVENT_TYPES.event;
                return (
                  <div
                    key={event.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden flex hover:shadow-md dark:hover:shadow-none transition-shadow"
                  >
                    <div className="w-1.5 shrink-0" style={{ backgroundColor: event.teamColor }} />
                    <div className="p-4 flex-grow">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${type.colorLight}`}>
                          {type.label}
                        </span>
                        {selectedTeamId === 'all' && (
                          <span className="text-[10px] font-bold text-slate-400">{event.teamName}</span>
                        )}
                        <span className="text-[10px] text-slate-400 ml-auto">{event.displayDate}</span>
                      </div>
                      <h4 className="font-black text-slate-900 dark:text-white text-sm mb-2">{event.title}</h4>
                      <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <Clock size={12} className="text-slate-400 dark:text-slate-500" />
                          <span className="font-medium">{event.displayTime}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <MapPin size={12} className="text-slate-400 dark:text-slate-500" />
                          <span className="font-medium">{event.location}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
