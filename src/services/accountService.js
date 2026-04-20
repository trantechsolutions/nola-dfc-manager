import { supabase } from '../supabase';

const rowToAccount = (a) => ({
  id: a.id,
  teamId: a.team_id,
  name: a.name,
  holding: a.holding,
  isActive: a.is_active,
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
      holding: accountData.holding,
      is_active: accountData.isActive ?? true,
      sort_order: accountData.sortOrder ?? 0,
    };
    const { data, error } = await supabase.from('accounts').insert(row).select().single();
    if (error) throw error;
    return rowToAccount(data);
  },

  updateAccount: async (accountId, accountData) => {
    const updates = { updated_at: new Date().toISOString() };
    if ('name' in accountData) updates.name = accountData.name;
    if ('holding' in accountData) updates.holding = accountData.holding;
    if ('isActive' in accountData) updates.is_active = accountData.isActive;
    if ('sortOrder' in accountData) updates.sort_order = accountData.sortOrder;
    const { error } = await supabase.from('accounts').update(updates).eq('id', accountId);
    if (error) throw error;
  },

  deleteAccount: async (accountId) => {
    const { error } = await supabase.from('accounts').delete().eq('id', accountId);
    if (error) throw error;
  },
};
