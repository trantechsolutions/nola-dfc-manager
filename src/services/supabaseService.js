// src/services/supabaseService.js
import { supabase } from '../supabase';

export const supabaseService = {

  // ─────────────────────────────────────────
  // PLAYERS (reshapes into old Firestore format)
  // ─────────────────────────────────────────

  getAllPlayers: async () => {
    const { data: players, error: pErr } = await supabase
      .from('players')
      .select(`
        *,
        guardians (*),
        player_seasons (*)
      `)
      .order('last_name');

    if (pErr) throw pErr;

    return players.map(p => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
      status: p.status,
      medicalRelease: p.medical_release,
      reePlayerWaiver: p.reeplayer_waiver,
      clubId: p.club_id,
      teamId: p.team_id,
      guardians: (p.guardians || []).map(g => ({
        id: g.id,
        name: g.name,
        email: g.email,
        phone: g.phone
      })),
      seasonProfiles: (p.player_seasons || []).reduce((acc, ps) => {
        acc[ps.season_id] = {
          baseFee: Number(ps.base_fee || 0),
          feeWaived: ps.fee_waived,
          status: ps.status,
          teamSeasonId: ps.team_season_id,
        };
        return acc;
      }, {})
    }));
  },

  addPlayer: async (playerData) => {
    const { data: player, error: pErr } = await supabase
      .from('players')
      .insert({
        first_name: playerData.firstName,
        last_name: playerData.lastName,
        jersey_number: playerData.jerseyNumber || null,
        status: playerData.status || 'active',
        medical_release: playerData.medicalRelease || false,
        reeplayer_waiver: playerData.reePlayerWaiver || false,
        ...(playerData.clubId ? { club_id: playerData.clubId } : {}),
        ...(playerData.teamId ? { team_id: playerData.teamId } : {}),
      })
      .select()
      .single();

    if (pErr) throw pErr;

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

    if (playerData.seasonProfiles) {
      for (const [seasonId, profile] of Object.entries(playerData.seasonProfiles)) {
        const { error: sErr } = await supabase
          .from('player_seasons')
          .upsert({
            player_id: playerId,
            season_id: seasonId,
            fee_waived: profile.feeWaived ?? false,
            status: profile.status || 'active'
          }, { onConflict: 'player_id,season_id' });
        if (sErr) throw sErr;
      }
    }
  },

  updatePlayerField: async (playerId, field, value) => {
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

  addPlayerToSeason: async (playerId, seasonId, profile, teamSeasonId = null) => {
    const row = {
      player_id: playerId,
      season_id: seasonId,
      fee_waived: profile.feeWaived ?? false,
      status: profile.status || 'active',
      ...(teamSeasonId ? { team_season_id: teamSeasonId } : {}),
    };
    const { error } = await supabase
      .from('player_seasons')
      .upsert(row, { onConflict: 'player_id,season_id' });
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
      .select(`
        *,
        players (first_name, last_name)
      `)
      .order('date', { ascending: false });

    if (error) throw error;

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
      teamSeasonId: tx.team_season_id,
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
  // SEASONS (table only has: id, name, created_at, updated_at)
  // All budget fields live on team_seasons.
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
    }));
  },

  saveSeason: async (seasonId, data) => {
    const row = {
      id: seasonId,
      name: data.name || seasonId,
    };
    const { error } = await supabase
      .from('seasons')
      .upsert(row, { onConflict: 'id' });
    if (error) throw error;
  },

  deleteSeason: async (seasonId) => {
    await supabase.from('transactions').delete().eq('season_id', seasonId);
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
      teamSeasonId: item.team_season_id,
    }));
  },

  saveBudgetItems: async (seasonId, items) => {
    await supabase.from('budget_items').delete().eq('season_id', seasonId);

    if (items.length > 0) {
      const rows = items.map(item => ({
        season_id: seasonId,
        category: item.category,
        label: item.label,
        income: item.income || 0,
        expenses_fall: item.expensesFall || 0,
        expenses_spring: item.expensesSpring || 0,
        ...(item.teamSeasonId ? { team_season_id: item.teamSeasonId } : {}),
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
    const { error } = await supabase
      .from('blackouts')
      .delete()
      .eq('date_str', dateStr);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // CLUBS
  // ─────────────────────────────────────────

  getClubForUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('club_id, team_id, teams(club_id)')
      .eq('user_id', user.id)
      .limit(1);
    if (error || !roles?.length) return null;
    const row = roles[0];
    const clubId = row.club_id || (row.teams ? row.teams.club_id : null);
    if (!clubId) return null;
    const { data: club } = await supabase.from('clubs').select('*').eq('id', clubId).single();
    if (!club) return null;
    return { id: club.id, name: club.name, slug: club.slug };
  },

  // ─────────────────────────────────────────
  // TEAMS
  // ─────────────────────────────────────────

  getTeams: async (clubId) => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('club_id', clubId)
      .order('name');
    if (error) throw error;
    return data.map(t => ({
      id: t.id, clubId: t.club_id, name: t.name,
      ageGroup: t.age_group, gender: t.gender, tier: t.tier,
      icalUrl: t.ical_url, colorPrimary: t.color_primary,
      status: t.status,
    }));
  },

  getTeam: async (teamId) => {
    const { data, error } = await supabase.from('teams').select('*').eq('id', teamId).single();
    if (error) throw error;
    return {
      id: data.id, clubId: data.club_id, name: data.name,
      ageGroup: data.age_group, gender: data.gender, tier: data.tier,
      icalUrl: data.ical_url, colorPrimary: data.color_primary,
      status: data.status,
    };
  },

  createTeam: async (teamData) => {
    const { data, error } = await supabase.from('teams').insert({
      club_id: teamData.clubId,
      name: teamData.name,
      age_group: teamData.ageGroup || null,
      gender: teamData.gender || null,
      tier: teamData.tier || null,
      ical_url: teamData.icalUrl || '',
      color_primary: teamData.colorPrimary || '#1e293b',
    }).select().single();
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
    if ('status' in updates) row.status = updates.status;
    const { error } = await supabase.from('teams').update(row).eq('id', teamId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // TEAM SEASONS (where budget fields live)
  // ─────────────────────────────────────────

  getTeamSeasons: async (teamId) => {
    const { data, error } = await supabase
      .from('team_seasons')
      .select('*')
      .eq('team_id', teamId)
      .order('season_id', { ascending: false });
    if (error) throw error;
    return data.map(ts => ({
      id: ts.id, teamId: ts.team_id, seasonId: ts.season_id,
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
      id: data.id, teamId: data.team_id, seasonId: data.season_id,
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
    const { data, error } = await supabase.from('team_seasons').upsert(row, { onConflict: 'team_id,season_id' }).select().single();
    if (error) throw error;
    return data;
  },

  // ─────────────────────────────────────────
  // USER ROLES (RBAC)
  // ─────────────────────────────────────────

  getUserRoles: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('user_roles')
      .select('*, clubs(name, slug), teams(name, age_group, gender)')
      .eq('user_id', user.id);
    if (error) throw error;
    return data.map(r => ({
      id: r.id, userId: r.user_id, clubId: r.club_id, teamId: r.team_id,
      role: r.role, clubName: r.clubs?.name || null, teamName: r.teams?.name || null,
    }));
  },

  getTeamRoles: async (teamId) => {
    const { data: team, error: tErr } = await supabase
      .from('teams').select('club_id').eq('id', teamId).single();
    if (tErr) throw tErr;

    const { data, error } = await supabase
      .from('user_roles').select('*')
      .or(`team_id.eq.${teamId},club_id.eq.${team.club_id}`);
    if (error) throw error;

    const userIds = [...new Set(data.map(r => r.user_id))];
    let profileMap = {};
    if (userIds.length > 0) {
      try {
        const profiles = await supabaseService.getUserProfiles(userIds);
        profiles.forEach(p => { profileMap[p.userId] = p; });
      } catch (e) { console.warn('Could not fetch user profiles:', e.message); }
    }

    return data.map(r => {
      const profile = profileMap[r.user_id] || {};
      return {
        id: r.id, userId: r.user_id, teamId: r.team_id, clubId: r.club_id, role: r.role,
        displayName: profile.displayName || null, email: profile.email || null,
        isClubLevel: !r.team_id && !!r.club_id,
      };
    });
  },

  getUserProfiles: async (userIds) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', userIds);
    if (error) throw error;
    return data.map(p => ({
      userId: p.user_id, displayName: p.display_name, email: p.email, phone: p.phone, isActive: p.is_active,
    }));
  },

  getUserIdByEmail: async (email) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();
    if (error) throw error;
    return data?.user_id || null;
  },

  assignRole: async (userId, role, { clubId, teamId } = {}) => {
    const row = { user_id: userId, role };
    if (clubId) row.club_id = clubId;
    if (teamId) row.team_id = teamId;
    const { data, error } = await supabase.from('user_roles').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  assignRoleByEmail: async (email, role, { clubId, teamId } = {}) => {
    const userId = await supabaseService.getUserIdByEmail(email);
    if (!userId) throw new Error(`No account found for "${email}". Send them an invitation instead.`);
    return await supabaseService.assignRole(userId, role, { clubId, teamId });
  },

  revokeRole: async (roleId) => {
    const { error } = await supabase.from('user_roles').delete().eq('id', roleId);
    if (error) throw error;
  },

  // ─────────────────────────────────────────
  // TEAM-SCOPED QUERIES
  // ─────────────────────────────────────────

  getPlayersByTeam: async (teamId) => {
    const { data, error } = await supabase
      .from('players')
      .select('*, guardians(*), player_seasons(*)')
      .eq('team_id', teamId)
      .order('last_name');
    if (error) throw error;
    return data.map(p => ({
      id: p.id, firstName: p.first_name, lastName: p.last_name,
      jerseyNumber: p.jersey_number, status: p.status,
      medicalRelease: p.medical_release, reePlayerWaiver: p.reeplayer_waiver,
      clubId: p.club_id, teamId: p.team_id,
      guardians: (p.guardians || []).map(g => ({ id: g.id, name: g.name, email: g.email, phone: g.phone })),
      seasonProfiles: (p.player_seasons || []).reduce((acc, ps) => {
        acc[ps.season_id] = { baseFee: Number(ps.base_fee || 0), feeWaived: ps.fee_waived, status: ps.status, teamSeasonId: ps.team_season_id };
        return acc;
      }, {}),
    }));
  },

  getTransactionsByTeamSeason: async (teamSeasonId) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, players(first_name, last_name)')
      .eq('team_season_id', teamSeasonId)
      .order('date', { ascending: false });
    if (error) throw error;
    return data.map(tx => ({
      id: tx.id, seasonId: tx.season_id, teamSeasonId: tx.team_season_id,
      playerId: tx.player_id,
      playerName: tx.players ? `${tx.players.first_name} ${tx.players.last_name}` : null,
      date: { seconds: Math.floor(new Date(tx.date).getTime() / 1000) },
      rawDate: tx.date, split: tx.split, type: tx.type, category: tx.category,
      title: tx.title, amount: Number(tx.amount), notes: tx.notes,
      cleared: tx.cleared, distributed: tx.distributed,
      waterfallBatchId: tx.waterfall_batch_id, originalTxId: tx.original_tx_id,
    }));
  },

  getBudgetItemsByTeamSeason: async (teamSeasonId) => {
    const { data, error } = await supabase
      .from('budget_items')
      .select('*')
      .eq('team_season_id', teamSeasonId);
    if (error) throw error;
    return data.map(item => ({
      id: item.id, category: item.category, label: item.label,
      income: Number(item.income),
      expensesFall: Number(item.expenses_fall),
      expensesSpring: Number(item.expenses_spring),
      teamSeasonId: item.team_season_id,
    }));
  },

  // ─────────────────────────────────────────
  // DOCUMENTS
  // ─────────────────────────────────────────

  getPlayerDocuments: async (playerId) => {
    const { data, error } = await supabase
      .from('documents').select('*').eq('player_id', playerId).order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(d => ({
      id: d.id, playerId: d.player_id, clubId: d.club_id, teamId: d.team_id, seasonId: d.season_id,
      docType: d.doc_type, title: d.title, fileName: d.file_name, filePath: d.file_path,
      fileSize: d.file_size, mimeType: d.mime_type,
      status: d.status, verifiedBy: d.verified_by, verifiedAt: d.verified_at, expiresAt: d.expires_at,
      notes: d.notes, uploadedBy: d.uploaded_by, createdAt: d.created_at,
    }));
  },

  getTeamDocuments: async (teamId) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*, players(first_name, last_name, jersey_number)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(d => ({
      id: d.id, playerId: d.player_id,
      playerName: d.players ? `${d.players.first_name} ${d.players.last_name}` : null,
      jerseyNumber: d.players?.jersey_number,
      docType: d.doc_type, title: d.title, fileName: d.file_name, filePath: d.file_path,
      fileSize: d.file_size, mimeType: d.mime_type,
      status: d.status, expiresAt: d.expires_at, createdAt: d.created_at,
    }));
  },

  uploadDocument: async (file, playerId, docMeta) => {
    const ext = file.name.split('.').pop();
    const storagePath = `${docMeta.clubId}/${playerId}/${Date.now()}_${docMeta.docType}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('player-documents')
      .upload(storagePath, file, { contentType: file.type });
    if (uploadErr) throw uploadErr;

    const { data: docRow, error: dbErr } = await supabase.from('documents').insert({
      player_id: playerId,
      club_id: docMeta.clubId,
      team_id: docMeta.teamId,
      season_id: docMeta.seasonId,
      doc_type: docMeta.docType,
      title: docMeta.title || `${docMeta.docType} - ${file.name}`,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      status: 'uploaded',
      uploaded_by: docMeta.uploadedBy,
    }).select().single();
    if (dbErr) throw dbErr;
    return docRow;
  },

  deleteDocument: async (docId, filePath) => {
    if (filePath) {
      await supabase.storage.from('player-documents').remove([filePath]);
    }
    const { error } = await supabase.from('documents').delete().eq('id', docId);
    if (error) throw error;
  },

  updateDocumentStatus: async (docId, status, verifiedBy = null) => {
    const updates = { status };
    if (verifiedBy) { updates.verified_by = verifiedBy; updates.verified_at = new Date().toISOString(); }
    const { error } = await supabase.from('documents').update(updates).eq('id', docId);
    if (error) throw error;
  },

  getDocumentUrl: async (filePath) => {
    const { data, error } = await supabase.storage
      .from('player-documents')
      .createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  },

  // ─────────────────────────────────────────
  // GUARDIAN STATUS (for team user management)
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
    players.forEach(p => {
      (p.guardians || []).forEach(g => {
        const email = (g.email || '').toLowerCase().trim();
        if (!email) return;
        if (!guardianMap[email]) {
          guardianMap[email] = {
            guardianId: g.id, name: g.name, email, phone: g.phone,
            players: [], userId: null, hasAccount: false, roles: [],
          };
        }
        guardianMap[email].players.push({
          id: p.id, name: `${p.first_name} ${p.last_name}`, jersey: p.jersey_number,
        });
      });
    });

    const emails = Object.keys(guardianMap);
    if (emails.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles').select('user_id, email').in('email', emails);
      (profiles || []).forEach(p => {
        const email = p.email.toLowerCase().trim();
        if (guardianMap[email]) {
          guardianMap[email].userId = p.user_id;
          guardianMap[email].hasAccount = true;
        }
      });

      const userIds = Object.values(guardianMap).filter(g => g.userId).map(g => g.userId);
      if (userIds.length > 0) {
        const { data: roles } = await supabase
          .from('user_roles').select('*').in('user_id', userIds);
        (roles || []).forEach(r => {
          const guardian = Object.values(guardianMap).find(g => g.userId === r.user_id);
          if (guardian) guardian.roles.push({ id: r.id, role: r.role, teamId: r.team_id, clubId: r.club_id });
        });
      }
    }

    return Object.values(guardianMap);
  },

  updateUserProfile: async (userId, updates) => {
    const row = {};
    if ('displayName' in updates) row.display_name = updates.displayName;
    if ('phone' in updates) row.phone = updates.phone;
    if ('isActive' in updates) row.is_active = updates.isActive;
    const { error } = await supabase.from('user_profiles').update(row).eq('user_id', userId);
    if (error) throw error;
  },
};