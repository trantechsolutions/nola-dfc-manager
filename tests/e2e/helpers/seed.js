/**
 * Test data seeder — creates isolated test data prefixed with TEST_E2E_
 * so it can be reliably cleaned up without affecting real data.
 */
import { adminClient } from './supabaseAdmin.js';

const PREFIX = 'TEST_E2E_';

// ── Test user credentials ──
export const TEST_USER = {
  email: `${PREFIX.toLowerCase()}user@test.local`,
  password: 'TestPassword123!',
};

// ── Stored IDs for cleanup ──
const created = {
  userId: null,
  clubId: null,
  teamId: null,
  seasonId: null,
  teamSeasonId: null,
  playerIds: [],
  transactionIds: [],
};

export function getCreated() {
  return { ...created };
}

// ── Seed all test data ──
export async function seedAll() {
  // 1. Create test auth user (or reuse existing)
  let userId;
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u) => u.email === TEST_USER.email);

  if (existing) {
    userId = existing.id;
  } else {
    const { data: newUser, error } = await adminClient.auth.admin.createUser({
      email: TEST_USER.email,
      password: TEST_USER.password,
      email_confirm: true,
    });
    if (error) throw new Error(`Failed to create test user: ${error.message}`);
    userId = newUser.user.id;
  }
  created.userId = userId;

  // Ensure user profile
  await adminClient.from('user_profiles').upsert(
    {
      user_id: userId,
      email: TEST_USER.email,
      display_name: `${PREFIX}Admin`,
      is_active: true,
    },
    { onConflict: 'user_id' },
  );

  // 2. Create test club
  const { data: club, error: clubErr } = await adminClient
    .from('clubs')
    .insert({ name: `${PREFIX}Club`, slug: `${PREFIX.toLowerCase()}club` })
    .select()
    .single();
  if (clubErr) throw new Error(`Failed to create club: ${clubErr.message}`);
  created.clubId = club.id;

  // 3. Assign club_admin role
  await adminClient.from('user_roles').insert({
    user_id: userId,
    club_id: club.id,
    role: 'club_admin',
  });

  // 4. Create test team
  const { data: team, error: teamErr } = await adminClient
    .from('teams')
    .insert({
      club_id: club.id,
      name: `${PREFIX}Team U14`,
      age_group: 'U14',
      gender: 'Boys',
      color_primary: '#1e293b',
      color_secondary: '#ffffff',
    })
    .select()
    .single();
  if (teamErr) throw new Error(`Failed to create team: ${teamErr.message}`);
  created.teamId = team.id;

  // Also assign team_manager role
  await adminClient.from('user_roles').insert({
    user_id: userId,
    team_id: team.id,
    role: 'team_manager',
  });

  // 5. Create test season
  const seasonId = `${PREFIX}2025-2026`;
  await adminClient.from('seasons').upsert({ id: seasonId, name: `${PREFIX}Season 2025-2026` }, { onConflict: 'id' });
  created.seasonId = seasonId;

  // 6. Create team_season with budget
  const { data: ts, error: tsErr } = await adminClient
    .from('team_seasons')
    .insert({
      team_id: team.id,
      season_id: seasonId,
      is_finalized: true,
      base_fee: 2000,
      buffer_percent: 5,
      expected_roster_size: 18,
      total_projected_expenses: 36000,
      total_projected_income: 0,
    })
    .select()
    .single();
  if (tsErr) throw new Error(`Failed to create team_season: ${tsErr.message}`);
  created.teamSeasonId = ts.id;

  // 7. Create test players
  const playerData = [
    {
      first_name: PREFIX + 'Alex',
      last_name: 'Johnson',
      jersey_number: 10,
      status: 'active',
      club_id: club.id,
      team_id: team.id,
    },
    {
      first_name: PREFIX + 'Jordan',
      last_name: 'Smith',
      jersey_number: 7,
      status: 'active',
      club_id: club.id,
      team_id: team.id,
    },
    {
      first_name: PREFIX + 'Taylor',
      last_name: 'Williams',
      jersey_number: 3,
      status: 'active',
      club_id: club.id,
      team_id: team.id,
    },
  ];

  for (const pd of playerData) {
    const { data: player, error: pErr } = await adminClient.from('players').insert(pd).select().single();
    if (pErr) throw new Error(`Failed to create player: ${pErr.message}`);
    created.playerIds.push(player.id);

    // Enroll in season
    await adminClient.from('player_seasons').insert({
      player_id: player.id,
      season_id: seasonId,
      team_season_id: ts.id,
      fee_waived: false,
      status: 'active',
    });

    // Add a guardian
    await adminClient.from('guardians').insert({
      player_id: player.id,
      name: `${PREFIX}Parent of ${pd.first_name}`,
      email: `${pd.first_name.toLowerCase()}@test.local`,
      phone: '555-0100',
    });
  }

  // 8. Create test transactions (payments for first player)
  const txRows = [
    {
      season_id: seasonId,
      team_season_id: ts.id,
      player_id: created.playerIds[0],
      date: '2025-09-15',
      category: 'TMF',
      title: `${PREFIX}Fall Payment 1`,
      amount: 500,
      cleared: true,
    },
    {
      season_id: seasonId,
      team_season_id: ts.id,
      player_id: created.playerIds[0],
      date: '2025-10-15',
      category: 'TMF',
      title: `${PREFIX}Fall Payment 2`,
      amount: 300,
      cleared: true,
    },
    {
      season_id: seasonId,
      team_season_id: ts.id,
      player_id: created.playerIds[1],
      date: '2025-09-20',
      category: 'FUN',
      title: `${PREFIX}Fundraiser`,
      amount: 200,
      cleared: true,
    },
  ];

  for (const tx of txRows) {
    const { data, error } = await adminClient.from('transactions').insert(tx).select().single();
    if (error) throw new Error(`Failed to create transaction: ${error.message}`);
    created.transactionIds.push(data.id);
  }

  console.log('✓ Test data seeded:', {
    userId,
    clubId: club.id,
    teamId: team.id,
    seasonId,
    teamSeasonId: ts.id,
    players: created.playerIds.length,
    transactions: created.transactionIds.length,
  });

  return created;
}

