import { supabase } from '../supabase';
import { logAuditEvent } from './auditService';
import { pushService } from './pushService';

export const playerService = {
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

    try {
      // 2. Insert guardians
      if (playerData.guardians?.length > 0) {
        const guardianRows = playerData.guardians
          .filter((g) => g.name)
          .map((g) => ({
            player_id: player.id,
            name: g.name,
            email: g.email?.toLowerCase().trim() || null,
            phone: g.phone || null,
          }));
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
    } catch (childErr) {
      // Compensating delete — remove orphaned player if subsequent steps fail
      await supabase.from('players').delete().eq('id', player.id);
      throw childErr;
    }

    // Fire-and-forget audit log
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        logAuditEvent({
          tableName: 'players',
          recordId: player.id,
          action: 'insert',
          changedBy: user.id,
          newData: player,
          metadata: { team_id: playerData.teamId || null, club_id: playerData.clubId || null },
        });
      }
    });

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
        .map((g) => ({
          player_id: playerId,
          name: g.name,
          email: g.email?.toLowerCase().trim() || null,
          phone: g.phone || null,
        }));
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

    // Fire-and-forget audit log
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        logAuditEvent({
          tableName: 'players',
          recordId: playerId,
          action: 'update',
          changedBy: user.id,
          newData: { ...playerData, id: playerId },
          metadata: { updated_fields: Object.keys(playerData) },
        });
      }
    });
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

    // Fire-and-forget audit log + compliance notification to parent
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        logAuditEvent({
          tableName: 'players',
          recordId: playerId,
          action: 'update',
          changedBy: user.id,
          newData: { [dbField]: value },
          metadata: { field, value },
        });
      }

      // Notify parent when a compliance document is updated
      const complianceFields = ['medicalRelease', 'reePlayerWaiver'];
      if (complianceFields.includes(field)) {
        try {
          const { data: player } = await supabase
            .from('players')
            .select('first_name, last_name, guardians(email)')
            .eq('id', playerId)
            .single();

          if (player) {
            const guardianEmails = (player.guardians || []).map((g) => g.email?.toLowerCase()).filter(Boolean);

            if (guardianEmails.length > 0) {
              const { data: profiles } = await supabase
                .from('user_profiles')
                .select('user_id')
                .in('email', guardianEmails);

              const userIds = (profiles || []).map((p) => p.user_id);
              if (userIds.length > 0) {
                const label = field === 'medicalRelease' ? 'Medical Release' : 'Player Waiver';
                const status = value ? 'approved' : 'flagged';
                pushService
                  .notifyUsers({
                    userIds,
                    eventType: 'compliance',
                    title: `${player.first_name} ${player.last_name} — ${label}`,
                    body: `${label} has been ${status}.`,
                    url: '/dashboard',
                  })
                  .catch(() => {});
              }
            }
          }
        } catch {
          // Non-fatal — push notification failure should not break the update
        }
      }
    });
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

  transferPlayer: async (playerId, newTeamId) => {
    const { error } = await supabase.from('players').update({ team_id: newTeamId }).eq('id', playerId);
    if (error) throw error;
  },

  addGuardian: async ({ playerId, name, email, phone }) => {
    const { error } = await supabase.from('guardians').insert({
      player_id: playerId,
      name,
      email: email?.toLowerCase().trim() || null,
      phone: phone || null,
    });
    if (error) throw error;
  },

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
};
