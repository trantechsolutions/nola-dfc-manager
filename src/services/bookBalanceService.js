import { supabase } from '../supabase';

const rowToBalance = (r) => ({
  id: r.id,
  accountId: r.account_id,
  teamId: r.team_id,
  monthKey: r.month_end_date, // 'YYYY-MM-01'
  statedBalance: Number(r.stated_balance),
  ledgerBalance: r.ledger_balance != null ? Number(r.ledger_balance) : null,
  delta: r.delta != null ? Number(r.delta) : null,
  isLocked: r.is_locked,
  notes: r.notes || '',
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const bookBalanceService = {
  /** Fetch all account_balances rows for a team + month (YYYY-MM-01 string). */
  getForTeamMonth: async (teamId, monthKey) => {
    const { data, error } = await supabase
      .from('account_balances')
      .select('*')
      .eq('team_id', teamId)
      .eq('month_end_date', monthKey);
    if (error) throw error;
    return (data || []).map(rowToBalance);
  },

  /** Insert or update a single account balance record. */
  upsertBalance: async ({ accountId, teamId, monthKey, statedBalance, notes }) => {
    const { data: user } = await supabase.auth.getUser();
    const row = {
      account_id: accountId,
      team_id: teamId,
      month_end_date: monthKey,
      stated_balance: statedBalance,
      notes: notes ?? '',
      created_by: user?.user?.id ?? null,
    };
    const { data, error } = await supabase
      .from('account_balances')
      .upsert(row, { onConflict: 'account_id,month_end_date' })
      .select()
      .single();
    if (error) throw error;
    return rowToBalance(data);
  },

  /**
   * Lock a month: writes ledger_balance + delta snapshot onto each row,
   * then sets is_locked = true. Accepts an array of { id, ledgerBalance, statedBalance }.
   */
  lockMonth: async (balanceUpdates) => {
    if (!balanceUpdates.length) return;
    const updates = balanceUpdates.map(({ id, ledgerBalance, statedBalance }) =>
      supabase
        .from('account_balances')
        .update({
          ledger_balance: ledgerBalance,
          delta: statedBalance - ledgerBalance,
          is_locked: true,
        })
        .eq('id', id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  },

  /** Unlock a month (super-admin only — RLS enforces this). */
  unlockMonth: async (teamId, monthKey) => {
    const { error } = await supabase
      .from('account_balances')
      .update({ is_locked: false, ledger_balance: null, delta: null })
      .eq('team_id', teamId)
      .eq('month_end_date', monthKey);
    if (error) throw error;
  },
};
