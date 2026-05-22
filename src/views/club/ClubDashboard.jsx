import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  ChevronRight,
  Building2,
  Shield,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  UserCheck,
  FileText,
  CheckCircle2,
  CalendarRange,
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import ClubCalendarView from './ClubCalendarView';

export default function ClubDashboard({ club, teams, seasons, selectedSeason, onSelectTeam }) {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState('overview');
  const [teamData, setTeamData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const data = {};
      // Fetch all teams in parallel instead of sequentially (N+1 → 1+N parallel)
      await Promise.all(
        teams.map(async (team) => {
          try {
            const [players, docs, staffRoles] = await Promise.all([
              supabaseService.getPlayersByTeam(team.id),
              supabaseService.getTeamDocuments(team.id).catch(() => []),
              supabaseService.getTeamRoles(team.id).catch(() => []),
            ]);
            const seasonPlayers = players.filter((p) => p.seasonProfiles?.[selectedSeason]);

            const medical = seasonPlayers.filter((p) => p.medicalRelease).length;
            const reeplayer = seasonPlayers.filter((p) => p.reePlayerWaiver).length;
            const fullyCompliant = seasonPlayers.filter((p) => p.medicalRelease && p.reePlayerWaiver).length;

            const docsUploaded = docs.length;
            const docsVerified = docs.filter((d) => d.status === 'verified').length;
            const docsPending = docs.filter((d) => d.status === 'uploaded').length;

            const missingCompliance = seasonPlayers
              .filter((p) => !p.medicalRelease || !p.reePlayerWaiver)
              .map((p) => ({
                name: `${p.firstName} ${p.lastName}`,
                jersey: p.jerseyNumber,
                missingMedical: !p.medicalRelease,
                missingReeplayer: !p.reePlayerWaiver,
              }));

            data[team.id] = {
              playerCount: seasonPlayers.length,
              medical,
              reeplayer,
              fullyCompliant,
              complianceRate:
                seasonPlayers.length > 0 ? Math.round((fullyCompliant / seasonPlayers.length) * 100) : 100,
              docsUploaded,
              docsVerified,
              docsPending,
              staffCount: [...new Set(staffRoles.map((r) => r.userId))].length,
              staffRoles,
              missingCompliance,
            };
          } catch (e) {
            console.error(`Error fetching data for ${team.name}:`, e);
            data[team.id] = {
              playerCount: 0,
              medical: 0,
              reeplayer: 0,
              fullyCompliant: 0,
              complianceRate: 100,
              docsUploaded: 0,
              docsVerified: 0,
              docsPending: 0,
              staffCount: 0,
              staffRoles: [],
              missingCompliance: [],
            };
          }
        }),
      );
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
    const totalStaff = new Set(vals.flatMap((d) => d.staffRoles.map((r) => r.userId))).size;
    return { totalPlayers, totalCompliant, totalMissingMedical, totalMissingReeplayer, totalDocs, totalStaff };
  }, [teamData]);

  const overallComplianceRate =
    totals.totalPlayers > 0 ? Math.round((totals.totalCompliant / totals.totalPlayers) * 100) : 100;

  if (loading)
    return (
      <div className="p-20 text-center font-bold text-muted-foreground animate-pulse">Loading club overview...</div>
    );

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Tab strip */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'overview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Building2 size={14} />
          {t('clubDash.overview')}
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'calendar' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <CalendarRange size={14} />
          {t('clubDash.calendar')}
        </button>
      </div>

      {activeTab === 'calendar' && <ClubCalendarView club={club} teams={teams} />}

      {activeTab === 'overview' && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <Building2 size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {club?.name || 'Club'} {t('clubDash.overview')}
              </h2>
              <p className="text-xs text-muted-foreground font-semibold">
                {selectedSeason} · {teams.length} teams · {totals.totalPlayers} players
              </p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
              <Users size={16} className="text-blue-700 dark:text-blue-400" />
              <p className="text-2xl font-bold text-foreground mt-1">{totals.totalPlayers}</p>
              <p className="text-xs font-semibold text-muted-foreground">{t('clubDash.totalPlayers')}</p>
            </div>
            <div
              className={`p-4 rounded-lg border shadow-sm ${overallComplianceRate === 100 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}
            >
              <ShieldCheck
                size={16}
                className={
                  overallComplianceRate === 100
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }
              />
              <p
                className={`text-2xl font-bold mt-1 ${overallComplianceRate === 100 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}
              >
                {overallComplianceRate}%
              </p>
              <p className="text-xs font-semibold text-muted-foreground">{t('clubDash.complianceRate')}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
              <FileText size={16} className="text-violet-700 dark:text-violet-400" />
              <p className="text-2xl font-bold text-foreground mt-1">{totals.totalDocs}</p>
              <p className="text-xs font-semibold text-muted-foreground">{t('clubDash.documents')}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
              <UserCheck size={16} className="text-blue-700 dark:text-blue-400" />
              <p className="text-2xl font-bold text-foreground mt-1">{totals.totalStaff}</p>
              <p className="text-xs font-semibold text-muted-foreground">{t('clubDash.staffMembers')}</p>
            </div>
          </div>

          {/* Per-Team Cards */}
          <div className="space-y-3">
            <h3 className="font-bold text-foreground text-sm">{t('clubDash.teams')}</h3>
            {teams.map((team) => {
              const d = teamData[team.id] || {};
              const hasMissing = d.missingCompliance?.length > 0;

              return (
                <div
                  key={team.id}
                  onClick={() => onSelectTeam(team.id)}
                  className="bg-card rounded-lg border border-border shadow-sm p-5 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 cursor-pointer transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-2 h-14 rounded-full shrink-0"
                      style={{ backgroundColor: team.colorPrimary || '#1e293b' }}
                    />

                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-foreground text-sm truncate">{team.name}</h4>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {team.ageGroup} · {team.gender}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-medium">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Users size={12} /> {d.playerCount || 0} players
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <UserCheck size={12} /> {d.staffCount || 0} staff
                        </span>
                        {d.docsUploaded > 0 && (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <FileText size={12} /> {d.docsUploaded} docs
                          </span>
                        )}
                      </div>

                      {/* Compliance bar */}
                      {d.playerCount > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-grow h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${d.complianceRate === 100 ? 'bg-emerald-500' : d.complianceRate >= 75 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${d.complianceRate}%` }}
                            />
                          </div>
                          <span
                            className={`text-xs font-semibold ${d.complianceRate === 100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}
                          >
                            {d.fullyCompliant}/{d.playerCount} compliant
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status + chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      {hasMissing && (
                        <div className="p-1.5 bg-amber-100 dark:bg-amber-900/40 rounded-lg">
                          <AlertTriangle size={14} className="text-amber-700 dark:text-amber-400" />
                        </div>
                      )}
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground group-hover:text-blue-700 dark:text-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compliance Alerts */}
          {(totals.totalMissingMedical > 0 || totals.totalMissingReeplayer > 0) && (
            <div className="bg-gradient-to-r from-amber-50 to-red-50 dark:from-amber-900/20 dark:to-red-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-5">
              <h3 className="font-bold text-amber-800 text-sm flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="text-amber-700 dark:text-amber-400" /> Missing Compliance — All
                Teams
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/70 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-red-700 dark:text-red-400">{totals.totalMissingMedical}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Missing Medical Release</p>
                </div>
                <div className="bg-white/70 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-red-700 dark:text-red-400">{totals.totalMissingReeplayer}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Missing ReePlayer Waiver</p>
                </div>
              </div>

              <div className="space-y-2">
                {teams.map((team) => {
                  const d = teamData[team.id] || {};
                  if (!d.missingCompliance?.length) return null;
                  return (
                    <div key={team.id} className="bg-white/70 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.colorPrimary }} />
                        <span className="text-xs font-semibold text-foreground">{team.name}</span>
                        <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                          {d.missingCompliance.length} player{d.missingCompliance.length !== 1 && 's'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {d.missingCompliance.slice(0, 6).map((p, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs font-semibold bg-card border border-border px-2 py-0.5 rounded"
                          >
                            <span className="text-foreground">
                              #{p.jersey || '?'} {p.name}
                            </span>
                            {p.missingMedical && <ShieldX size={10} className="text-red-400" title="Missing medical" />}
                            {p.missingReeplayer && (
                              <ShieldX size={10} className="text-amber-400" title="Missing ReePlayer" />
                            )}
                          </span>
                        ))}
                        {d.missingCompliance.length > 6 && (
                          <span className="text-xs text-muted-foreground font-semibold self-center">
                            +{d.missingCompliance.length - 6} more
                          </span>
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
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-5 flex items-center gap-3">
              <CheckCircle2 size={24} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-emerald-800 text-sm">All Players Compliant</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Every player across all {teams.length} teams has their medical release and ReePlayer waiver on file.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
