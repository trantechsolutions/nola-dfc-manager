import { supabase } from '../supabase';
import { logAuditEvent } from './auditService';

export const financeService = {
  getAllTransactions: async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select(`*, players(first_name, last_name), team_events(title)`)
      .order('date', { ascending: false });
    if (error) throw error;

    return data.map((tx) => ({
      id: tx.id,
      seasonId: tx.season_id,
      teamSeasonId: tx.team_season_id,
      playerId: tx.player_id,
      playerName: tx.players ? `${tx.players.first_name} ${tx.players.last_name}` : '',
      date: tx.date ? { seconds: Math.floor(new Date(tx.date + 'T12:00:00').getTime() / 1000) } : null,
      rawDate: tx.date,
      split: tx.split,
      category: tx.category,
      title: tx.title,
      amount: Number(tx.amount),
      notes: tx.notes,
      cleared: tx.cleared,
      distributed: tx.distributed,
      waterfallBatchId: tx.waterfall_batch_id,
      originalTxId: tx.original_tx_id,
      accountId: tx.account_id || null,
      transferFromAccountId: tx.transfer_from_account_id || null,
      transferToAccountId: tx.transfer_to_account_id || null,
      eventId: tx.event_id || null,
      eventTitle: tx.team_events?.title || null,
    }));
  },

  addTransaction: async (txData) => {
    const row = {
      season_id: txData.seasonId,
      player_id: txData.playerId || null,
      date: txData.date,
      split: txData.split || null,
      category: txData.category,
      title: txData.title,
      amount: txData.amount,
      notes: txData.notes || null,
      cleared: txData.cleared ?? false,
      distributed: txData.distributed ?? false,
      waterfall_batch_id: txData.waterfallBatchId || null,
      original_tx_id: txData.originalTxId || null,
      ...(txData.teamSeasonId ? { team_season_id: txData.teamSeasonId } : {}),
      account_id: txData.accountId || null,
      transfer_from_account_id: txData.transferFromAccountId || null,
      transfer_to_account_id: txData.transferToAccountId || null,
      event_id: txData.eventId || null,
    };
    const { data, error } = await supabase.from('transactions').insert(row).select().single();
    if (error) throw error;

    // Fire-and-forget audit log
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        logAuditEvent({
          tableName: 'transactions',
          recordId: data.id,
          action: 'insert',
          changedBy: user.id,
          newData: data,
          metadata: { season_id: txData.seasonId, team_season_id: txData.teamSeasonId || null },
        });
      }
    });

    return data;
  },

  updateTransaction: async (txId, txData) => {
    const updates = {};
    if ('title' in txData) updates.title = txData.title;
    if ('amount' in txData) updates.amount = txData.amount;
    if ('date' in txData) updates.date = txData.date;
    if ('category' in txData) updates.category = txData.category;
    if ('playerId' in txData) updates.player_id = txData.playerId || null;
    if ('cleared' in txData) updates.cleared = txData.cleared;
    if ('distributed' in txData) updates.distributed = txData.distributed;
    if ('notes' in txData) updates.notes = txData.notes;
    if ('accountId' in txData) updates.account_id = txData.accountId || null;
    if ('transferFromAccountId' in txData) updates.transfer_from_account_id = txData.transferFromAccountId || null;
    if ('transferToAccountId' in txData) updates.transfer_to_account_id = txData.transferToAccountId || null;
    if ('eventId' in txData) updates.event_id = txData.eventId || null;
    const { error } = await supabase.from('transactions').update(updates).eq('id', txId);
    if (error) throw error;

    // Fire-and-forget audit log
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        logAuditEvent({
          tableName: 'transactions',
          recordId: txId,
          action: 'update',
          changedBy: user.id,
          newData: updates,
          metadata: { updated_fields: Object.keys(updates) },
        });
      }
    });
  },

  deleteTransaction: async (txId) => {
    await supabase.from('transactions').delete().eq('original_tx_id', txId);
    const { error } = await supabase.from('transactions').delete().eq('id', txId);
    if (error) throw error;

    // Fire-and-forget audit log
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        logAuditEvent({
          tableName: 'transactions',
          recordId: txId,
          action: 'delete',
          changedBy: user.id,
          oldData: { id: txId },
        });
      }
    });
  },

  deleteBatch: async (field, value) => {
    const dbField =
      field === 'waterfallBatchId' ? 'waterfall_batch_id' : field === 'originalTxId' ? 'original_tx_id' : field;
    const { error } = await supabase.from('transactions').delete().eq(dbField, value);
    if (error) throw error;
  },

  bulkAddTransactions: async (txArray, seasonId, teamSeasonId = null) => {
    if (!txArray || txArray.length === 0) return [];

    const rows = txArray.map((tx) => ({
      season_id: tx.seasonId || seasonId,
      player_id: tx.playerId || null,
      date: tx.date,
      category: tx.category,
      title: tx.title,
      amount: tx.amount,
      notes: tx.notes || null,
      cleared: tx.cleared ?? false,
      distributed: false,
      account_id: tx.accountId || null,
      transfer_from_account_id: tx.transferFromAccountId || null,
      transfer_to_account_id: tx.transferToAccountId || null,
      ...(teamSeasonId ? { team_season_id: teamSeasonId } : {}),
    }));

    const { data, error } = await supabase.from('transactions').insert(rows).select();
    if (error) throw error;
    return data;
  },

  getTransactionsByTeamSeason: async (teamSeasonId) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, players(first_name, last_name), team_events(title)')
      .eq('team_season_id', teamSeasonId)
      .order('date', { ascending: false });
    if (error) throw error;
    return data.map((tx) => ({
      id: tx.id,
      seasonId: tx.season_id,
      teamSeasonId: tx.team_season_id,
      playerId: tx.player_id,
      playerName: tx.players ? `${tx.players.first_name} ${tx.players.last_name}` : null,
      date: { seconds: Math.floor(new Date(tx.date).getTime() / 1000) },
      rawDate: tx.date,
      split: tx.split,
      category: tx.category,
      title: tx.title,
      amount: Number(tx.amount),
      notes: tx.notes,
      cleared: tx.cleared,
      distributed: tx.distributed,
      waterfallBatchId: tx.waterfall_batch_id,
      originalTxId: tx.original_tx_id,
      accountId: tx.account_id || null,
      transferFromAccountId: tx.transfer_from_account_id || null,
      transferToAccountId: tx.transfer_to_account_id || null,
      eventId: tx.event_id || null,
      eventTitle: tx.team_events?.title || null,
    }));
  },

  getAllTransactionsForTeam: async (teamId) => {
    // Get all team_season IDs for this team
    const { data: tsData, error: tsErr } = await supabase
      .from('team_seasons')
      .select('id, season_id')
      .eq('team_id', teamId);
    if (tsErr) throw tsErr;
    if (!tsData || tsData.length === 0) return [];

    const tsIds = tsData.map((ts) => ts.id);
    const tsMap = Object.fromEntries(tsData.map((ts) => [ts.id, ts.season_id]));

    // Fetch transactions linked to any of this team's seasons
    const { data, error } = await supabase.from('transactions').select('*').in('team_season_id', tsIds);
    if (error) throw error;
    return data.map((tx) => ({
      category: tx.category,
      amount: Number(tx.amount),
      cleared: tx.cleared,
      seasonId: tsMap[tx.team_season_id] || tx.season_id,
    }));
  },

  getPlayerFinancials: async (seasonId, teamSeasonId = null) => {
    let query = supabase.from('player_financials').select('*').eq('season_id', seasonId);

    // When we know the team_season, include that team + any legacy NULL records
    if (teamSeasonId) {
      query = query.or(`team_season_id.eq.${teamSeasonId},team_season_id.is.null`);
    }
    // When teamSeasonId is null (parent view), we get ALL players for the season.
    // That's fine — we filter by guardian email on the frontend.

    const { data, error } = await query;
    if (error) throw error;

    // Look up finalization from team_seasons for each unique team_season_id in results
    const tsIds = [...new Set((data || []).map((r) => r.team_season_id).filter(Boolean))];
    let finalizationMap = {};
    if (tsIds.length > 0) {
      const { data: tsData, error: tsErr } = await supabase
        .from('team_seasons')
        .select('id, is_finalized')
        .in('id', tsIds);
      if (!tsErr && tsData) {
        tsData.forEach((ts) => {
          finalizationMap[ts.id] = ts.is_finalized;
        });
      }
    }

    // Build the map keyed by player_id
    const map = {};
    (data || []).forEach((row) => {
      map[row.player_id] = {
        baseFee: Number(row.base_fee || 0),
        totalPaid: Number(row.total_paid || 0),
        fundraising: Number(row.fundraising || 0),
        sponsorships: Number(row.sponsorships || 0),
        credits: Number(row.credits || 0),
        remainingBalance: Number(row.remaining_balance || 0),
        isWaived: row.fee_waived || false,
        isFinalized: row.team_season_id ? finalizationMap[row.team_season_id] || false : false,
        teamSeasonId: row.team_season_id || null,
      };
    });
    return map;
  },
};
