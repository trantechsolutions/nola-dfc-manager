import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Calendar,
  CalendarOff,
  ChevronDown,
  Clock,
  Share2,
  Check,
  Link2,
  LogIn,
  X,
  List,
  CalendarDays,
  Loader2,
} from 'lucide-react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import ICAL from 'ical.js';

const PUBLIC_HEADERS = {
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
};

const BLACKOUT_COLOR = { bg: '#1e293b', border: '#0f172a', text: '#94a3b8' };

// Format a 'YYYY-MM-DD' string into a friendly, timezone-safe display date.
function formatDateStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Fetch teams directly (no auth required — uses anon key + public RLS policy) ──
async function fetchPublicTeams() {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/teams?select=id,name,age_group,gender,tier,ical_url,color_primary,status&status=eq.active&order=name`,
      { headers: PUBLIC_HEADERS },
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
// Public consumers only ever see that a team is *unavailable* during a slot —
// the event title, location, and type are intentionally never surfaced here.
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
        const jsStart = event.startDate.toJSDate();
        const jsEnd = event.endDate ? event.endDate.toJSDate() : null;
        const status = vevent.getFirstPropertyValue('status') || 'CONFIRMED';
        const isCancelled = String(status).toUpperCase() === 'CANCELLED';

        return {
          id: `${team.id}-${event.uid}`,
          timestamp: event.startDate.toUnixTime(),
          isCancelled,
          teamId: team.id,
          teamName: team.name,
          teamColor: team.colorPrimary,
          displayDate: jsStart.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          displayTime: jsStart.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
          displayEndTime: jsEnd ? jsEnd.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null,
          start: jsStart.toISOString(),
          end: jsEnd ? jsEnd.toISOString() : null,
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
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/blackouts?select=date_str,team_id`, {
      headers: PUBLIC_HEADERS,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data;
  } catch {
    return [];
  }
}

