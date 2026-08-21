import { PERMISSIONS } from '../utils/roles';
import { useData } from '../context/DataContext';
import { PANELS } from '../utils/panelRoute';

/**
 * Builds what PeopleView hands to its two tabs — the roster and the document
 * manager. Same reasoning as useFinanceViewProps: the bags move out of the
 * route table, and anything already in context is read here rather than passed
 * down through AppRoutes a second time.
 *
 * Both tabs are gated on TEAM_VIEW_ROSTER, so `can` decides whether each bag
 * exists at all — PeopleView renders a tab only when its props are non-null.
 */
export function usePeopleViewProps({
  can,
  selectedSeason,
  selectedTeam,
  club,
  currentTeamSeason,
  seasons,
  user,
  openPanel,
  onViewAsParent,
  showToast,
  showConfirm,
}) {
  const { players, seasonalPlayers, fetchData, compliance, checklist, refreshChecklist } = useData();

  const canViewRoster = can(PERMISSIONS.TEAM_VIEW_ROSTER);

  const rosterProps = canViewRoster
    ? {
        players,
        seasons,
        selectedSeason,
        selectedTeam,
        club,
        currentTeamSeason,
        showToast,
        showConfirm,
        can,
        PERMISSIONS,
        onEditPlayer: (player) => openPanel(PANELS.PLAYER_FORM, { id: player.id }),
        onAddPlayer: () => openPanel(PANELS.PLAYER_FORM),
        onViewPlayer: (player) => openPanel(PANELS.PLAYER, { id: player.id }),
        onViewAsParent,
        refreshData: fetchData,
        compliance,
        checklist,
        onComplianceChanged: refreshChecklist,
        user,
      }
    : null;

  const documentsProps = canViewRoster
    ? {
        players: seasonalPlayers,
        selectedSeason,
        club,
        selectedTeam,
        showToast,
        showConfirm,
        can,
        PERMISSIONS,
        onPlayerUpdate: fetchData,
        compliance,
      }
    : null;

  return { visibleTabs: ['roster', 'documents'], rosterProps, documentsProps };
}
