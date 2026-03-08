// src/services/supabaseService.js
import { supabase } from '../supabase';

export const supabaseService = {

  // ─────────────────────────────────────────
  // PLAYERS (reshapes into old Firestore format)
  // ─────────────────────────────────────────

  getAllPlayers: async () => {
    // Fetch players with their guardians and season enrollments in one go
    const { data: players, error: pErr } = await supabase
      .from('players')
      .select(`
        *,
        guardians (*),
        player_seasons (*)
      `)
      .order('last_name');

    if (pErr) throw pErr;

    // Reshape into the format components expect:
    // { id, firstName, lastName, ..., guardians: [...], seasonProfiles: { "2025-2026": { baseFee, feeWaived, status } } }
    return players.map(p => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
      status: p.status,
      medicalRelease: p.medical_release,
      reePlayerWaiver: p.reeplayer_waiver,
      guardians: (p.guardians || []).map(g => ({
        id: g.id,
        name: g.name,
        email: g.email,
        phone: g.phone
      })),
      seasonProfiles: (p.player_seasons || []).reduce((acc, ps) => {
        acc[ps.season_id] = {
          baseFee: Number(ps.base_fee),
          feeWaived: ps.fee_waived,
          status: ps.status
        };
        return acc;
      }, {})
    }));
  },

  addPlayer: async (playerData) => {
    // 1. Insert the player
    const { data: player, error: pErr } = await supabase
      .from('players')
      .insert({
        first_name: playerData.firstName,
        last_name: playerData.lastName,
        jersey_number: playerData.jerseyNumber || null,
        status: playerData.status || 'active',
        medical_release: playerData.medicalRelease || false,
        reeplayer_waiver: playerData.reePlayerWaiver || false
      })
      .select()
      .single();

    if (pErr) throw pErr;

    // 2. Insert guardians
    if (playerData.guardians?.length > 0) {
      const guardianRows = playerData.guardians
        .filter(g => g.name)
        .map(g => ({
          player_id: player.id,
          name: g.name,
          email: g.email || null,
          phone: g.phone || null
        }));
      if (guardianRows.length > 0) {
        const { error: gErr } = await supabase.from('guardians').insert(guardianRows);
        if (gErr) throw gErr;
      }
    }

    // 3. Insert season profiles
    if (playerData.seasonProfiles) {
      const seasonRows = Object.entries(playerData.seasonProfiles).map(([seasonId, profile]) => ({
        player_id: player.id,
        season_id: seasonId,
        base_fee: profile.baseFee ?? 750,
        fee_waived: profile.feeWaived ?? false,
        status: profile.status || 'active'
      }));
      if (seasonRows.length > 0) {
        const { error: sErr } = await supabase.from('player_seasons').insert(seasonRows);
        if (sErr) throw sErr;
      }
    }

    return player;
  },

  updatePlayer: async (playerId, playerData) => {
    // 1. Update core player fields
    const { error: pErr } = await supabase
      .from('players')
      .update({
        first_name: playerData.firstName,
        last_name: playerData.lastName,
        jersey_number: playerData.jerseyNumber || null,
        status: playerData.status || 'active',
      })
      .eq('id', playerId);

    if (pErr) throw pErr;

    // 2. Replace guardians (delete all, re-insert)
    if (playerData.guardians) {
      await supabase.from('guardians').delete().eq('player_id', playerId);
      const guardianRows = playerData.guardians
        .filter(g => g.name)
        .map(g => ({
          player_id: playerId,
          name: g.name,
          email: g.email || null,
          phone: g.phone || null
        }));
      if (guardianRows.length > 0) {
        const { error: gErr } = await supabase.from('guardians').insert(guardianRows);
        if (gErr) throw gErr;
      }
    }

    // 3. Upsert season profiles
    if (playerData.seasonProfiles) {
      for (const [seasonId, profile] of Object.entries(playerData.seasonProfiles)) {
        const { error: sErr } = await supabase
          .from('player_seasons')
          .upsert({
            player_id: playerId,
            season_id: seasonId,
            base_fee: profile.baseFee ?? 750,
            fee_waived: profile.feeWaived ?? false,
            status: profile.status || 'active'
          }, { onConflict: 'player_id,season_id' });
        if (sErr) throw sErr;
      }
    }
  },

  updatePlayerField: async (playerId, field, value) => {
    // Map camelCase component fields to snake_case DB columns
    const fieldMap = {
      medicalRelease: 'medical_release',
      reePlayerWaiver: 'reeplayer_waiver',
      status: 'status'
    };
    const dbField = fieldMap[field] || field;
    const { error } = await supabase
      .from('players')
      .update({ [dbField]: value })
      .eq('id', playerId);
    if (error) throw error;
  },

  updateSeasonProfile: async (playerId, seasonId, updates) => {
    // Updates to the player_seasons junction table
    const dbUpdates = {};
    if ('feeWaived' in updates) dbUpdates.fee_waived = updates.feeWaived;
    if ('baseFee' in updates) dbUpdates.base_fee = updates.baseFee;
    if ('status' in updates) dbUpdates.status = updates.status;

    const { error } = await supabase
      .from('player_seasons')
      .update(dbUpdates)
      .eq('player_id', playerId)
      .eq('season_id', seasonId);
    if (error) throw error;
  },

  addPlayerToSeason: async (playerId, seasonId, profile) => {
    const { error } = await supabase
      .from('player_seasons')
      .upsert({
        player_id: playerId,
        season_id: seasonId,
        base_fee: profile.baseFee ?? 750,
        fee_waived: profile.feeWaived ?? false,
        status: profile.status || 'active'
      }, { onConflict: 'player_id,season_id' });
    if (error) throw error;
  },

  removePlayerFromSeason: async (playerId, seasonId) => {
    const { error } = await supabase
      .from('player_seasons')
      .delete()
      .eq('player_id', playerId)
      .eq('season_id', seasonId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // TRANSACTIONS (reshapes with player name via JOIN)
  // ─────────────────────────────────────────

  getAllTransactions: async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        players (first_name, last_name)
      `)
      .order('date', { ascending: false });

    if (error) throw error;

    // Reshape: add playerName, convert date to Firestore-like { seconds } format
    // so existing components don't need to change their date handling
    return data.map(tx => ({
      id: tx.id,
      seasonId: tx.season_id,
      playerId: tx.player_id,
      playerName: tx.players ? `${tx.players.first_name} ${tx.players.last_name}` : '',
      date: tx.date ? { seconds: Math.floor(new Date(tx.date + 'T12:00:00').getTime() / 1000) } : null,
      rawDate: tx.date,
      split: tx.split,
      type: tx.type,
      category: tx.category,
      title: tx.title,
      amount: Number(tx.amount),
      notes: tx.notes,
      cleared: tx.cleared,
      distributed: tx.distributed,
      waterfallBatchId: tx.waterfall_batch_id,
      originalTxId: tx.original_tx_id,
    }));
  },

  addTransaction: async (txData) => {
    const row = {
      season_id: txData.seasonId,
      player_id: txData.playerId || null,
      date: txData.date, // expects 'YYYY-MM-DD' string
      split: txData.split || null,
      type: txData.type || null,
      category: txData.category,
      title: txData.title,
      amount: txData.amount,
      notes: txData.notes || null,
      cleared: txData.cleared ?? false,
      distributed: txData.distributed ?? false,
      waterfall_batch_id: txData.waterfallBatchId || null,
      original_tx_id: txData.originalTxId || null,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  updateTransaction: async (txId, txData) => {
    const updates = {};
    if ('title' in txData) updates.title = txData.title;
    if ('amount' in txData) updates.amount = txData.amount;
    if ('date' in txData) updates.date = txData.date;
    if ('category' in txData) updates.category = txData.category;
    if ('type' in txData) updates.type = txData.type;
    if ('playerId' in txData) updates.player_id = txData.playerId || null;
    if ('cleared' in txData) updates.cleared = txData.cleared;
    if ('distributed' in txData) updates.distributed = txData.distributed;
    if ('notes' in txData) updates.notes = txData.notes;

    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', txId);
    if (error) throw error;
  },

  deleteTransaction: async (txId) => {
    // Also delete any waterfall children that reference this as originalTxId
    await supabase.from('transactions').delete().eq('original_tx_id', txId);
    const { error } = await supabase.from('transactions').delete().eq('id', txId);
    if (error) throw error;
  },

  deleteBatch: async (field, value) => {
    const dbField = field === 'waterfallBatchId' ? 'waterfall_batch_id'
      : field === 'originalTxId' ? 'original_tx_id' : field;
    const { error } = await supabase.from('transactions').delete().eq(dbField, value);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // SEASONS
  // ─────────────────────────────────────────

  getAllSeasons: async () => {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .order('id', { ascending: false });
    if (error) throw error;
    return data.map(s => ({
      id: s.id,
      name: s.name,
      isFinalized: s.is_finalized,
      expectedRosterSize: s.expected_roster_size,
      bufferPercent: s.buffer_percent,
      calculatedBaseFee: s.calculated_base_fee ? Number(s.calculated_base_fee) : null,
      totalProjectedExpenses: s.total_projected_expenses ? Number(s.total_projected_expenses) : null,
      totalProjectedIncome: s.total_projected_income ? Number(s.total_projected_income) : null,
    }));
  },

  saveSeason: async (seasonId, data) => {
    const row = {
      id: seasonId,
      name: data.name || seasonId,
      is_finalized: data.isFinalized ?? false,
      expected_roster_size: data.expectedRosterSize ?? null,
      buffer_percent: data.bufferPercent ?? 5,
      calculated_base_fee: data.calculatedBaseFee ?? null,
      total_projected_expenses: data.totalProjectedExpenses ?? null,
      total_projected_income: data.totalProjectedIncome ?? null,
    };

    const { error } = await supabase
      .from('seasons')
      .upsert(row, { onConflict: 'id' });
    if (error) throw error;
  },

  deleteSeason: async (seasonId) => {
    // Delete transactions for this season first (FK is not CASCADE)
    await supabase.from('transactions').delete().eq('season_id', seasonId);
    // budget_items and player_seasons will CASCADE from seasons delete
    const { error } = await supabase.from('seasons').delete().eq('id', seasonId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // BUDGET ITEMS
  // ─────────────────────────────────────────

  getBudgetItems: async (seasonId) => {
    const { data, error } = await supabase
      .from('budget_items')
      .select('*')
      .eq('season_id', seasonId);
    if (error) throw error;
    return data.map(item => ({
      id: item.id,
      category: item.category,
      label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
    }));
  },

  saveBudgetItems: async (seasonId, items) => {
    // Delete existing items for the season, then insert fresh
    await supabase.from('budget_items').delete().eq('season_id', seasonId);

    if (items.length > 0) {
      const rows = items.map(item => ({
        season_id: seasonId,
        category: item.category,
        label: item.label,
        income: item.income || 0,
        expenses_fall: item.expensesFall || 0,
        expenses_spring: item.expensesSpring || 0,
      }));
      const { error } = await supabase.from('budget_items').insert(rows);
      if (error) throw error;
    }
  },

  // ─────────────────────────────────────────
  // BLACKOUTS
  // ─────────────────────────────────────────

  getAllBlackouts: async () => {
    const { data, error } = await supabase.from('blackouts').select('*');
    if (error) throw error;
    return data.map(b => b.date_str);
  },

  saveBlackout: async (dateStr) => {
    const { error } = await supabase
      .from('blackouts')
      .upsert({ date_str: dateStr, is_blackout: true }, { onConflict: 'date_str' });
    if (error) throw error;
  },

  deleteBlackout: async (dateStr) => {
    const { error } = await supabase.from('blackouts').delete().eq('date_str', dateStr);
    if (error) throw error;
  },
};