// ── Anonymized "Unavailable" detail modal ──
function UnavailableModal({ detail, onClose }) {
  if (!detail) return null;
  const { isBlackout, teamName, teamColor, displayDate, displayTime, displayEndTime } = detail;
  const timeRange = displayEndTime ? `${displayTime} – ${displayEndTime}` : displayTime;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[300] p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg p-6 w-full max-w-sm shadow-md animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full">
              <CalendarOff size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground leading-tight">Unavailable</h3>
              <p className="text-xs font-medium text-muted-foreground">
                {isBlackout ? 'Rest day — no bookings' : 'This slot is already booked'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {!isBlackout && teamName && (
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: teamColor || '#1e293b' }} />
              <span className="text-sm font-semibold text-foreground">{teamName}</span>
            </div>
          )}
          <div className="flex items-center gap-2.5 text-sm text-foreground">
            <CalendarDays size={15} className="text-muted-foreground shrink-0" />
            <span className="font-medium">{displayDate}</span>
          </div>
          {!isBlackout && timeRange && (
            <div className="flex items-center gap-2.5 text-sm text-foreground">
              <Clock size={15} className="text-muted-foreground shrink-0" />
              <span className="font-medium">{timeRange}</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 px-4 rounded-lg font-semibold text-foreground bg-muted hover:bg-muted/80 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
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
  const [copied, setCopied] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);

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
    if (teams.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }
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

  // Blackouts relevant to the current selection
  const relevantBlackouts = useMemo(
    () => blackoutDates.filter((b) => (selectedTeamId === 'all' ? true : !b.team_id || b.team_id === selectedTeamId)),
    [blackoutDates, selectedTeamId],
  );

  // Calendar events for FullCalendar — every real event is masked to "Unavailable"
  const calendarEvents = useMemo(() => {
    const mapped = upcomingEvents.map((event) => ({
      id: event.id,
      title: 'Unavailable',
      start: event.start,
      end: event.end || undefined,
      backgroundColor: event.teamColor,
      borderColor: event.teamColor,
      textColor: '#ffffff',
      extendedProps: {
        isBlackout: false,
        teamName: event.teamName,
        teamColor: event.teamColor,
        displayDate: event.displayDate,
        displayTime: event.displayTime,
        displayEndTime: event.displayEndTime,
      },
    }));

    const blackouts = relevantBlackouts.map((b) => ({
      id: `blackout-${b.date_str}`,
      title: 'Unavailable',
      start: b.date_str,
      allDay: true,
      backgroundColor: BLACKOUT_COLOR.bg,
      borderColor: BLACKOUT_COLOR.border,
      textColor: BLACKOUT_COLOR.text,
      extendedProps: { isBlackout: true, displayDate: formatDateStr(b.date_str) },
    }));

    return [...mapped, ...blackouts];
  }, [upcomingEvents, relevantBlackouts]);

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

  const activeTeams = teams.filter((t) => t.icalUrl);

  return (
    <div className="min-h-screen bg-background">
      {/* ── HEADER ── */}
      <header className="bg-accent text-accent-foreground">
        <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={20} className="text-blue-400" />
                <span className="text-xs font-bold text-blue-400">Public Schedule</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team Availability</h1>
              <p className="text-muted-foreground text-sm font-medium mt-1">
                {selectedTeamId === 'all'
                  ? `${teams.length} teams · ${upcomingEvents.length} booked slots`
                  : `${selectedTeam?.name || 'Team'} · ${upcomingEvents.length} booked slots`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Share Button */}
              <button
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-semibold text-xs transition-all ${
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
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-semibold text-xs bg-white/10 text-white hover:bg-white/20 transition-all"
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
              className="w-full md:w-auto flex items-center justify-between gap-3 px-4 py-3 bg-white/10 rounded-lg hover:bg-white/15 transition-colors"
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
                <span className="font-semibold text-sm">
                  {selectedTeamId === 'all' ? 'All Teams' : selectedTeam?.name || 'Select Team'}
                </span>
                {selectedTeam && (
                  <span className="text-xs text-muted-foreground font-medium hidden md:inline">
                    {selectedTeam.ageGroup} · {selectedTeam.gender} · {selectedTeam.tier}
                  </span>
                )}
              </div>
              <ChevronDown
                size={16}
                className={`text-muted-foreground transition-transform ${showTeamDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {showTeamDropdown && (
              <div className="absolute left-0 right-0 md:right-auto md:w-80 top-full mt-1 bg-card rounded-lg border border-border shadow-md z-50 overflow-hidden max-h-72 overflow-y-auto">
                <button
                  onClick={() => handleTeamChange('all')}
                  className={`w-full text-left px-4 py-3 flex items-center gap-2.5 hover:bg-accent/90 transition-colors ${selectedTeamId === 'all' ? 'bg-muted' : ''}`}
                >
                  <span className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">All Teams</span>
                  <span className="text-xs text-muted-foreground ml-auto">{teams.length} teams</span>
                </button>
                <div className="border-t border-border" />
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTeamChange(t.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-2.5 hover:bg-accent/90 transition-colors ${selectedTeamId === t.id ? 'bg-muted' : ''}`}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.colorPrimary }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
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
        <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-center justify-between gap-3">
          {/* View Toggle */}
          <div className="flex bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-xs transition-all ${
                view === 'calendar' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <CalendarDays size={14} /> Calendar
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-xs transition-all ${
                view === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <List size={14} /> List
            </button>
          </div>

          {/* Privacy note */}
          <p className="text-xs text-muted-foreground font-medium hidden sm:block">
            Only availability is shown — event details are private.
          </p>

          {/* Share URL (desktop) */}
          <div className="hidden md:flex items-center gap-2 bg-background rounded-lg px-3 py-1.5 border border-border max-w-xs">
            <Link2 size={12} className="text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-mono truncate">{shareUrl}</span>
            <button
              onClick={handleCopyLink}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 shrink-0"
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
            <Loader2 size={32} className="animate-spin text-muted-foreground" />
          </div>
        ) : view === 'calendar' ? (
          /* ── CALENDAR VIEW ── */
          <div className="bg-card p-4 md:p-6 rounded-lg border border-border shadow-sm">
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs font-semibold text-muted-foreground">
              {selectedTeamId === 'all' ? (
                // Team color legend for all-teams view
                activeTeams.map((t) => (
                  <span key={t.id} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.colorPrimary }} />
                    {t.name}
                  </span>
                ))
              ) : (
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: selectedTeam?.colorPrimary || '#1e293b' }}
                  />
                  Unavailable
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BLACKOUT_COLOR.bg }} />
                Rest day
              </span>
            </div>

            <FullCalendar
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }}
              events={calendarEvents}
              eventClick={(info) => {
                const p = info.event.extendedProps;
                setSelectedDetail({
                  isBlackout: p.isBlackout,
                  teamName: p.teamName,
                  teamColor: p.teamColor,
                  displayDate: p.displayDate,
                  displayTime: p.displayTime,
                  displayEndTime: p.displayEndTime,
                });
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
            {upcomingEvents.length === 0 ? (
              <div className="bg-card rounded-lg border-2 border-dashed border-border p-12 text-center text-muted-foreground font-semibold text-sm">
                No upcoming bookings.
              </div>
            ) : (
              upcomingEvents.map((event) => {
                const timeRange = event.displayEndTime
                  ? `${event.displayTime} – ${event.displayEndTime}`
                  : event.displayTime;
                return (
                  <button
                    key={event.id}
                    onClick={() =>
                      setSelectedDetail({
                        isBlackout: false,
                        teamName: event.teamName,
                        teamColor: event.teamColor,
                        displayDate: event.displayDate,
                        displayTime: event.displayTime,
                        displayEndTime: event.displayEndTime,
                      })
                    }
                    className="w-full text-left bg-card rounded-lg border border-border shadow-sm overflow-hidden flex hover:shadow-md dark:hover:shadow-none transition-shadow"
                  >
                    <div className="w-1.5 shrink-0" style={{ backgroundColor: event.teamColor }} />
                    <div className="p-4 flex-grow">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Unavailable
                        </span>
                        {selectedTeamId === 'all' && (
                          <span className="text-xs font-semibold text-muted-foreground">{event.teamName}</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">{event.displayDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock size={12} className="text-muted-foreground" />
                        <span className="font-medium">{timeRange}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <UnavailableModal detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
    </div>
  );
}
