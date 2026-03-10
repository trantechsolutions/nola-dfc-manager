import React, { useState } from 'react';
import { 
  List, CalendarDays, Link2, CheckCircle2, AlertCircle, 
  Edit, Save, X, Loader2, ExternalLink, Rss
} from 'lucide-react';
import Schedule from '../../components/Schedule';
import CalendarView from '../../components/CalendarView';
import { supabaseService } from '../../services/supabaseService';

export default function ScheduleView({ 
  events, blackoutDates, onToggleBlackout, 
  selectedTeam, refreshContext, showToast, canEditSchedule 
}) {
  const [scheduleMode, setScheduleMode] = useState('list');

  // ICS feed editing state
  const [isEditingIcs, setIsEditingIcs] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'valid' | 'invalid'
  const [isSaving, setIsSaving] = useState(false);

  const currentIcsUrl = selectedTeam?.icalUrl || '';

  const handleStartEdit = () => {
    setIcsUrl(currentIcsUrl);
    setIsEditingIcs(true);
    setTestResult(null);
  };

  const handleCancelEdit = () => {
    setIsEditingIcs(false);
    setIcsUrl('');
    setTestResult(null);
  };

  const handleTestUrl = async () => {
    if (!icsUrl.trim()) {
      setTestResult('invalid');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(icsUrl.trim());
      const text = await response.text();
      setTestResult(text.includes('BEGIN:VCALENDAR') ? 'valid' : 'invalid');
    } catch {
      setTestResult('invalid');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveUrl = async () => {
    if (!selectedTeam?.id) return;
    setIsSaving(true);
    try {
      await supabaseService.updateTeam(selectedTeam.id, { icalUrl: icsUrl.trim() });
      setIsEditingIcs(false);
      setTestResult(null);
      if (refreshContext) await refreshContext();
      if (showToast) showToast('Calendar feed updated! Reload to see new events.');
    } catch (err) {
      if (showToast) showToast(`Failed to save: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveFeed = async () => {
    if (!selectedTeam?.id) return;
    setIsSaving(true);
    try {
      await supabaseService.updateTeam(selectedTeam.id, { icalUrl: '' });
      setIsEditingIcs(false);
      setIcsUrl('');
      setTestResult(null);
      if (refreshContext) await refreshContext();
      if (showToast) showToast('Calendar feed removed.');
    } catch (err) {
      if (showToast) showToast(`Failed: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

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
              }`}>
              <List size={14} /> List
            </button>
            <button 
              onClick={() => setScheduleMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                scheduleMode === 'calendar' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}>
              <CalendarDays size={14} /> Calendar
            </button>
          </div>
          
          {/* Live indicator */}
          {currentIcsUrl && (
            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Live
            </span>
          )}
        </div>
      </div>

      {/* ── ICS FEED MANAGEMENT (visible to schedulers/admins) ── */}
      {canEditSchedule && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Rss size={16} className="text-slate-400" />
              <div>
                <p className="text-xs font-black text-slate-700">Calendar Feed</p>
                {currentIcsUrl ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 size={11} className="text-emerald-500" />
                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[300px]">{currentIcsUrl}</span>
                  </div>
                ) : (
                  <p className="text-[10px] text-amber-600 font-bold mt-0.5 flex items-center gap-1">
                    <AlertCircle size={11} /> No feed configured — events won't sync
                  </p>
                )}
              </div>
            </div>

            {!isEditingIcs && (
              <button onClick={handleStartEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors">
                <Edit size={12} /> {currentIcsUrl ? 'Edit' : 'Add Feed'}
              </button>
            )}
          </div>

          {/* Edit panel */}
          {isEditingIcs && (
            <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">iCal / .ics URL</label>
                <p className="text-[10px] text-slate-400 mt-0.5 mb-1.5">
                  Paste the .ics feed URL from Ollie Sports, TeamSnap, Google Calendar, or any other scheduling platform.
                </p>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    value={icsUrl} 
                    onChange={e => { setIcsUrl(e.target.value); setTestResult(null); }}
                    placeholder="https://api.olliesports.com/ical/team-..."
                    className="flex-grow border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <button 
                    onClick={handleTestUrl} 
                    disabled={isTesting || !icsUrl.trim()}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors shrink-0">
                    {isTesting ? <Loader2 size={14} className="animate-spin" /> : 'Test'}
                  </button>
                </div>

                {/* Test result */}
                {testResult === 'valid' && (
                  <p className="text-xs text-emerald-600 font-bold mt-1.5 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Feed verified — valid iCal data found
                  </p>
                )}
                {testResult === 'invalid' && (
                  <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> Invalid or unreachable URL. Check the link and try again.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div className="flex gap-2">
                  {currentIcsUrl && (
                    <button onClick={handleRemoveFeed} disabled={isSaving}
                      className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors disabled:opacity-50">
                      Remove Feed
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCancelEdit}
                    className="flex items-center gap-1 px-3 py-1.5 text-slate-500 text-xs font-bold rounded-lg hover:bg-slate-100 transition-colors">
                    <X size={12} /> Cancel
                  </button>
                  <button 
                    onClick={handleSaveUrl} 
                    disabled={isSaving || !icsUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg shadow-sm transition-colors disabled:opacity-50">
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Save Feed
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── NO FEED WARNING ── */}
      {!currentIcsUrl && !canEditSchedule && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            No calendar feed has been configured for this team. Contact your team manager to set one up.
          </p>
        </div>
      )}

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