export default {
  clubDash: {
    overview: 'Overview',
    calendar: 'Calendar',
    totalPlayers: 'Total Players',
    complianceRate: 'Compliance Rate',
    documents: 'Documents',
    staffMembers: 'Staff Members',
    teams: 'Teams',
  },

  clubTeams: {
    title: 'Teams',
    addTeam: 'Add Team',
    nameUpdated: 'Team name updated.',
    nameUpdateFailed: 'Failed to update name.',
    deleteConfirm:
      'Delete "{{name}}"? This removes the team and all its season data, roster assignments, and transactions. This cannot be undone.',
    teamArchived: '"{{name}}" archived.',
    teamCreated: 'Team "{{name}}" created.',
    createFailed: 'Failed to create team.',
    roleAssigned: 'Role assigned.',
    assignFailed: 'Assignment failed.',
    removeRoleConfirm: 'Remove this role assignment?',
    roleRemoved: 'Role removed.',
  },

  toast: {
    categoryUpdated: 'Category updated',
    categoryCreated: 'Category created',
    categoryDeleted: 'Category deleted',
    playerUpdated: 'Player Updated',
    playerAdded: 'Player Added',
    playerArchived: 'Player Archived',
    txUpdated: 'Transaction Updated',
    txAdded: 'Transaction Added',
    txDeleted: 'Transaction deleted',
    fundsDistributed: 'Funds Distributed!',
    distributionReverted: 'Distribution Reverted.',
    importSuccess: '{{n}} transactions imported!',
    importFailed: 'Import failed',
    syncedEvents: 'Synced {{n}} events to database.',
    deleteCategoryConfirm:
      'Delete this custom category? Existing transactions will keep their category code but the label may not display correctly.',
    archivePlayerConfirm: 'Archive this player?',
    deleteTxConfirm: 'Delete this transaction?',
  },

  confirm: {
    title: 'Confirm Action',
  },
};
