import { supabase } from '../supabase';

const rowToAccount = (a) => ({
  id: a.id,
  teamId: a.team_id,
  name: a.name,
  handle: a.handle || '',
  holding: a.holding,
  isActive: a.is_active,
  // Published to parents in ParentView's "How to Pay" panel. Defaults closed:
  // most accounts are internal ledger buckets, so publishing is opt-in.
  isPublic: a.is_public ?? false,
  sortOrder: a.sort_order || 0,
  createdAt: a.created_at,
});

export const accountService = {
  getAccountsForTeam: async (teamId) => {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('team_id', teamId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToAccount);
  },

  addAccount: async (accountData) => {
    const row = {
      team_id: accountData.teamId,
      name: accountData.name,
      handle: accountData.handle ?? '',
      holding: accountData.holding,
      is_active: accountData.isActive ?? true,
      is_public: accountData.isPublic ?? false,
      sort_order: accountData.sortOrder ?? 0,
    };
    const { data, error } = await supabase.from('accounts').insert(row).select().single();
    if (error) throw error;
    return rowToAccount(data);
  },

  updateAccount: async (accountId, accountData) => {
    const updates = { updated_at: new Date().toISOString() };
    if ('name' in accountData) updates.name = accountData.name;
    if ('handle' in accountData) updates.handle = accountData.handle;
    if ('holding' in accountData) updates.holding = accountData.holding;
    if ('isActive' in accountData) updates.is_active = accountData.isActive;
    if ('isPublic' in accountData) updates.is_public = accountData.isPublic;
    if ('sortOrder' in accountData) updates.sort_order = accountData.sortOrder;
    const { error } = await supabase.from('accounts').update(updates).eq('id', accountId);
    if (error) throw error;
  },

  deleteAccount: async (accountId) => {
    const { error } = await supabase.from('accounts').delete().eq('id', accountId);
    if (error) throw error;
  },
};
