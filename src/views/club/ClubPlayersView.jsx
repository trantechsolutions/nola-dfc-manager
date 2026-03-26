import { useState, useEffect, useMemo } from 'react';
import { Users, Search, ArrowRightLeft, UserPlus, Archive, RotateCcw, X, Plus } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { getUSAgeGroup } from '../../utils/ageGroup';
import { useT } from '../../i18n/I18nContext';

const EMPTY_PLAYER = {
  firstName: '',
  lastName: '',
  birthdate: '',
  gender: '',
  position: '',
  teamId: '',
  jerseyNumber: '',
  guardianName: '',
  guardianEmail: '',
  guardianPhone: '',
  playerType: 'current', // current | prospect
};

export default function ClubPlayersView({ club, teams, seasons, selectedSeason, showToast, showConfirm }) {
  const { t } = useT();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [transferringId, setTransferringId] = useState(null);
  const [transferTeamId, setTransferTeamId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY_PLAYER });
  const [saving, setSaving] = useState(false);

  const fetchPlayers = async () => {
    if (!club?.id) return;
    setLoading(true);
    try {
      const data = await supabaseService.getPlayersByClub(club.id);
      setPlayers(data);
    } catch (e) {
      console.error('Failed to fetch club players:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, [club?.id]);

  const filtered = useMemo(() => {
    return players.filter((p) => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterTeam !== 'all' && filterTeam !== 'unassigned' && p.teamId !== filterTeam) return false;
      if (filterTeam === 'unassigned' && p.teamId) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        return name.includes(q) || p.teamName?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [players, search, filterTeam, filterStatus]);

  const stats = useMemo(
    () => ({
      total: players.filter((p) => p.status === 'active').length,
      prospects: players.filter((p) => p.status === 'prospect').length,
      assigned: players.filter((p) => p.status === 'active' && p.teamId).length,
      unassigned: players.filter((p) => (p.status === 'active' || p.status === 'prospect') && !p.teamId).length,
      archived: players.filter((p) => p.status === 'archived').length,
    }),
    [players],
  );

  const handleTransfer = async (playerId) => {
    if (!transferTeamId) return;
    try {
      await supabaseService.transferPlayer(playerId, transferTeamId === 'none' ? null : transferTeamId);
      setTransferringId(null);
      setTransferTeamId('');
      await fetchPlayers();
      showToast?.('Player transferred');
    } catch (e) {
      showToast?.(`Transfer failed: ${e.message}`, true);
    }
  };

  const handleArchiveRestore = async (player) => {
    const isArchiving = player.status === 'active';
    const ok = await showConfirm?.(
      isArchiving
        ? `Archive ${player.firstName} ${player.lastName}?`
        : `Restore ${player.firstName} ${player.lastName} to active?`,
    );
    if (!ok) return;
    try {
      await supabaseService.updatePlayerField(player.id, 'status', isArchiving ? 'archived' : 'active');
      await fetchPlayers();
      showToast?.(isArchiving ? 'Player archived' : 'Player restored');
    } catch (e) {
      showToast?.(`Failed: ${e.message}`, true);
    }
  };

  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!addForm.firstName.trim() || !addForm.lastName.trim()) return;
    setSaving(true);
    try {
      const playerData = {
        firstName: addForm.firstName.trim(),
        lastName: addForm.lastName.trim(),
        birthdate: addForm.birthdate || null,
        gender: addForm.gender || null,
        jerseyNumber: addForm.jerseyNumber || null,
        status: addForm.playerType === 'prospect' ? 'prospect' : 'active',
        clubId: club.id,
        teamId: addForm.teamId || null,
      };
      const result = await supabaseService.addPlayer(playerData);

      // Add guardian if provided
      if (addForm.guardianName.trim() && result?.id) {
        await supabaseService.addGuardian({
          playerId: result.id,
          name: addForm.guardianName.trim(),
          email: addForm.guardianEmail.trim() || null,
          phone: addForm.guardianPhone.trim() || null,
        });
      }

      setShowAddModal(false);
      setAddForm({ ...EMPTY_PLAYER });
      await fetchPlayers();
      showToast?.(`${playerData.firstName} ${playerData.lastName} added`);
    } catch (e) {
      showToast?.(`Failed to add player: ${e.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={22} className="text-blue-500" />
            {t('clubPlayers.title', 'Club Players')}
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {t('clubPlayers.subtitle', 'All players across all teams')}
          </p>
        </div>
        <button
          onClick={() => {
            setAddForm({ ...EMPTY_PLAYER });
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> Add Player
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Active', value: stats.total, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Prospects', value: stats.prospects, color: 'text-violet-600 dark:text-violet-400' },
          { label: 'Assigned', value: stats.assigned, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Unassigned', value: stats.unassigned, color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Archived', value: stats.archived, color: 'text-slate-500 dark:text-slate-400' },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-center"
          >
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('clubPlayers.search', 'Search players...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 outline-none"
        >
          <option value="all">{t('clubPlayers.allTeams', 'All Teams')}</option>
          <option value="unassigned">{t('clubPlayers.unassigned', 'Unassigned')}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {['active', 'prospect', 'archived'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 text-xs font-bold capitalize transition-colors ${
                filterStatus === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Player List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            {t('clubPlayers.noPlayers', 'No players found.')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((player) => {
              const ageGroup =
                player.birthdate && selectedSeason ? getUSAgeGroup(player.birthdate, selectedSeason) : null;
              const isTransferring = transferringId === player.id;

              return (
                <div
                  key={player.id}
                  className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Player info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {player.firstName} {player.lastName}
                        </p>
                        {player.jerseyNumber && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-600 dark:text-slate-300">
                            #{player.jerseyNumber}
                          </span>
                        )}
                        {ageGroup && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            {ageGroup}
                          </span>
                        )}
                        {player.status === 'prospect' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                            Prospect
                          </span>
                        )}
                        {player.status === 'archived' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {player.teamName ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {player.teamName}
                            </span>
                          ) : (
                            <span className="text-amber-500 dark:text-amber-400 font-medium">Unassigned</span>
                          )}
                        </p>
                        {player.guardians?.length > 0 && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            {player.guardians[0].name}
                            {player.guardians[0].email && ` · ${player.guardians[0].email}`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setTransferringId(isTransferring ? null : player.id);
                          setTransferTeamId(player.teamId || '');
                        }}
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
                        title="Transfer team"
                      >
                        <ArrowRightLeft size={14} />
                      </button>
                      <button
                        onClick={() => handleArchiveRestore(player)}
                        className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-900/30 transition-colors"
                        title={player.status === 'active' ? 'Archive' : 'Restore'}
                      >
                        {player.status === 'active' ? <Archive size={14} /> : <RotateCcw size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Transfer dropdown */}
                  {isTransferring && (
                    <div className="mt-2 flex items-center gap-2 pl-1">
                      <select
                        value={transferTeamId}
                        onChange={(e) => setTransferTeamId(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 outline-none"
                      >
                        <option value="none">— Unassigned —</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name} ({team.ageGroup})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleTransfer(player.id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                      >
                        Transfer
                      </button>
                      <button
                        onClick={() => {
                          setTransferringId(null);
                          setTransferTeamId('');
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary */}
      <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
        {t('clubPlayers.showing', 'Showing {{n}} of {{total}} players', { n: filtered.length, total: players.length })}
      </p>

      {/* Add Player Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus size={20} className="text-blue-500" /> Add Player
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddPlayer} className="p-5 space-y-4">
              {/* Player Type */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                  Player Type
                </label>
                <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {[
                    { value: 'current', label: 'Current Player' },
                    { value: 'prospect', label: 'Prospect' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAddForm((f) => ({ ...f, playerType: opt.value }))}
                      className={`flex-1 px-3 py-2 text-xs font-bold transition-colors ${
                        addForm.playerType === opt.value
                          ? opt.value === 'prospect'
                            ? 'bg-violet-600 text-white'
                            : 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                    First Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={addForm.firstName}
                    onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                    Last Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={addForm.lastName}
                    onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* DOB + Jersey */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                    Birthdate
                  </label>
                  <input
                    type="date"
                    value={addForm.birthdate}
                    onChange={(e) => setAddForm((f) => ({ ...f, birthdate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                    Jersey #
                  </label>
                  <input
                    type="text"
                    value={addForm.jerseyNumber}
                    onChange={(e) => setAddForm((f) => ({ ...f, jerseyNumber: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Gender */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                  Gender
                </label>
                <select
                  value={addForm.gender || ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, gender: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select —</option>
                  <option value="Boys">Boys</option>
                  <option value="Girls">Girls</option>
                </select>
              </div>

              {/* Team Assignment */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                  {addForm.playerType === 'prospect' ? 'Interested Team (optional)' : 'Assign to Team'}
                </label>
                <select
                  value={addForm.teamId}
                  onChange={(e) => setAddForm((f) => ({ ...f, teamId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— No team —</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} ({team.ageGroup})
                    </option>
                  ))}
                </select>
              </div>

              {/* Guardian */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                  Guardian / Parent (optional)
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Guardian name"
                    value={addForm.guardianName}
                    onChange={(e) => setAddForm((f) => ({ ...f, guardianName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      placeholder="Email"
                      value={addForm.guardianEmail}
                      onChange={(e) => setAddForm((f) => ({ ...f, guardianEmail: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={addForm.guardianPhone}
                      onChange={(e) => setAddForm((f) => ({ ...f, guardianPhone: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !addForm.firstName.trim() || !addForm.lastName.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                >
                  {saving ? 'Adding...' : addForm.playerType === 'prospect' ? 'Add Prospect' : 'Add Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
