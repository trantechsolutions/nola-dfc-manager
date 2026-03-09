import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, ChevronRight, Building2, Shield, ShieldCheck, ShieldX,
  AlertTriangle, UserCheck, FileText, CheckCircle2
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';

export default function ClubDashboard({ club, teams, seasons, selectedSeason, onSelectTeam }) {
  const [teamData, setTeamData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const data = {};
      for (const team of teams) {
        try {
          const players = await supabaseService.getPlayersByTeam(team.id);
          const seasonPlayers = players.filter(p => p.seasonProfiles?.[selectedSeason]);

          const medical = seasonPlayers.filter(p => p.medicalRelease).length;
          const reeplayer = seasonPlayers.filter(p => p.reePlayerWaiver).length;
          const fullyCompliant = seasonPlayers.filter(p => p.medicalRelease && p.reePlayerWaiver).length;

          // Fetch documents for compliance tracking
          let docs = [];
          try { docs = await supabaseService.getTeamDocuments(team.id); } catch {}
          const docsUploaded = docs.length;
          const docsVerified = docs.filter(d => d.status === 'verified').length;
          const docsPending = docs.filter(d => d.status === 'uploaded').length;

          // Staff count
          let staffRoles = [];
          try { staffRoles = await supabaseService.getTeamRoles(team.id); } catch {}

          const missingCompliance = seasonPlayers.filter(p => !p.medicalRelease || !p.reePlayerWaiver).map(p => ({
            name: `${p.firstName} ${p.lastName}`,
            jersey: p.jerseyNumber,
            missingMedical: !p.medicalRelease,
            missingReeplayer: !p.reePlayerWaiver,
          }));

          data[team.id] = {
            playerCount: seasonPlayers.length,
            medical, reeplayer, fullyCompliant,
            complianceRate: seasonPlayers.length > 0 ? Math.round((fullyCompliant / seasonPlayers.length) * 100) : 100,
            docsUploaded, docsVerified, docsPending,
            staffCount: [...new Set(staffRoles.map(r => r.userId))].length,
            staffRoles,
            missingCompliance,
          };
        } catch (e) {
          console.error(`Error fetching data for ${team.name}:`, e);
          data[team.id] = { playerCount: 0, medical: 0, reeplayer: 0, fullyCompliant: 0, complianceRate: 100, docsUploaded: 0, docsVerified: 0, docsPending: 0, staffCount: 0, staffRoles: [], missingCompliance: [] };
        }
      }
      setTeamData(data);
      setLoading(false);
    };
    if (teams.length > 0) fetchAll();
  }, [teams, selectedSeason]);

  const totals = useMemo(() => {
    const vals = Object.values(teamData);
    const totalPlayers = vals.reduce((s, d) => s + d.playerCount, 0);
    const totalCompliant = vals.reduce((s, d) => s + d.fullyCompliant, 0);
    const totalMissingMedical = vals.reduce((s, d) => s + (d.playerCount - d.medical), 0);
    const totalMissingReeplayer = vals.reduce((s, d) => s + (d.playerCount - d.reeplayer), 0);
    const totalDocs = vals.reduce((s, d) => s + d.docsUploaded, 0);
    const totalStaff = new Set(vals.flatMap(d => d.staffRoles.map(r => r.userId))).size;
    return { totalPlayers, totalCompliant, totalMissingMedical, totalMissingReeplayer, totalDocs, totalStaff };
  }, [teamData]);

  const overallComplianceRate = totals.totalPlayers > 0 ? Math.round((totals.totalCompliant / totals.totalPlayers) * 100) : 100;

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse">Loading club overview...</div>;

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-900 rounded-xl"><Building2 size={20} className="text-white" /></div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">{club?.name || 'Club'} Overview</h2>
          <p className="text-xs text-slate-400 font-bold">{selectedSeason} · {teams.length} teams · {totals.totalPlayers} players</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <Users size={16} className="text-blue-600" />
          <p className="text-2xl font-black text-slate-900 mt-1">{totals.totalPlayers}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Total Players</p>
        </div>
        <div className={`p-4 rounded-2xl border shadow-sm ${overallComplianceRate === 100 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <ShieldCheck size={16} className={overallComplianceRate === 100 ? 'text-emerald-600' : 'text-amber-600'} />
          <p className={`text-2xl font-black mt-1 ${overallComplianceRate === 100 ? 'text-emerald-700' : 'text-amber-700'}`}>{overallComplianceRate}%</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Compliance Rate</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <FileText size={16} className="text-violet-600" />
          <p className="text-2xl font-black text-slate-900 mt-1">{totals.totalDocs}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Documents</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <UserCheck size={16} className="text-blue-600" />
          <p className="text-2xl font-black text-slate-900 mt-1">{totals.totalStaff}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Staff Members</p>
        </div>
      </div>

      {/* Per-Team Cards */}
      <div className="space-y-3">
        <h3 className="font-black text-slate-800 text-sm">Teams</h3>
        {teams.map(team => {
          const d = teamData[team.id] || {};
          const hasMissing = d.missingCompliance?.length > 0;

          return (
            <div key={team.id}
              onClick={() => onSelectTeam(team.id)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-blue-200 cursor-pointer transition-all active:scale-[0.99] group">
              <div className="flex items-center gap-4">
                <div className="w-2 h-14 rounded-full shrink-0" style={{ backgroundColor: team.colorPrimary || '#1e293b' }} />

                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-black text-slate-900 text-sm truncate">{team.name}</h4>
                    <span className="text-[9px] font-bold text-slate-400">{team.ageGroup} · {team.gender}</span>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] font-medium">
                    <span className="text-slate-500 flex items-center gap-1"><Users size={12} /> {d.playerCount || 0} players</span>
                    <span className="text-slate-500 flex items-center gap-1"><UserCheck size={12} /> {d.staffCount || 0} staff</span>
                    {d.docsUploaded > 0 && (
                      <span className="text-slate-400 flex items-center gap-1"><FileText size={12} /> {d.docsUploaded} docs</span>
                    )}
                  </div>

                  {/* Compliance bar */}
                  {d.playerCount > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-grow h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${d.complianceRate === 100 ? 'bg-emerald-500' : d.complianceRate >= 75 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${d.complianceRate}%` }} />
                      </div>
                      <span className={`text-[10px] font-bold ${d.complianceRate === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {d.fullyCompliant}/{d.playerCount} compliant
                      </span>
                    </div>
                  )}
                </div>

                {/* Status + chevron */}
                <div className="flex items-center gap-2 shrink-0">
                  {hasMissing && (
                    <div className="p-1.5 bg-amber-100 rounded-lg">
                      <AlertTriangle size={14} className="text-amber-600" />
                    </div>
                  )}
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compliance Alerts */}
      {(totals.totalMissingMedical > 0 || totals.totalMissingReeplayer > 0) && (
        <div className="bg-gradient-to-r from-amber-50 to-red-50 border border-amber-200 rounded-2xl p-5">
          <h3 className="font-black text-amber-800 text-sm flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-500" /> Missing Compliance — All Teams
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/70 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-red-600">{totals.totalMissingMedical}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Missing Medical Release</p>
            </div>
            <div className="bg-white/70 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-red-600">{totals.totalMissingReeplayer}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Missing ReePlayer Waiver</p>
            </div>
          </div>

          <div className="space-y-2">
            {teams.map(team => {
              const d = teamData[team.id] || {};
              if (!d.missingCompliance?.length) return null;
              return (
                <div key={team.id} className="bg-white/70 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.colorPrimary }} />
                    <span className="text-xs font-bold text-slate-800">{team.name}</span>
                    <span className="text-[10px] font-bold text-red-600">{d.missingCompliance.length} player{d.missingCompliance.length !== 1 && 's'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {d.missingCompliance.slice(0, 6).map((p, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold bg-white border border-slate-200 px-2 py-0.5 rounded">
                        <span className="text-slate-600">#{p.jersey || '?'} {p.name}</span>
                        {p.missingMedical && <ShieldX size={10} className="text-red-400" title="Missing medical" />}
                        {p.missingReeplayer && <ShieldX size={10} className="text-amber-400" title="Missing ReePlayer" />}
                      </span>
                    ))}
                    {d.missingCompliance.length > 6 && (
                      <span className="text-[10px] text-slate-400 font-bold self-center">+{d.missingCompliance.length - 6} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Compliant Banner */}
      {totals.totalMissingMedical === 0 && totals.totalMissingReeplayer === 0 && totals.totalPlayers > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
          <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
          <div>
            <p className="font-black text-emerald-800 text-sm">All Players Compliant</p>
            <p className="text-xs text-emerald-600">Every player across all {teams.length} teams has their medical release and ReePlayer waiver on file.</p>
          </div>
        </div>
      )}
    </div>
  );
}