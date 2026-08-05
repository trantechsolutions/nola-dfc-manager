import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, UserPlus, Archive, RotateCcw, X, Plus, Edit } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { getUSAgeGroup } from '../../utils/ageGroup';
import { formatPhoneInput } from '../../utils/phone';
import { useT } from '../../i18n/I18nContext';
import PlayerFormModal from '../../components/PlayerFormModal';
import Badge from '../../components/layout/Badge';
import DirectoryCard, { DetailRow, EmptyRow } from '../../components/layout/DirectoryCard';
import {
  DirectoryToolbar,
  SearchInput,
  FilterSelect,
  ToolbarButton,
  RowAction,
} from '../../components/layout/DirectoryControls';
import { paginate } from '../../utils/pagination';

const PER_PAGE = 25;

const COLUMNS = [
  { key: 'player', label: 'Player' },
  { key: 'team', label: 'Team' },
  { key: 'guardian', label: 'Guardian', className: 'hidden md:table-cell' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', align: 'right' },
];

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
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [page, setPage] = useState(1);

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

  const handleEditPlayer = (player) => {
    setEditingPlayer(player);
    setShowEditModal(true);
  };

  const handleSavePlayer = async (playerData) => {
    try {
      if (playerData.id) {
        await supabaseService.updatePlayer(playerData.id, playerData);
      } else {
        await supabaseService.addPlayer({ ...playerData, clubId: club.id });
      }
      setShowEditModal(false);
      setEditingPlayer(null);
      await fetchPlayers();
      showToast?.('Player saved');
    } catch (e) {
      showToast?.(`Save failed: ${e.message}`, true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  const { slice, page: currentPage, pageCount, total, from, to } = paginate(filtered, page, PER_PAGE);

  const resetToFirstPage = (fn) => (value) => {
    fn(value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <p className="text-xs font-semibold text-muted-foreground">
        {club?.name} · {stats.total} active · {stats.prospects} prospects · {stats.assigned} assigned ·{' '}
        {stats.unassigned} unassigned · {stats.archived} archived
      </p>

      <DirectoryCard
        title={t('clubPlayers.title', 'Player Directory')}
        columns={COLUMNS}
        noun="player"
        page={currentPage}
        pageCount={pageCount}
        total={total}
        from={from}
        to={to}
        onPageChange={setPage}
        toolbar={
          <DirectoryToolbar>
            <SearchInput
              value={search}
              onChange={resetToFirstPage(setSearch)}
              placeholder={t('clubPlayers.search', 'Search players...')}
              label="Search players"
            />
            <FilterSelect
              value={filterTeam}
              onChange={resetToFirstPage(setFilterTeam)}
              label="Filter by team"
              options={[
                { value: 'all', label: t('clubPlayers.allTeams', 'All Teams') },
                { value: 'unassigned', label: t('clubPlayers.unassigned', 'Unassigned') },
                ...teams.map((team) => ({ value: team.id, label: team.name })),
              ]}
            />
            <FilterSelect
              value={filterStatus}
              onChange={resetToFirstPage(setFilterStatus)}
              label="Filter by status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'prospect', label: 'Prospect' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <ToolbarButton
              icon={Plus}
              tone="primary"
              onClick={() => {
                setAddForm({ ...EMPTY_PLAYER });
                setShowAddModal(true);
              }}
            >
              Add player
            </ToolbarButton>
          </DirectoryToolbar>
        }
      >
        {slice.length === 0 ? (
          <EmptyRow colSpan={COLUMNS.length}>{t('clubPlayers.noPlayers', 'No players found.')}</EmptyRow>
        ) : (
          slice.map((player) => {
            const ageGroup =
              player.birthdate && selectedSeason ? getUSAgeGroup(player.birthdate, selectedSeason) : null;
            const isTransferring = transferringId === player.id;
            const guardian = player.guardians?.[0];

            return (
              <React.Fragment key={player.id}>
                <tr className="border-b border-border align-middle transition-colors hover:bg-foreground/[0.03]">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleEditPlayer(player)}
                      className="flex items-center gap-2 text-left"
                    >
                      {player.jerseyNumber && (
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-xs font-bold text-foreground">
                          {player.jerseyNumber}
                        </span>
                      )}
                      <span className="font-semibold text-foreground transition-colors hover:text-primary">
                        {player.firstName} {player.lastName}
                      </span>
                      {ageGroup && <Badge tone="info">{ageGroup}</Badge>}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    {player.teamName ? (
                      <span className="text-sm text-foreground">{player.teamName}</span>
                    ) : (
                      <Badge tone="warning">Unassigned</Badge>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">
                    {guardian ? (
                      <>
                        <span className="font-semibold text-foreground">{guardian.name}</span>
                        {guardian.email && <span> · {guardian.email}</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {player.status === 'prospect' ? (
                      <Badge tone="info">Prospect</Badge>
                    ) : player.status === 'archived' ? (
                      <Badge tone="secondary">Archived</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <RowAction icon={Edit} label="Edit player" onClick={() => handleEditPlayer(player)} />
                      <RowAction
                        icon={ArrowRightLeft}
                        label="Transfer team"
                        aria-expanded={isTransferring}
                        onClick={() => {
                          setTransferringId(isTransferring ? null : player.id);
                          setTransferTeamId(player.teamId || '');
                        }}
                      />
                      <RowAction
                        icon={player.status === 'active' ? Archive : RotateCcw}
                        label={player.status === 'active' ? 'Archive' : 'Restore'}
                        onClick={() => handleArchiveRestore(player)}
                      />
                    </div>
                  </td>
                </tr>

                {isTransferring && (
                  <DetailRow colSpan={COLUMNS.length}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Transfer to:</span>
                      <select
                        value={transferTeamId}
                        onChange={(e) => setTransferTeamId(e.target.value)}
                        aria-label={`Team for ${player.firstName} ${player.lastName}`}
                        className="rounded-md border border-input bg-card px-2 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"
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
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110"
                      >
                        Transfer
                      </button>
                      <button
                        onClick={() => {
                          setTransferringId(null);
                          setTransferTeamId('');
                        }}
                        aria-label="Cancel transfer"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </DetailRow>
                )}
              </React.Fragment>
            );
          })
        )}
      </DirectoryCard>

      {/* Edit Player Modal */}
      <PlayerFormModal
        show={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingPlayer(null);
        }}
        onSubmit={handleSavePlayer}
        initialData={editingPlayer}
        selectedSeason={selectedSeason}
      />

      {/* Add Player Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-lg bg-card rounded-lg shadow-md border border-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <UserPlus size={20} className="text-blue-700 dark:text-blue-400" /> Add Player
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddPlayer} className="p-5 space-y-4">
              {/* Player Type */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Player Type</label>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {[
                    { value: 'current', label: 'Current Player' },
                    { value: 'prospect', label: 'Prospect' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAddForm((f) => ({ ...f, playerType: opt.value }))}
                      className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                        addForm.playerType === opt.value
                          ? opt.value === 'prospect'
                            ? 'bg-violet-600 text-white'
                            : 'bg-blue-600 text-white'
                          : 'bg-card text-muted-foreground'
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
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">First Name *</label>
                  <input
                    required
                    type="text"
                    value={addForm.firstName}
                    onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Last Name *</label>
                  <input
                    required
                    type="text"
                    value={addForm.lastName}
                    onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* DOB + Jersey */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Birthdate</label>
                  <input
                    type="date"
                    value={addForm.birthdate}
                    onChange={(e) => setAddForm((f) => ({ ...f, birthdate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Jersey #</label>
                  <input
                    type="text"
                    value={addForm.jerseyNumber}
                    onChange={(e) => setAddForm((f) => ({ ...f, jerseyNumber: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Gender</label>
                <select
                  value={addForm.gender || ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, gender: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select —</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              {/* Team Assignment */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  {addForm.playerType === 'prospect' ? 'Interested Team (optional)' : 'Assign to Team'}
                </label>
                <select
                  value={addForm.teamId}
                  onChange={(e) => setAddForm((f) => ({ ...f, teamId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
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
              <div className="border-t border-border pt-4">
                <label className="block text-xs font-semibold text-muted-foreground mb-2">
                  Guardian / Parent (optional)
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Guardian name"
                    value={addForm.guardianName}
                    onChange={(e) => setAddForm((f) => ({ ...f, guardianName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      placeholder="Email"
                      value={addForm.guardianEmail}
                      onChange={(e) => setAddForm((f) => ({ ...f, guardianEmail: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={addForm.guardianPhone}
                      onChange={(e) => setAddForm((f) => ({ ...f, guardianPhone: formatPhoneInput(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !addForm.firstName.trim() || !addForm.lastName.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
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
