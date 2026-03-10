import React, { useState } from 'react';
import { List, CalendarDays, Link2, Save, Edit, X, Check } from 'lucide-react';
import Schedule from '../../components/Schedule';
import CalendarView from '../../components/CalendarView';
import { supabaseService } from '../../services/supabaseService';

export default function ScheduleView({ events, blackoutDates, onToggleBlackout, selectedTeam, refreshContext, showToast }) {
  const [scheduleMode, setScheduleMode] = useState('list');
  const [editingUrl, setEditingUrl] = useState(false);
  const [icalUrl, setIcalUrl] = useState(selectedTeam?.icalUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveUrl = async () => {
    if (!selectedTeam?.id) return;
    setIsSaving(true);
    try {
      await supabaseService.updateTeam(selectedTeam.id, { icalUrl: icalUrl.trim() });
      if (refreshContext) await refreshContext();
      setEditingUrl(false);
      if (showToast) showToast('Calendar URL updated. Refresh to see new events.');
    } catch (e) {
      if (showToast) showToast('Failed to save URL.', true);
    } finally { setIsSaving(false); }
  };

  const handleCancelEdit = () => {
    setIcalUrl(selectedTeam?.icalUrl || '');
    setEditingUrl(false);
  };

  return (
    <div className="space-y-4">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Schedule</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {selectedTeam?.name ? `${selectedTeam.name} · ` : ''}
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

      {/* ── ICS CALENDAR URL ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-blue-600" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">iCal Calendar Feed</span>
          </div>
          {!editingUrl && (
            <button onClick={() => { setIcalUrl(selectedTeam?.icalUrl || ''); setEditingUrl(true); }}
              className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800">
              <Edit size={12} /> Edit
            </button>
          )}
        </div>

        {editingUrl ? (
          <div className="space-y-2">
            <input
              type="url"
              placeholder="https://api.olliesports.com/ical/team-..."
              value={icalUrl}
              onChange={e => setIcalUrl(e.target.value)}
              className="w-full border border-blue-200 rounded-xl p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50/50"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button onClick={handleSaveUrl} disabled={isSaving}
                className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white text-xs font-black rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Save size={12} /> {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={handleCancelEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700">
                <X size={12} /> Cancel
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              Paste the ICS feed URL from your scheduling platform (Ollie Sports, TeamSnap, etc.). Events will be fetched live from this URL.
            </p>
          </div>
        ) : (
          <div>
            {selectedTeam?.icalUrl ? (
              <div className="flex items-center gap-2">
                <Check size={12} className="text-emerald-500 shrink-0" />
                <p className="text-xs text-slate-500 font-medium truncate">{selectedTeam.icalUrl}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No calendar feed configured. Click Edit to add one.</p>
            )}
          </div>
        )}
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