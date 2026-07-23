import { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Trash2,
  Users,
  X,
  Shield,
  UserPlus,
  Layers,
  ClipboardCheck,
  Sparkles,
  Ban,
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';

export default function SuperAdminView({
  onSelectClub,
  showToast,
  showConfirm,
  currentUserId,
  singleTeamEnabled = false,
  onToggleSingleTeam,
  evaluationsHidden = false,
  onToggleHideEvaluations,
  insightsHidden = false,
  onToggleHideInsights,
}) {
  const { t } = useT();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubSlug, setNewClubSlug] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Super admins
  const [superAdmins, setSuperAdmins] = useState([]);
  const [loadingSAs, setLoadingSAs] = useState(true);
  const [saEmail, setSaEmail] = useState('');
  const [saSaving, setSaSaving] = useState(false);
  const [saTogglingId, setSaTogglingId] = useState(null);

  // Single-team mode
  const [stmSaving, setStmSaving] = useState(false);

  // Hide evaluations
  const [evalSaving, setEvalSaving] = useState(false);

  // Hide insights
  const [insightsSaving, setInsightsSaving] = useState(false);

  const fetchSuperAdmins = async () => {
    setLoadingSAs(true);
    try {
      const data = await supabaseService.getSuperAdmins();
      setSuperAdmins(data);
    } catch (e) {
      console.error('Failed to fetch super admins:', e);
    } finally {
      setLoadingSAs(false);
    }
  };

  useEffect(() => {
    fetchSuperAdmins();
  }, []);

  const handleAssignSuperAdmin = async () => {
    const email = saEmail.trim().toLowerCase();
    if (!email) return;
    if (superAdmins.some((sa) => (sa.email || '').toLowerCase() === email)) {
      if (showToast) showToast('That user is already a super admin.', true);
      return;
    }
    setSaSaving(true);
    try {
      await supabaseService.assignRoleByEmail(email, 'super_admin', {});
      setSaEmail('');
      await fetchSuperAdmins();
      if (showToast) showToast('Super admin assigned.');
    } catch (e) {
      const msg = /duplicate/i.test(e.message || '')
        ? 'That user is already a super admin.'
        : e.message || 'Assignment failed.';
      if (showToast) showToast(msg, true);
    } finally {
      setSaSaving(false);
    }
  };

  const handleRevokeSuperAdmin = async (sa) => {
    if (sa.userId === currentUserId) {
      if (showToast) showToast('You cannot revoke your own super admin access.', true);
      return;
    }
    if (superAdmins.length <= 1) {
      if (showToast) showToast('Cannot remove the last super admin.', true);
      return;
    }
    const label = sa.email || sa.displayName || 'this user';
    const ok = await showConfirm(`Revoke super admin access for ${label}?`);
    if (!ok) return;
    try {
      await supabaseService.revokeRole(sa.id);
      setSuperAdmins((prev) => prev.filter((x) => x.id !== sa.id));
      if (showToast) showToast('Super admin revoked.');
    } catch (e) {
      if (showToast) showToast('Failed to revoke.', true);
    }
  };

  const handleToggleSuperAdminActive = async (sa) => {
    if (sa.userId === currentUserId) {
      if (showToast) showToast('You cannot disable your own super admin access.', true);
      return;
    }
    const activeCount = superAdmins.filter((x) => x.isActive).length;
    if (sa.isActive && activeCount <= 1) {
      if (showToast) showToast('Cannot disable the last active super admin.', true);
      return;
    }
    setSaTogglingId(sa.id);
    try {
      await supabaseService.updateUserProfile(sa.userId, { isActive: !sa.isActive });
      setSuperAdmins((prev) => prev.map((x) => (x.id === sa.id ? { ...x, isActive: !x.isActive } : x)));
      if (showToast) showToast(sa.isActive ? 'Super admin disabled.' : 'Super admin re-enabled.');
    } catch (e) {
      if (showToast) showToast('Failed to update.', true);
    } finally {
      setSaTogglingId(null);
    }
  };

  const handleToggleStm = async () => {
    if (!onToggleSingleTeam) return;
    const next = !singleTeamEnabled;
    setStmSaving(true);
    try {
      await onToggleSingleTeam(next);
      if (showToast) showToast(next ? 'Single-team mode enabled.' : 'Single-team mode disabled.');
    } catch (e) {
      if (showToast) showToast('Failed to update single-team mode.', true);
    } finally {
      setStmSaving(false);
    }
  };

  const handleToggleHideEvals = async () => {
    if (!onToggleHideEvaluations) return;
    const next = !evaluationsHidden;
    setEvalSaving(true);
    try {
      await onToggleHideEvaluations(next);
      if (showToast) showToast(next ? 'Evaluations tab hidden.' : 'Evaluations tab shown.');
    } catch (e) {
      if (showToast) showToast('Failed to update evaluations visibility.', true);
    } finally {
      setEvalSaving(false);
    }
  };

  const handleToggleHideInsights = async () => {
    if (!onToggleHideInsights) return;
    const next = !insightsHidden;
    setInsightsSaving(true);
    try {
      await onToggleHideInsights(next);
      if (showToast) showToast(next ? 'Insights tab hidden.' : 'Insights tab shown.');
    } catch (e) {
      if (showToast) showToast('Failed to update insights visibility.', true);
    } finally {
      setInsightsSaving(false);
    }
  };

  const fetchClubs = async () => {
    try {
      const data = await supabaseService.getAllClubs();
      setClubs(data);
    } catch (e) {
      console.error('Failed to fetch clubs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClubs();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newClubName.trim()) return;
    setIsSaving(true);
    try {
      const slug =
        newClubSlug.trim() ||
        newClubName
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
      await supabaseService.createClub({ name: newClubName.trim(), slug });
      setNewClubName('');
      setNewClubSlug('');
      setShowCreateForm(false);
      await fetchClubs();
      if (showToast) showToast('Club created successfully');
    } catch (e) {
      if (showToast) showToast(`Failed to create club: ${e.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (club) => {
    const ok = await showConfirm(`Delete "${club.name}" and all its teams, players, and data? This cannot be undone.`);
    if (!ok) return;
    setIsSaving(true);
    try {
      await supabaseService.deleteClub(club.id);
      await fetchClubs();
      if (showToast) showToast(`Club "${club.name}" deleted`);
    } catch (e) {
      if (showToast) showToast(`Failed to delete: ${e.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="p-20 text-center font-bold text-muted-foreground animate-pulse">Loading clubs...</div>;
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield size={24} className="text-violet-700 dark:text-violet-400" />
            App Administration
          </h2>
          <p className="text-xs text-muted-foreground font-semibold mt-1">
            {clubs.length} club{clubs.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition-colors"
        >
          <Plus size={14} /> New Club
        </button>
      </div>

      {/* Single-Team Mode */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Layers size={16} className="text-violet-700 dark:text-violet-400" /> Single-Team Mode
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">
              Hides all club and app-admin UI so the app presents as a single team. Applies to every user. You keep full
              access on this browser after enabling it (use <span className="font-mono">?admin=1</span> to restore it
              elsewhere).
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={singleTeamEnabled}
            onClick={handleToggleStm}
            disabled={stmSaving || !onToggleSingleTeam}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
              singleTeamEnabled ? 'bg-violet-600' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                singleTeamEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Hide Evaluations */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <ClipboardCheck size={16} className="text-violet-700 dark:text-violet-400" /> Hide Evaluations Tab
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">
              Removes the Evaluations tab from every team's navigation across the app. Existing evaluation data is kept
              — this only hides the tab.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={evaluationsHidden}
            onClick={handleToggleHideEvals}
            disabled={evalSaving || !onToggleHideEvaluations}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
              evaluationsHidden ? 'bg-violet-600' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                evaluationsHidden ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Hide Insights */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Sparkles size={16} className="text-violet-700 dark:text-violet-400" /> Hide Insights Tab
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">
              Removes the Insights tab from every team's navigation across the app. Underlying financial and roster data
              is unaffected — this only hides the tab.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={insightsHidden}
            onClick={handleToggleHideInsights}
            disabled={insightsSaving || !onToggleHideInsights}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
              insightsHidden ? 'bg-violet-600' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                insightsHidden ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Super Admins */}
      <div className="bg-card rounded-lg border border-border p-5">
        <h3 className="font-bold text-foreground text-sm flex items-center gap-2 mb-1">
          <Shield size={16} className="text-violet-700 dark:text-violet-400" /> Super Admins
        </h3>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Super admins have full access to the entire app — every club, team, and setting. The user must already have an
          account.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="email"
            placeholder="admin@example.com"
            value={saEmail}
            onChange={(e) => setSaEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAssignSuperAdmin();
            }}
            className="flex-grow border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            onClick={handleAssignSuperAdmin}
            disabled={saSaving || !saEmail.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            <UserPlus size={14} /> Add
          </button>
        </div>

        {loadingSAs ? (
          <p className="text-xs text-muted-foreground animate-pulse py-2">Loading…</p>
        ) : superAdmins.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">No super admins yet.</p>
        ) : (
          <div className="space-y-2">
            {superAdmins.map((sa) => {
              const isSelf = sa.userId === currentUserId;
              const isLast = superAdmins.length <= 1;
              const isLastActive = sa.isActive && superAdmins.filter((x) => x.isActive).length <= 1;
              return (
                <div
                  key={sa.id}
                  className={`flex items-center justify-between bg-background p-3 rounded-lg ${!sa.isActive ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate flex items-center gap-2">
                      {sa.displayName || sa.email || sa.userId.slice(0, 12) + '…'}
                      {isSelf && <span className="text-violet-700 dark:text-violet-400">(you)</span>}
                      {!sa.isActive && (
                        <span className="font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded">
                          DISABLED
                        </span>
                      )}
                    </p>
                    {sa.email && sa.displayName && <p className="text-xs text-muted-foreground truncate">{sa.email}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleSuperAdminActive(sa)}
                      disabled={isSelf || isLastActive || saTogglingId === sa.id}
                      title={
                        isSelf
                          ? 'You cannot disable your own access'
                          : isLastActive
                            ? 'Cannot disable the last active super admin'
                            : sa.isActive
                              ? 'Disable'
                              : 'Re-enable'
                      }
                      className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground ${
                        sa.isActive
                          ? 'text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      }`}
                    >
                      <Ban size={14} />
                    </button>
                    <button
                      onClick={() => handleRevokeSuperAdmin(sa)}
                      disabled={isSelf || isLast}
                      title={
                        isSelf
                          ? 'You cannot revoke your own access'
                          : isLast
                            ? 'Cannot remove the last super admin'
                            : 'Revoke'
                      }
                      className="p-2 text-muted-foreground hover:text-red-700 dark:hover:text-red-400 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Club Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clubs.map((club) => (
          <div
            key={club.id}
            className="bg-card rounded-lg border border-border p-5 hover:border-violet-300 dark:hover:border-violet-700 transition-all cursor-pointer group"
            onClick={() => {
              localStorage.setItem('nola_selected_club', club.id);
              if (onSelectClub) onSelectClub(club);
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <Building2 size={20} className="text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">{club.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{club.slug}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(club);
                }}
                disabled={isSaving}
                className="p-2 text-muted-foreground hover:text-red-700 dark:text-red-400 dark:hover:text-red-400 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {clubs.length === 0 && (
        <div className="bg-card rounded-lg border-2 border-dashed border-border p-16 text-center">
          <Building2 size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No clubs yet. Create one to get started.</p>
        </div>
      )}

      {/* Create Club Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md border border-border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Building2 size={20} className="text-violet-700 dark:text-violet-400" /> New Club
              </h3>
              <button onClick={() => setShowCreateForm(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Club Name *</label>
                <input
                  autoFocus
                  required
                  type="text"
                  placeholder="My Club"
                  value={newClubName}
                  onChange={(e) => {
                    setNewClubName(e.target.value);
                    setNewClubSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                        .replace(/[^a-z0-9-]/g, ''),
                    );
                  }}
                  className="w-full border border-border rounded-lg p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-violet-500 mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Slug</label>
                <input
                  type="text"
                  placeholder="my-club"
                  value={newClubSlug}
                  onChange={(e) => setNewClubSlug(e.target.value)}
                  className="w-full border border-border rounded-lg p-2.5 text-sm font-mono outline-none mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">URL-friendly identifier. Auto-generated from name.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-muted-foreground hover:bg-background transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !newClubName.trim()}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all"
                >
                  {isSaving ? 'Creating...' : 'Create Club'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
