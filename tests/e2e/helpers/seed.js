/**
 * Test data seeder — creates isolated test data prefixed with TEST_E2E_
 * so it can be reliably cleaned up without affecting real data.
 */
import { adminClient } from './supabaseAdmin.js';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const PREFIX = 'TEST_E2E_';
const STATE_FILE = resolve(process.cwd(), 'test-results', '.e2e-seed-state.json');

// ── Test user credentials ──
export const TEST_USER = {
  email: `${PREFIX.toLowerCase()}user@test.local`,
  password: 'TestPassword123!',
};

// ── Stored IDs for cleanup ──
let created = {
  userId: null,
  clubId: null,
  teamId: null,
  teamId2: null,
  seasonId: null,
  teamSeasonId: null,
  playerIds: [],
  transactionIds: [],
  budgetItemIds: [],
  teamEventIds: [],
};

function saveState() {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(created, null, 2));
  } catch {
    /* noop */
  }
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      created = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    /* noop */
  }
}

function clearState() {
  try {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  } catch {
    /* noop */
  }
}

export function getCreated() {
  loadState();
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
  const slug = `${PREFIX.toLowerCase()}club_${Date.now()}`;
  const { data: club, error: clubErr } = await adminClient
    .from('clubs')
    .insert({ name: `${PREFIX}Club`, slug })
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

  // 9. Create budget items
  const budgetRows = [
    {
      season_id: seasonId,
      team_season_id: ts.id,
      category: 'TOU',
      label: `${PREFIX}Tournaments`,
      income: 0,
      expenses_fall: 2000,
      expenses_spring: 3000,
    },
    {
      season_id: seasonId,
      team_season_id: ts.id,
      category: 'OPE',
      label: `${PREFIX}Operations`,
      income: 0,
      expenses_fall: 500,
      expenses_spring: 500,
    },
    {
      season_id: seasonId,
      team_season_id: ts.id,
      category: 'LEA',
      label: `${PREFIX}League Fees`,
      income: 0,
      expenses_fall: 1000,
      expenses_spring: 1000,
    },
  ];
  for (const bi of budgetRows) {
    const { data, error } = await adminClient.from('budget_items').insert(bi).select().single();
    if (error) throw new Error(`Failed to create budget item: ${error.message}`);
    created.budgetItemIds.push(data.id);
  }

  // 10. Create a second team (for multi-team tests)
  const { data: team2, error: t2Err } = await adminClient
    .from('teams')
    .insert({
      club_id: club.id,
      name: `${PREFIX}Team U12`,
      age_group: 'U12',
      gender: 'Girls',
      tier: 'recreational',
      color_primary: '#059669',
      color_secondary: '#ffffff',
    })
    .select()
    .single();
  if (t2Err) throw new Error(`Failed to create team 2: ${t2Err.message}`);
  created.teamId2 = team2.id;

  // 11. Create team events
  const eventRows = [
    {
      team_id: team.id,
      uid: `${PREFIX}event-1`,
      title: `${PREFIX}Fall Tournament`,
      event_date: '2025-10-15T10:00:00Z',
      event_type: 'tournament',
      location: 'City Park Fields',
    },
    {
      team_id: team.id,
      uid: `${PREFIX}event-2`,
      title: `${PREFIX}League Match vs Rival`,
      event_date: '2025-11-01T14:00:00Z',
      event_type: 'league',
      location: 'Home Field',
    },
  ];
  for (const ev of eventRows) {
    const { data, error } = await adminClient.from('team_events').insert(ev).select().single();
    if (error) throw new Error(`Failed to create team event: ${error.message}`);
    created.teamEventIds.push(data.id);
  }

  // 12. Add more transaction types (expense categories)
  const expenseRows = [
    {
      season_id: seasonId,
      team_season_id: ts.id,
      date: '2025-10-10',
      category: 'TOU',
      title: `${PREFIX}Tournament Registration`,
      amount: -350,
      cleared: true,
      event_id: created.teamEventIds[0],
    },
    {
      season_id: seasonId,
      team_season_id: ts.id,
      date: '2025-10-20',
      category: 'OPE',
      title: `${PREFIX}Team Jerseys`,
      amount: -500,
      cleared: true,
    },
    {
      season_id: seasonId,
      team_season_id: ts.id,
      player_id: created.playerIds[2],
      date: '2025-11-01',
      category: 'SPO',
      title: `${PREFIX}Sponsorship Credit`,
      amount: 250,
      cleared: true,
    },
  ];
  for (const tx of expenseRows) {
    const { data, error } = await adminClient.from('transactions').insert(tx).select().single();
    if (error) throw new Error(`Failed to create expense transaction: ${error.message}`);
    created.transactionIds.push(tx);
  }

  saveState();

  console.log('✓ Test data seeded:', {
    userId,
    clubId: club.id,
    teamId: team.id,
    teamId2: team2.id,
    seasonId,
    teamSeasonId: ts.id,
    players: created.playerIds.length,
    transactions: created.transactionIds.length,
    budgetItems: created.budgetItemIds.length,
    teamEvents: created.teamEventIds.length,
  });

  return created;
}

// ── Cleanup all test data (reverse order of creation) ──
export async function cleanupAll() {
  loadState();
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

    // Team events
    if (created.teamEventIds?.length) {
      await adminClient.from('team_events').delete().in('id', created.teamEventIds);
    }
    // Also clean stray events
    if (created.teamId) {
      await adminClient.from('team_events').delete().eq('team_id', created.teamId);
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

    // Second team
    if (created.teamId2) {
      await adminClient.from('user_roles').delete().eq('team_id', created.teamId2);
      await adminClient.from('teams').delete().eq('id', created.teamId2);
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

    clearState();
    console.log('✓ Test data cleaned up');
  } catch (err) {
    console.error('⚠ Cleanup error (non-fatal):', err.message);
  }
}
