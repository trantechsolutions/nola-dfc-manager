import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle2, Plus, Users, Calendar, DollarSign, Sparkles, X } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';

const STEPS = [
  { id: 'team', label: 'Team Info', icon: Users },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'season', label: 'Season', icon: DollarSign },
  { id: 'done', label: 'Ready', icon: Sparkles },
];

const COLORS = ['#1e293b', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#d97706', '#0891b2', '#be185d'];

export default function TeamOnboarding({ club, seasons, onComplete, onCancel, showToast }) {
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [createdTeam, setCreatedTeam] = useState(null);
  const [createdTeamSeason, setCreatedTeamSeason] = useState(null);

  // Step 1: Team info
  const [teamForm, setTeamForm] = useState({
    name: '',
    ageGroup: '',
    gender: 'M',
    tier: 'competitive',
    colorPrimary: '#1e293b',
  });

  // Step 2: Calendar
  const [icalUrl, setIcalUrl] = useState('');
  const [icalValid, setIcalValid] = useState(null);

  // Step 3: Season
  const [selectedSeason, setSelectedSeason] = useState(seasons[0]?.id || '2025-2026');
  const [baseFee, setBaseFee] = useState(750);

  const handleCreateTeam = async () => {
    if (!teamForm.name.trim()) return;
    setIsSaving(true);
    try {
      const team = await supabaseService.createTeam({ ...teamForm, clubId: club.id, icalUrl });
      setCreatedTeam({ id: team.id, ...teamForm, icalUrl });
      setStep(1);
    } catch (e) {
      if (showToast) showToast('Failed to create team.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestIcal = async () => {
    if (!icalUrl) {
      setIcalValid(null);
      return;
    }
    try {
      const response = await fetch(icalUrl);
      const text = await response.text();
      setIcalValid(text.includes('BEGIN:VCALENDAR'));
    } catch {
      setIcalValid(false);
    }
  };

  const handleSaveIcal = async () => {
    if (createdTeam) {
      setIsSaving(true);
      try {
        await supabaseService.updateTeam(createdTeam.id, { icalUrl });
        setStep(2);
      } catch (e) {
        if (showToast) showToast('Failed to save calendar URL.', true);
      } finally {
        setIsSaving(false);
      }
    } else {
      setStep(2);
    }
  };

  const handleCreateSeason = async () => {
    if (!createdTeam) return;
    setIsSaving(true);
    try {
      // Ensure season exists
      try {
        await supabaseService.saveSeason(selectedSeason, { name: selectedSeason });
      } catch {}
      // Create team_season
      const ts = await supabaseService.saveTeamSeason({
        teamId: createdTeam.id,
        seasonId: selectedSeason,
        baseFee: Number(baseFee),
        isFinalized: false,
      });
      setCreatedTeamSeason(ts);
      setStep(3);
    } catch (e) {
      if (showToast) showToast('Failed to create season.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const currentStep = STEPS[step];

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">New Team Setup</h2>
          <p className="text-xs text-slate-400 font-bold">
            {club?.name} · Step {step + 1} of {STEPS.length}
          </p>
        </div>
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
          <X size={20} />
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                i === step
                  ? 'bg-blue-600 text-white'
                  : i < step
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
              }`}
            >
              {i < step ? <CheckCircle2 size={13} /> : <s.icon size={13} />}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-grow rounded ${i < step ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-slate-200 dark:bg-slate-700'}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
        {/* Step 1: Team Info */}
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="font-black text-slate-800 dark:text-white text-lg">Team Information</h3>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Team Name *</label>
              <input
                autoFocus
                type="text"
                placeholder="e.g. 2014 Boys White"
                value={teamForm.name}
                onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 mt-1 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Age Group</label>
                <input
                  type="text"
                  placeholder="U11"
                  value={teamForm.ageGroup}
                  onChange={(e) => setTeamForm({ ...teamForm, ageGroup: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none mt-1 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gender</label>
                <select
                  value={teamForm.gender}
                  onChange={(e) => setTeamForm({ ...teamForm, gender: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none mt-1 dark:bg-slate-800 dark:text-white"
                >
                  <option value="M">Boys</option>
                  <option value="F">Girls</option>
                  <option value="Coed">Coed</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tier</label>
                <select
                  value={teamForm.tier}
                  onChange={(e) => setTeamForm({ ...teamForm, tier: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none mt-1 dark:bg-slate-800 dark:text-white"
                >
                  <option value="competitive">Competitive</option>
                  <option value="recreational">Recreational</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Team Color</label>
              <div className="flex gap-2 mt-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTeamForm({ ...teamForm, colorPrimary: c })}
                    className={`w-8 h-8 rounded-lg transition-all ${teamForm.colorPrimary === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateTeam}
              disabled={isSaving || !teamForm.name.trim()}
              className="w-full py-3 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Create Team <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2: Calendar */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-black text-slate-800 dark:text-white text-lg">Calendar Setup</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Connect an iCal feed from Ollie Sports (or any .ics URL) to sync the team's schedule automatically.
            </p>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">iCal URL</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="url"
                  placeholder="https://api.olliesports.com/ical/team-..."
                  value={icalUrl}
                  onChange={(e) => {
                    setIcalUrl(e.target.value);
                    setIcalValid(null);
                  }}
                  className="flex-grow border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                />
                <button
                  onClick={handleTestIcal}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Test
                </button>
              </div>
              {icalValid === true && (
                <p className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Calendar verified
                </p>
              )}
              {icalValid === false && (
                <p className="text-xs text-red-500 font-bold mt-1">
                  Invalid or unreachable URL. Check the link and try again.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(0)}
                className="flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={handleSaveIcal}
                disabled={isSaving}
                className="flex-1 py-3 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {icalUrl ? 'Save & Continue' : 'Skip'} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Season */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-black text-slate-800 dark:text-white text-lg">Season Setup</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create the team's first season with a base fee. You can adjust the budget and roster from the Budget view
              afterward.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Season</label>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm font-bold outline-none mt-1 dark:bg-slate-800 dark:text-white"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Fee</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">$</span>
                  <input
                    type="number"
                    value={baseFee}
                    onChange={(e) => setBaseFee(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 pl-7 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={handleCreateSeason}
                disabled={isSaving}
                className="flex-1 py-3 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Create Season <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 3 && (
          <div className="text-center py-6 space-y-4">
            <div
              className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
              style={{ backgroundColor: teamForm.colorPrimary }}
            >
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h3 className="font-black text-slate-800 dark:text-white text-xl">{teamForm.name} is ready!</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              Team created with {selectedSeason} season and ${baseFee} base fee.
              {icalUrl ? ' Calendar is connected.' : ''} Next steps: import players and build the budget.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => onComplete(createdTeam?.id)}
                className="flex-1 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"
              >
                Go to Team <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