// ── Cleanup all test data (reverse order of creation) ──
export async function cleanupAll() {
  try {
    // Transactions
    if (created.transactionIds.length) {
      await adminClient.from('transactions').delete().in('id', created.transactionIds);
    }
    // Also catch any stray test transactions
    if (created.teamSeasonId) {
      await adminClient.from('transactions').delete().eq('team_season_id', created.teamSeasonId);
    }

    // Documents, medical_forms for test players
    for (const pid of created.playerIds) {
      await adminClient.from('documents').delete().eq('player_id', pid);
      await adminClient.from('medical_forms').delete().eq('player_id', pid);
      await adminClient.from('guardians').delete().eq('player_id', pid);
      await adminClient.from('player_seasons').delete().eq('player_id', pid);
    }

    // Players
    if (created.playerIds.length) {
      await adminClient.from('players').delete().in('id', created.playerIds);
    }

    // Team season
    if (created.teamSeasonId) {
      await adminClient.from('budget_items').delete().eq('team_season_id', created.teamSeasonId);
      await adminClient.from('team_seasons').delete().eq('id', created.teamSeasonId);
    }

    // Season
    if (created.seasonId) {
      await adminClient.from('seasons').delete().eq('id', created.seasonId);
    }

    // Team roles
    if (created.teamId) {
      await adminClient.from('user_roles').delete().eq('team_id', created.teamId);
      await adminClient.from('teams').delete().eq('id', created.teamId);
    }

    // Club roles & club
    if (created.clubId) {
      await adminClient.from('user_roles').delete().eq('club_id', created.clubId);
      await adminClient.from('clubs').delete().eq('id', created.clubId);
    }

    // User profile & auth user
    if (created.userId) {
      await adminClient.from('user_profiles').delete().eq('user_id', created.userId);
      await adminClient.auth.admin.deleteUser(created.userId);
    }

    console.log('✓ Test data cleaned up');
  } catch (err) {
    console.error('⚠ Cleanup error (non-fatal):', err.message);
  }
}
