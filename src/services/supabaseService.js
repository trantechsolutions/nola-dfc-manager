// src/services/supabaseService.js
// ──────────────────────────────────────────────────────────────────────
// Cleaned against supabase_schema_report.md (2026-03-09)
//
// KEY FIXES APPLIED:
//   • seasons table: only id + name (removed ghost columns is_finalized,
//     expected_roster_size, buffer_percent, calculated_base_fee, etc.)
//   • player_seasons: NO base_fee column (fee computed by player_financials
//     view from team_seasons data). Removed all base_fee refs.
//   • budget_items: now threads team_season_id through get/save
//   • blackouts: now includes team_id
//   • teams: now returns color_secondary
//   • saveBudgetItems: scoped by team_season_id instead of season_id alone
// ──────────────────────────────────────────────────────────────────────
import { supabase } from '../supabase';

export const supabaseService = {
  // ─────────────────────────────────────────
  // PLAYERS (reshapes into component-friendly format)
  // ─────────────────────────────────────────

  getAllPlayers: async () => {
    const { data: players, error: pErr } = await supabase
      .from('players')
      .select(`*, guardians(*), player_seasons(*)`)
      .order('last_name');
    if (pErr) throw pErr;

    return players.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
      birthdate: p.birthdate ? p.birthdate.slice(0, 10) : null,
      status: p.status,
      medicalRelease: p.medical_release,
      reePlayerWaiver: p.reeplayer_waiver,
      clubId: p.club_id,
      teamId: p.team_id,
      guardians: (p.guardians || []).map((g) => ({
        id: g.id,
        name: g.name,
        email: g.email,
        phone: g.phone,
      })),
      // player_seasons has NO base_fee — fee comes from team_seasons via the view
      seasonProfiles: (p.player_seasons || []).reduce((acc, ps) => {
        acc[ps.season_id] = {
          feeWaived: ps.fee_waived,
          status: ps.status,
          teamSeasonId: ps.team_season_id,
          fundraiserBuyIn: ps.fundraiser_buyin ?? false,
        };
        return acc;
      }, {}),
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
        birthdate: playerData.birthdate || null,
        gender: playerData.gender || null,
        status: playerData.status || 'active',
        medical_release: playerData.medicalRelease || false,
        reeplayer_waiver: playerData.reePlayerWaiver || false,
        ...(playerData.clubId ? { club_id: playerData.clubId } : {}),
        ...(playerData.teamId ? { team_id: playerData.teamId } : {}),
      })
      .select()
      .single();
    if (pErr) throw pErr;

    // 2. Insert guardians
    if (playerData.guardians?.length > 0) {
      const guardianRows = playerData.guardians
        .filter((g) => g.name)
        .map((g) => ({ player_id: player.id, name: g.name, email: g.email || null, phone: g.phone || null }));
      if (guardianRows.length > 0) {
        const { error: gErr } = await supabase.from('guardians').insert(guardianRows);
        if (gErr) throw gErr;
      }
    }

    // 3. Insert season enrollment (no base_fee — computed by view)
    if (playerData.seasonProfiles) {
      const seasonRows = Object.entries(playerData.seasonProfiles).map(([seasonId, profile]) => ({
        player_id: player.id,
        season_id: seasonId,
        fee_waived: profile.feeWaived ?? false,
        status: profile.status || 'active',
        ...(profile.teamSeasonId ? { team_season_id: profile.teamSeasonId } : {}),
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
    const row = {
      first_name: playerData.firstName,
      last_name: playerData.lastName,
      jersey_number: playerData.jerseyNumber || null,
      birthdate: playerData.birthdate || null,
      status: playerData.status || 'active',
    };
    if ('gender' in playerData) row.gender = playerData.gender || null;
    const { error: pErr } = await supabase.from('players').update(row).eq('id', playerId);
    if (pErr) throw pErr;

    // 2. Replace guardians (delete all, re-insert)
    if (playerData.guardians) {
      await supabase.from('guardians').delete().eq('player_id', playerId);
      const guardianRows = playerData.guardians
        .filter((g) => g.name)
        .map((g) => ({ player_id: playerId, name: g.name, email: g.email || null, phone: g.phone || null }));
      if (guardianRows.length > 0) {
        const { error: gErr } = await supabase.from('guardians').insert(guardianRows);
        if (gErr) throw gErr;
      }
    }

    // 3. Upsert season profiles (no base_fee)
    if (playerData.seasonProfiles) {
      for (const [seasonId, profile] of Object.entries(playerData.seasonProfiles)) {
        const { error: sErr } = await supabase.from('player_seasons').upsert(
          {
            player_id: playerId,
            season_id: seasonId,
            fee_waived: profile.feeWaived ?? false,
            status: profile.status || 'active',
            ...(profile.teamSeasonId ? { team_season_id: profile.teamSeasonId } : {}),
          },
          { onConflict: 'player_id,season_id' },
        );
        if (sErr) throw sErr;
      }
    }
  },

  updatePlayerField: async (playerId, field, value) => {
    const fieldMap = {
      medicalRelease: 'medical_release',
      reePlayerWaiver: 'reeplayer_waiver',
      status: 'status',
    };
    const dbField = fieldMap[field] || field;
    const { error } = await supabase
      .from('players')
      .update({ [dbField]: value })
      .eq('id', playerId);
    if (error) throw error;
  },

  updateSeasonProfile: async (playerId, seasonId, updates) => {
    const dbUpdates = {};
    if ('feeWaived' in updates) dbUpdates.fee_waived = updates.feeWaived;
    if ('status' in updates) dbUpdates.status = updates.status;
    if ('fundraiserBuyIn' in updates) dbUpdates.fundraiser_buyin = updates.fundraiserBuyIn;
    // NOTE: base_fee does not exist on player_seasons — fee is computed from team_seasons

    const { error } = await supabase
      .from('player_seasons')
      .update(dbUpdates)
      .eq('player_id', playerId)
      .eq('season_id', seasonId);
    if (error) throw error;
  },

  addPlayerToSeason: async (playerId, seasonId, profile, teamSeasonId = null) => {
    const row = {
      player_id: playerId,
      season_id: seasonId,
      fee_waived: profile.feeWaived ?? false,
      status: profile.status || 'active',
      ...(teamSeasonId ? { team_season_id: teamSeasonId } : {}),
    };
    const { error } = await supabase.from('player_seasons').upsert(row, { onConflict: 'player_id,season_id' });
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
  // TRANSACTIONS
  // ─────────────────────────────────────────

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
      type: tx.type,
      category: tx.category,
      title: tx.title,
      amount: Number(tx.amount),
      notes: tx.notes,
      cleared: tx.cleared,
      distributed: tx.distributed,
      waterfallBatchId: tx.waterfall_batch_id,
      originalTxId: tx.original_tx_id,
      transferFrom: tx.transfer_from || '',
      transferTo: tx.transfer_to || '',
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
      type: txData.type || null,
      category: txData.category,
      title: txData.title,
      amount: txData.amount,
      notes: txData.notes || null,
      cleared: txData.cleared ?? false,
      distributed: txData.distributed ?? false,
      waterfall_batch_id: txData.waterfallBatchId || null,
      original_tx_id: txData.originalTxId || null,
      ...(txData.teamSeasonId ? { team_season_id: txData.teamSeasonId } : {}),
      transfer_from: txData.transferFrom || null,
      transfer_to: txData.transferTo || null,
      event_id: txData.eventId || null,
    };
    const { data, error } = await supabase.from('transactions').insert(row).select().single();
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
    if ('transferFrom' in txData) updates.transfer_from = txData.transferFrom || null;
    if ('transferTo' in txData) updates.transfer_to = txData.transferTo || null;
    if ('eventId' in txData) updates.event_id = txData.eventId || null;
    const { error } = await supabase.from('transactions').update(updates).eq('id', txId);
    if (error) throw error;
  },

  deleteTransaction: async (txId) => {
    await supabase.from('transactions').delete().eq('original_tx_id', txId);
    const { error } = await supabase.from('transactions').delete().eq('id', txId);
    if (error) throw error;
  },

  deleteBatch: async (field, value) => {
    const dbField =
      field === 'waterfallBatchId' ? 'waterfall_batch_id' : field === 'originalTxId' ? 'original_tx_id' : field;
    const { error } = await supabase.from('transactions').delete().eq(dbField, value);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // TEAM EVENTS (imported from iCal)
  // ─────────────────────────────────────────

  syncTeamEvents: async (teamId, events) => {
    if (!teamId || !events.length) return 0;

    // Fetch existing rows so we can preserve admin-locked types
    const { data: existing } = await supabase
      .from('team_events')
      .select('uid, event_type, type_locked')
      .eq('team_id', teamId);
    const lockedMap = {};
    (existing || []).forEach((e) => {
      if (e.type_locked) lockedMap[e.uid] = e.event_type;
    });

    const rows = events.map((e) => ({
      team_id: teamId,
      uid: e.id,
      title: e.title,
      description: e.description || null,
      location: e.location || null,
      event_date: new Date(e.timestamp * 1000).toISOString(),
      event_type: lockedMap[e.id] ?? (e.eventType || 'event'),
      type_locked: e.id in lockedMap,
      is_cancelled: e.isCancelled || false,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('team_events').upsert(rows, { onConflict: 'team_id,uid' });
    if (error) throw error;
    return rows.length;
  },

  updateTeamEventType: async (id, newType) => {
    const { error } = await supabase
      .from('team_events')
      .update({ event_type: newType, type_locked: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  getTeamEvents: async (teamId) => {
    if (!teamId) return [];
    const { data, error } = await supabase
      .from('team_events')
      .select('*')
      .eq('team_id', teamId)
      .order('event_date', { ascending: false });
    if (error) throw error;
    return data.map((e) => ({
      id: e.id,
      uid: e.uid,
      teamId: e.team_id,
      title: e.title,
      description: e.description,
      location: e.location,
      eventDate: e.event_date,
      eventType: e.event_type,
      typeLocked: e.type_locked || false,
      isCancelled: e.is_cancelled,
    }));
  },

  // ── CUSTOM CATEGORIES ──

  getCustomCategories: async (clubId) => {
    const { data, error } = await supabase
      .from('custom_categories')
      .select('*')
      .eq('club_id', clubId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map((c) => ({
      id: c.id,
      clubId: c.club_id,
      code: c.code,
      label: c.label,
      description: c.description || '',
      color: c.color,
      flow: c.flow || 'expense',
      sortOrder: c.sort_order || 0,
    }));
  },

  addCustomCategory: async (catData) => {
    const row = {
      club_id: catData.clubId,
      code: catData.code,
      label: catData.label,
      description: catData.description || null,
      color: catData.color,
      flow: catData.flow || 'expense',
      sort_order: catData.sortOrder || 0,
    };
    const { data, error } = await supabase.from('custom_categories').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  updateCustomCategory: async (catId, catData) => {
    const updates = {};
    if ('label' in catData) updates.label = catData.label;
    if ('description' in catData) updates.description = catData.description || null;
    if ('color' in catData) updates.color = catData.color;
    if ('flow' in catData) updates.flow = catData.flow;
    if ('sortOrder' in catData) updates.sort_order = catData.sortOrder;
    const { error } = await supabase.from('custom_categories').update(updates).eq('id', catId);
    if (error) throw error;
  },

  deleteCustomCategory: async (catId) => {
    const { error } = await supabase.from('custom_categories').delete().eq('id', catId);
    if (error) throw error;
  },

  // ── BULK TRANSACTIONS ──

  bulkAddTransactions: async (txArray, seasonId, teamSeasonId = null) => {
    if (!txArray || txArray.length === 0) return [];

    const rows = txArray.map((tx) => ({
      season_id: tx.seasonId || seasonId,
      player_id: tx.playerId || null,
      date: tx.date,
      type: tx.type || null,
      category: tx.category,
      title: tx.title,
      amount: tx.amount,
      notes: tx.notes || null,
      cleared: tx.cleared ?? false,
      distributed: false,
      transfer_from: tx.transferFrom || null,
      transfer_to: tx.transferTo || null,
      ...(teamSeasonId ? { team_season_id: teamSeasonId } : {}),
    }));

    const { data, error } = await supabase.from('transactions').insert(rows).select();
    if (error) throw error;
    return data;
  },

  // ─────────────────────────────────────────
  // SEASONS (only id + name per schema)
  // ─────────────────────────────────────────

  getAllSeasons: async () => {
    const { data, error } = await supabase.from('seasons').select('*').order('id', { ascending: false });
    if (error) throw error;
    return data.map((s) => ({ id: s.id, name: s.name }));
  },

  saveSeason: async (seasonId, data) => {
    const row = {
      id: seasonId,
      name: data.name || seasonId,
    };
    const { error } = await supabase.from('seasons').upsert(row, { onConflict: 'id' });
    if (error) throw error;
  },

  deleteSeason: async (seasonId) => {
    // Delete all child records (no CASCADE on FKs)
    await supabase.from('transactions').delete().eq('season_id', seasonId);
    await supabase.from('budget_items').delete().eq('season_id', seasonId);
    await supabase.from('player_seasons').delete().eq('season_id', seasonId);
    await supabase.from('documents').delete().eq('season_id', seasonId);
    await supabase.from('team_seasons').delete().eq('season_id', seasonId);
    const { error } = await supabase.from('seasons').delete().eq('id', seasonId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // BUDGET ITEMS (now team_season scoped)
  // ─────────────────────────────────────────

  getBudgetItems: async (seasonId, teamSeasonId = null) => {
    let query = supabase.from('budget_items').select('*').eq('season_id', seasonId);
    if (teamSeasonId) query = query.eq('team_season_id', teamSeasonId);
    const { data, error } = await query;
    if (error) throw error;
    return data.map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
      teamSeasonId: item.team_season_id,
    }));
  },

  saveBudgetItems: async (seasonId, items, teamSeasonId = null) => {
    // Delete existing items scoped to this context
    let delQuery = supabase.from('budget_items').delete().eq('season_id', seasonId);
    if (teamSeasonId) delQuery = delQuery.eq('team_season_id', teamSeasonId);
    await delQuery;

    if (items.length > 0) {
      const rows = items.map((item) => ({
        season_id: seasonId,
        category: item.category,
        label: item.label,
        income: item.income || 0,
        expenses_fall: item.expensesFall || 0,
        expenses_spring: item.expensesSpring || 0,
        ...(teamSeasonId ? { team_season_id: teamSeasonId } : {}),
      }));
      const { error } = await supabase.from('budget_items').insert(rows);
      if (error) throw error;
    }
  },

  getBudgetItemsByTeamSeason: async (teamSeasonId) => {
    const { data, error } = await supabase.from('budget_items').select('*').eq('team_season_id', teamSeasonId);
    if (error) throw error;
    return data.map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
      teamSeasonId: item.team_season_id,
    }));
  },

  // ─────────────────────────────────────────
  // BUDGET HISTORY (for forecasting)
  // ─────────────────────────────────────────

  getAllBudgetItemsForTeam: async (teamId) => {
    // Get all team_season IDs for this team first
    const { data: tsData, error: tsErr } = await supabase
      .from('team_seasons')
      .select('id, season_id')
      .eq('team_id', teamId);
    if (tsErr) throw tsErr;
    if (!tsData || tsData.length === 0) return [];

    const tsIds = tsData.map((ts) => ts.id);
    const tsMap = Object.fromEntries(tsData.map((ts) => [ts.id, ts.season_id]));

    const { data, error } = await supabase.from('budget_items').select('*').in('team_season_id', tsIds);
    if (error) throw error;
    return data.map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
      teamSeasonId: item.team_season_id,
      seasonId: tsMap[item.team_season_id] || item.season_id,
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

  // ─────────────────────────────────────────
  // BUDGET AMENDMENTS
  // ─────────────────────────────────────────

  getBudgetAmendments: async (teamSeasonId) => {
    const { data, error } = await supabase
      .from('budget_amendments')
      .select('*')
      .eq('team_season_id', teamSeasonId)
      .order('amended_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((a) => ({
      id: a.id,
      teamSeasonId: a.team_season_id,
      amendmentNumber: a.amendment_number,
      reason: a.reason || '',
      totalExpenses: Number(a.amended_total_expenses),
      totalIncome: Number(a.amended_total_income),
      baseFee: Number(a.amended_base_fee),
      amendedAt: a.amended_at,
    }));
  },

  saveBudgetAmendment: async (amendmentData) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const row = {
      team_season_id: amendmentData.teamSeasonId,
      reason: amendmentData.reason || null,
      amended_total_expenses: amendmentData.totalExpenses,
      amended_total_income: amendmentData.totalIncome,
      amended_base_fee: amendmentData.baseFee,
      amended_by: user?.id || null,
    };
    const { data, error } = await supabase.from('budget_amendments').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  // ─────────────────────────────────────────
  // BLACKOUTS (team_id aware)
  // ─────────────────────────────────────────

  getAllBlackouts: async (teamId = null) => {
    let query = supabase.from('blackouts').select('*');
    if (teamId) {
      query = query.or(`team_id.eq.${teamId},team_id.is.null`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data.map((b) => b.date_str);
  },

  saveBlackout: async (dateStr, teamId = null) => {
    const { error } = await supabase
      .from('blackouts')
      .upsert(
        { date_str: dateStr, is_blackout: true, ...(teamId ? { team_id: teamId } : {}) },
        { onConflict: 'date_str' },
      );
    if (error) throw error;
  },

  deleteBlackout: async (dateStr) => {
    const { error } = await supabase.from('blackouts').delete().eq('date_str', dateStr);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // CLUBS
  // ─────────────────────────────────────────

  getAllClubs: async () => {
    const { data, error } = await supabase.from('clubs').select('*').order('name');
    if (error) throw error;
    return (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      logoUrl: c.logo_url,
      settings: c.settings,
    }));
  },

  createClub: async ({ name, slug }) => {
    const { data, error } = await supabase.from('clubs').insert({ name, slug }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, slug: data.slug };
  },

  deleteTeam: async (teamId) => {
    // Get all team_seasons for this team
    const { data: tss } = await supabase.from('team_seasons').select('id').eq('team_id', teamId);
    for (const ts of tss || []) {
      await supabase.from('transactions').delete().eq('team_season_id', ts.id);
      await supabase.from('budget_items').delete().eq('team_season_id', ts.id);
      await supabase.from('player_seasons').delete().eq('team_season_id', ts.id);
    }
    await supabase.from('team_seasons').delete().eq('team_id', teamId);
    await supabase.from('team_events').delete().eq('team_id', teamId);
    await supabase.from('blackouts').delete().eq('team_id', teamId);
    await supabase.from('user_roles').delete().eq('team_id', teamId);
    // Delete players and their children
    const { data: players } = await supabase.from('players').select('id').eq('team_id', teamId);
    for (const p of players || []) {
      await supabase.from('guardians').delete().eq('player_id', p.id);
      await supabase.from('documents').delete().eq('player_id', p.id);
      await supabase.from('medical_forms').delete().eq('player_id', p.id);
    }
    if (players?.length) {
      await supabase
        .from('players')
        .delete()
        .in(
          'id',
          players.map((p) => p.id),
        );
    }
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) throw error;
  },

  deleteClub: async (clubId) => {
    // Get all teams and cascade-delete each one
    const { data: teams } = await supabase.from('teams').select('id').eq('club_id', clubId);
    for (const t of teams || []) {
      // Inline team cascade delete
      const { data: tss } = await supabase.from('team_seasons').select('id').eq('team_id', t.id);
      for (const ts of tss || []) {
        await supabase.from('transactions').delete().eq('team_season_id', ts.id);
        await supabase.from('budget_items').delete().eq('team_season_id', ts.id);
        await supabase.from('player_seasons').delete().eq('team_season_id', ts.id);
      }
      await supabase.from('team_seasons').delete().eq('team_id', t.id);
      await supabase.from('team_events').delete().eq('team_id', t.id);
      await supabase.from('blackouts').delete().eq('team_id', t.id);
      await supabase.from('user_roles').delete().eq('team_id', t.id);
      const { data: players } = await supabase.from('players').select('id').eq('team_id', t.id);
      for (const p of players || []) {
        await supabase.from('guardians').delete().eq('player_id', p.id);
        await supabase.from('documents').delete().eq('player_id', p.id);
        await supabase.from('medical_forms').delete().eq('player_id', p.id);
      }
      if (players?.length)
        await supabase
          .from('players')
          .delete()
          .in(
            'id',
            players.map((p) => p.id),
          );
      await supabase.from('teams').delete().eq('id', t.id);
    }
    // Delete club-level records
    await supabase.from('user_roles').delete().eq('club_id', clubId);
    await supabase.from('custom_categories').delete().eq('club_id', clubId);
    await supabase.from('documents').delete().eq('club_id', clubId);
    const { error } = await supabase.from('clubs').delete().eq('id', clubId);
    if (error) throw error;
  },

  updateClub: async (clubId, updates) => {
    const row = {};
    if ('name' in updates) row.name = updates.name;
    if ('slug' in updates) row.slug = updates.slug;
    if ('logoUrl' in updates) row.logo_url = updates.logoUrl;
    if ('settings' in updates) row.settings = updates.settings;
    const { error } = await supabase.from('clubs').update(row).eq('id', clubId);
    if (error) throw error;
  },

  getClub: async (clubId) => {
    const { data, error } = await supabase.from('clubs').select('*').eq('id', clubId).single();
    if (error) throw error;
    return { id: data.id, name: data.name, slug: data.slug, logoUrl: data.logo_url, settings: data.settings };
  },

  getClubForUser: async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('club_id, clubs(*), team_id, teams(club_id, name)')
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const row = data[0];
    const club = row.clubs || (row.teams ? { id: row.teams.club_id } : null);
    if (!club) return null;
    return { id: club.id, name: club.name, slug: club.slug };
  },

  // ─────────────────────────────────────────
  // TEAMS (now returns color_secondary)
  // ─────────────────────────────────────────

  getTeams: async (clubId) => {
    const { data, error } = await supabase.from('teams').select('*').eq('club_id', clubId).order('name');
    if (error) throw error;
    return data.map((t) => ({
      id: t.id,
      clubId: t.club_id,
      name: t.name,
      ageGroup: t.age_group,
      gender: t.gender,
      tier: t.tier,
      icalUrl: t.ical_url,
      colorPrimary: t.color_primary,
      colorSecondary: t.color_secondary,
      status: t.status,
      paymentInfo: t.payment_info || '',
    }));
  },

  getTeam: async (teamId) => {
    const { data, error } = await supabase.from('teams').select('*').eq('id', teamId).single();
    if (error) throw error;
    return {
      id: data.id,
      clubId: data.club_id,
      name: data.name,
      ageGroup: data.age_group,
      gender: data.gender,
      tier: data.tier,
      icalUrl: data.ical_url,
      colorPrimary: data.color_primary,
      colorSecondary: data.color_secondary,
      status: data.status,
      paymentInfo: data.payment_info || '',
    };
  },

  createTeam: async (teamData) => {
    const { data, error } = await supabase
      .from('teams')
      .insert({
        club_id: teamData.clubId,
        name: teamData.name,
        age_group: teamData.ageGroup || null,
        gender: teamData.gender || null,
        tier: teamData.tier || null,
        ical_url: teamData.icalUrl || '',
        color_primary: teamData.colorPrimary || '#1e293b',
        color_secondary: teamData.colorSecondary || '#ffffff',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateTeam: async (teamId, updates) => {
    const row = {};
    if ('name' in updates) row.name = updates.name;
    if ('ageGroup' in updates) row.age_group = updates.ageGroup;
    if ('gender' in updates) row.gender = updates.gender;
    if ('tier' in updates) row.tier = updates.tier;
    if ('icalUrl' in updates) row.ical_url = updates.icalUrl;
    if ('colorPrimary' in updates) row.color_primary = updates.colorPrimary;
    if ('colorSecondary' in updates) row.color_secondary = updates.colorSecondary;
    if ('status' in updates) row.status = updates.status;
    if ('paymentInfo' in updates) row.payment_info = updates.paymentInfo;
    const { error } = await supabase.from('teams').update(row).eq('id', teamId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // TEAM SEASONS (budget/fee data lives here)
  // ─────────────────────────────────────────

  getTeamSeasons: async (teamId) => {
    const { data, error } = await supabase
      .from('team_seasons')
      .select('*')
      .eq('team_id', teamId)
      .order('season_id', { ascending: false });
    if (error) throw error;
    return data.map((ts) => ({
      id: ts.id,
      teamId: ts.team_id,
      seasonId: ts.season_id,
      isFinalized: ts.is_finalized,
      baseFee: ts.base_fee ? Number(ts.base_fee) : 0,
      bufferPercent: ts.buffer_percent,
      expectedRosterSize: ts.expected_roster_size,
      totalProjectedExpenses: ts.total_projected_expenses ? Number(ts.total_projected_expenses) : null,
      totalProjectedIncome: ts.total_projected_income ? Number(ts.total_projected_income) : null,
    }));
  },

  getTeamSeason: async (teamId, seasonId) => {
    const { data, error } = await supabase
      .from('team_seasons')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      teamId: data.team_id,
      seasonId: data.season_id,
      isFinalized: data.is_finalized,
      baseFee: data.base_fee ? Number(data.base_fee) : 0,
      bufferPercent: data.buffer_percent,
      expectedRosterSize: data.expected_roster_size,
      totalProjectedExpenses: data.total_projected_expenses ? Number(data.total_projected_expenses) : null,
      totalProjectedIncome: data.total_projected_income ? Number(data.total_projected_income) : null,
    };
  },

  saveTeamSeason: async (teamSeasonData) => {
    const row = {
      team_id: teamSeasonData.teamId,
      season_id: teamSeasonData.seasonId,
      is_finalized: teamSeasonData.isFinalized ?? false,
      base_fee: teamSeasonData.baseFee ?? 0,
      buffer_percent: teamSeasonData.bufferPercent ?? 5,
      expected_roster_size: teamSeasonData.expectedRosterSize ?? null,
      total_projected_expenses: teamSeasonData.totalProjectedExpenses ?? null,
      total_projected_income: teamSeasonData.totalProjectedIncome ?? null,
    };
    if (teamSeasonData.id) row.id = teamSeasonData.id;
    const { data, error } = await supabase
      .from('team_seasons')
      .upsert(row, { onConflict: 'team_id,season_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─────────────────────────────────────────
  // TEAM-SCOPED QUERIES
  // ─────────────────────────────────────────

  // Player financials from the DB VIEW — single source of truth for fees/balances
  // This replaces all client-side fee computation for display purposes.
  // Seasonal roster from the DB VIEW — players + season enrollment in one shot
  getSeasonalRoster: async (teamId, seasonId) => {
    const { data, error } = await supabase
      .from('seasonal_roster')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId);
    if (error) throw error;
    return data.map((r) => ({
      playerId: r.player_id,
      firstName: r.first_name,
      lastName: r.last_name,
      jerseyNumber: r.jersey_number,
      playerStatus: r.player_status,
      medicalRelease: r.medical_release,
      reePlayerWaiver: r.reeplayer_waiver,
      clubId: r.club_id,
      teamId: r.team_id,
      seasonId: r.season_id,
      feeWaived: r.fee_waived,
      seasonStatus: r.season_status,
      teamSeasonId: r.team_season_id,
    }));
  },

  addGuardian: async ({ playerId, name, email, phone }) => {
    const { error } = await supabase.from('guardians').insert({
      player_id: playerId,
      name,
      email: email || null,
      phone: phone || null,
    });
    if (error) throw error;
  },

  getPlayersByGuardianEmail: async (email) => {
    const { data, error } = await supabase
      .from('guardians')
      .select('player_id, players(*, guardians(*), player_seasons(*))')
      .ilike('email', email);
    if (error) throw error;
    return (data || [])
      .filter((g) => g.players)
      .map((g) => {
        const p = g.players;
        return {
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          jerseyNumber: p.jersey_number,
          birthdate: p.birthdate,
          gender: p.gender,
          status: p.status,
          medicalRelease: p.medical_release,
          reePlayerWaiver: p.reeplayer_waiver,
          clubId: p.club_id,
          teamId: p.team_id,
          guardians: (p.guardians || []).map((gu) => ({ id: gu.id, name: gu.name, email: gu.email, phone: gu.phone })),
          seasonProfiles: (p.player_seasons || []).reduce((acc, ps) => {
            acc[ps.season_id] = {
              feeWaived: ps.fee_waived,
              status: ps.status,
              teamSeasonId: ps.team_season_id,
              fundraiserBuyIn: ps.fundraiser_buyin ?? false,
            };
            return acc;
          }, {}),
        };
      });
  },

  getPlayersByClub: async (clubId) => {
    const { data, error } = await supabase
      .from('players')
      .select('*, guardians(*), player_seasons(*), teams(name, age_group)')
      .eq('club_id', clubId)
      .order('last_name');
    if (error) throw error;
    return data.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
      birthdate: p.birthdate,
      gender: p.gender,
      status: p.status,
      medicalRelease: p.medical_release,
      clubId: p.club_id,
      teamId: p.team_id,
      teamName: p.teams?.name || null,
      teamAgeGroup: p.teams?.age_group || null,
      guardians: (p.guardians || []).map((g) => ({ id: g.id, name: g.name, email: g.email, phone: g.phone })),
    }));
  },

  transferPlayer: async (playerId, newTeamId) => {
    const { error } = await supabase.from('players').update({ team_id: newTeamId }).eq('id', playerId);
    if (error) throw error;
  },

  getPlayersByTeam: async (teamId) => {
    const { data, error } = await supabase
      .from('players')
      .select('*, guardians(*), player_seasons(*)')
      .eq('team_id', teamId)
      .order('last_name');
    if (error) throw error;
    return data.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
      birthdate: p.birthdate,
      gender: p.gender,
      status: p.status,
      medicalRelease: p.medical_release,
      reePlayerWaiver: p.reeplayer_waiver,
      clubId: p.club_id,
      teamId: p.team_id,
      guardians: (p.guardians || []).map((g) => ({ id: g.id, name: g.name, email: g.email, phone: g.phone })),
      seasonProfiles: (p.player_seasons || []).reduce((acc, ps) => {
        acc[ps.season_id] = {
          feeWaived: ps.fee_waived,
          status: ps.status,
          teamSeasonId: ps.team_season_id,
          fundraiserBuyIn: ps.fundraiser_buyin ?? false,
        };
        return acc;
      }, {}),
    }));
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
      type: tx.type,
      category: tx.category,
      title: tx.title,
      amount: Number(tx.amount),
      notes: tx.notes,
      cleared: tx.cleared,
      distributed: tx.distributed,
      waterfallBatchId: tx.waterfall_batch_id,
      originalTxId: tx.original_tx_id,
      transferFrom: tx.transfer_from || '',
      transferTo: tx.transfer_to || '',
      eventId: tx.event_id || null,
      eventTitle: tx.team_events?.title || null,
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

  // ─────────────────────────────────────────
  // USER ROLES (RBAC)
  // ─────────────────────────────────────────

  getUserRoles: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('user_roles')
      .select('*, clubs(name, slug), teams(name, age_group, gender)')
      .eq('user_id', user.id);
    if (error) throw error;
    return data.map((r) => ({
      id: r.id,
      userId: r.user_id,
      clubId: r.club_id,
      teamId: r.team_id,
      role: r.role,
      clubName: r.clubs?.name || null,
      teamName: r.teams?.name || null,
    }));
  },

  getTeamRoles: async (teamId) => {
    const { data: team, error: tErr } = await supabase.from('teams').select('club_id').eq('id', teamId).single();
    if (tErr) throw tErr;

    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .or(`team_id.eq.${teamId},club_id.eq.${team.club_id}`);
    if (error) throw error;

    const userIds = [...new Set(data.map((r) => r.user_id))];
    let profileMap = {};
    if (userIds.length > 0) {
      try {
        const profiles = await supabaseService.getUserProfiles(userIds);
        profiles.forEach((p) => {
          profileMap[p.userId] = p;
        });
      } catch (e) {
        console.warn('Could not fetch user profiles:', e.message);
      }
    }

    return data.map((r) => {
      const profile = profileMap[r.user_id] || {};
      return {
        id: r.id,
        userId: r.user_id,
        teamId: r.team_id,
        clubId: r.club_id,
        role: r.role,
        displayName: profile.displayName || null,
        email: profile.email || null,
        isClubLevel: !r.team_id && !!r.club_id,
      };
    });
  },

  assignRole: async (userId, role, { clubId, teamId } = {}) => {
    const row = { user_id: userId, role };
    if (clubId) row.club_id = clubId;
    if (teamId) row.team_id = teamId;
    const { data, error } = await supabase.from('user_roles').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  revokeRole: async (roleId) => {
    const { error } = await supabase.from('user_roles').delete().eq('id', roleId);
    if (error) throw error;
  },

  getUserIdByEmail: async (email) => {
    const { data, error } = await supabase.rpc('get_user_id_by_email', { p_email: email.toLowerCase().trim() });
    if (error) throw error;
    return data;
  },

  assignRoleByEmail: async (email, role, { clubId, teamId } = {}) => {
    const userId = await supabaseService.getUserIdByEmail(email);
    if (!userId) throw new Error(`No account found for "${email}". Send them an invitation instead.`);
    return await supabaseService.assignRole(userId, role, { clubId, teamId });
  },

  // Ensures a user_profiles row exists for the given auth user.
  // Safe to call on every login — uses ignoreDuplicates so it only
  // inserts if no row exists yet, never overwriting existing data.
  ensureUserProfile: async (authUser) => {
    if (!authUser?.id || !authUser?.email) return;
    const { error } = await supabase.from('user_profiles').upsert(
      {
        user_id: authUser.id,
        email: authUser.email,
        display_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email.split('@')[0],
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
    if (error) {
      // Non-fatal — log but don't block the app
      console.warn('ensureUserProfile failed:', error.message);
    }
  },

  // ─────────────────────────────────────────
  // TEAM GUARDIANS (with account/role status)
  // ─────────────────────────────────────────

  getTeamGuardiansWithStatus: async (teamId) => {
    const { data: players, error } = await supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number, guardians(*)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .order('last_name');
    if (error) throw error;

    const guardianMap = {};
    players.forEach((p) => {
      (p.guardians || []).forEach((g) => {
        const email = (g.email || '').toLowerCase().trim();
        if (!email) return;
        if (!guardianMap[email]) {
          guardianMap[email] = {
            guardianId: g.id,
            name: g.name,
            email,
            phone: g.phone,
            players: [],
            userId: null,
            hasAccount: false,
            roles: [],
          };
        }
        guardianMap[email].players.push({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          jersey: p.jersey_number,
        });
      });
    });

    const emails = Object.keys(guardianMap);
    if (emails.length > 0) {
      const { data: teamRoles } = await supabase.from('user_roles').select('*').eq('team_id', teamId);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, display_name')
        .in('email', emails);
      const emailToProfile = {};
      (profiles || []).forEach((p) => {
        if (p.email) emailToProfile[p.email.toLowerCase()] = p;
      });

      emails.forEach((email) => {
        const profile = emailToProfile[email];
        if (profile) {
          guardianMap[email].userId = profile.user_id;
          guardianMap[email].hasAccount = true;
          guardianMap[email].displayName = profile.display_name;
          guardianMap[email].roles = (teamRoles || [])
            .filter((r) => r.user_id === profile.user_id)
            .map((r) => ({ id: r.id, role: r.role }));
        }
      });
    }

    return Object.values(guardianMap).sort((a, b) => a.name.localeCompare(b.name));
  },

  // ─────────────────────────────────────────
  // INVITATIONS
  // ─────────────────────────────────────────

  getInvitations: async (clubId) => {
    const { data, error } = await supabase
      .from('invitations')
      .select('*, teams(name)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      invitedName: inv.invited_name,
      teamId: inv.team_id,
      teamName: inv.teams?.name || null,
      token: inv.token,
      expiresAt: inv.expires_at,
      createdAt: inv.created_at,
    }));
  },

  createInvitation: async (invData) => {
    const { data, error } = await supabase
      .from('invitations')
      .insert({
        club_id: invData.clubId,
        team_id: invData.teamId || null,
        email: invData.email.toLowerCase().trim(),
        role: invData.role,
        invited_name: invData.name || null,
        invited_by: invData.invitedBy,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deleteInvitation: async (invId) => {
    const { error } = await supabase.from('invitations').delete().eq('id', invId);
    if (error) throw error;
  },

  acceptInvitation: async (token) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: inv, error: invErr } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();
    if (invErr || !inv) throw new Error('Invalid or expired invitation');

    const roleData = { user_id: user.id, role: inv.role };
    if (inv.role.startsWith('club_')) roleData.club_id = inv.club_id;
    else roleData.team_id = inv.team_id;

    const { error: roleErr } = await supabase.from('user_roles').insert(roleData);
    if (roleErr && !roleErr.message.includes('duplicate')) throw roleErr;

    await supabase.from('user_profiles').upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name: inv.invited_name || user.email.split('@')[0],
      },
      { onConflict: 'user_id' },
    );

    await supabase
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', inv.id);

    return { role: inv.role, teamId: inv.team_id, clubId: inv.club_id };
  },

  // ─────────────────────────────────────────
  // USER PROFILES & DIRECTORY
  // ─────────────────────────────────────────

  getUserProfiles: async (userIds) => {
    if (!userIds || userIds.length === 0) return [];
    const { data, error } = await supabase.from('user_profiles').select('*').in('user_id', userIds);
    if (error) throw error;
    return data.map((p) => ({
      id: p.id,
      userId: p.user_id,
      displayName: p.display_name,
      email: p.email,
      phone: p.phone,
      avatarUrl: p.avatar_url,
      isActive: p.is_active,
      lastLogin: p.last_login,
    }));
  },

  getClubUsers: async (clubId) => {
    const { data: roles, error: rErr } = await supabase
      .from('user_roles')
      .select('user_id, role, club_id, team_id, teams(name)')
      .or(
        `club_id.eq.${clubId},team_id.in.(${
          (await supabase.from('teams').select('id').eq('club_id', clubId)).data?.map((t) => t.id).join(',') || ''
        })`,
      );
    if (rErr) throw rErr;

    const userIds = [...new Set(roles.map((r) => r.user_id))];
    const profiles = await supabaseService.getUserProfiles(userIds);
    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId] = p;
    });

    const users = {};
    roles.forEach((r) => {
      if (!users[r.user_id]) {
        const profile = profileMap[r.user_id] || {};
        users[r.user_id] = {
          userId: r.user_id,
          displayName: profile.displayName || r.user_id.slice(0, 8),
          email: profile.email || '',
          phone: profile.phone || '',
          isActive: profile.isActive ?? true,
          roles: [],
        };
      }
      users[r.user_id].roles.push({
        role: r.role,
        clubId: r.club_id,
        teamId: r.team_id,
        teamName: r.teams?.name || null,
      });
    });
    return Object.values(users);
  },

  updateUserProfile: async (userId, updates) => {
    const row = {};
    if ('displayName' in updates) row.display_name = updates.displayName;
    if ('phone' in updates) row.phone = updates.phone;
    if ('isActive' in updates) row.is_active = updates.isActive;
    const { error } = await supabase.from('user_profiles').update(row).eq('user_id', userId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // DOCUMENTS (file metadata + Supabase Storage)
  // ─────────────────────────────────────────

  getPlayerDocuments: async (playerId) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((d) => ({
      id: d.id,
      playerId: d.player_id,
      clubId: d.club_id,
      teamId: d.team_id,
      seasonId: d.season_id,
      docType: d.doc_type,
      title: d.title,
      fileName: d.file_name,
      filePath: d.file_path,
      fileSize: d.file_size,
      mimeType: d.mime_type,
      status: d.status,
      verifiedBy: d.verified_by,
      verifiedAt: d.verified_at,
      expiresAt: d.expires_at,
      notes: d.notes,
      uploadedBy: d.uploaded_by,
      createdAt: d.created_at,
    }));
  },

  getTeamDocuments: async (teamId) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*, players(first_name, last_name, jersey_number)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((d) => ({
      id: d.id,
      playerId: d.player_id,
      playerName: d.players ? `${d.players.first_name} ${d.players.last_name}` : null,
      jerseyNumber: d.players?.jersey_number,
      docType: d.doc_type,
      title: d.title,
      fileName: d.file_name,
      filePath: d.file_path,
      fileSize: d.file_size,
      mimeType: d.mime_type,
      status: d.status,
      expiresAt: d.expires_at,
      createdAt: d.created_at,
    }));
  },

  uploadDocument: async (file, playerId, docMeta) => {
    const ext = file.name.split('.').pop();
    const storagePath = `${docMeta.clubId}/${playerId}/${Date.now()}_${docMeta.docType}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('player-documents')
      .upload(storagePath, file, { contentType: file.type });
    if (uploadErr) throw uploadErr;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('documents')
      .insert({
        player_id: playerId,
        club_id: docMeta.clubId || null,
        team_id: docMeta.teamId || null,
        season_id: docMeta.seasonId || null,
        doc_type: docMeta.docType,
        title: docMeta.title || `${docMeta.docType} - ${file.name}`,
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  verifyDocument: async (docId) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('documents')
      .update({
        status: 'verified',
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', docId);
    if (error) throw error;
  },

  rejectDocument: async (docId, reason = null) => {
    const { error } = await supabase
      .from('documents')
      .update({
        status: 'rejected',
        notes: reason,
      })
      .eq('id', docId);
    if (error) throw error;
  },

  deleteDocument: async (docId, filePath) => {
    if (filePath) {
      await supabase.storage.from('player-documents').remove([filePath]);
    }
    const { error } = await supabase.from('documents').delete().eq('id', docId);
    if (error) throw error;
  },

  getDocumentUrl: async (filePath) => {
    const { data } = await supabase.storage.from('player-documents').createSignedUrl(filePath, 3600);
    return data?.signedUrl || null;
  },

  // ─────────────────────────────────────────
  // MEDICAL FORMS (stored form data for PDF generation)
  // ─────────────────────────────────────────

  getMedicalForm: async (playerId) => {
    if (!playerId) return null;
    const { data, error } = await supabase.from('medical_forms').select('*').eq('player_id', playerId).maybeSingle();
    if (error) throw error;
    return data;
  },

  saveMedicalForm: async (playerId, formData, language = 'en') => {
    const row = {
      player_id: playerId,
      data: formData,
      language,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('medical_forms').upsert(row, { onConflict: 'player_id' });
    if (error) throw error;
  },
};

export default supabaseService;
