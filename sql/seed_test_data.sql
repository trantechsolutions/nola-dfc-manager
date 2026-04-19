-- ============================================================
-- SEED DATA: Comprehensive test scenarios
-- Run on staging Supabase AFTER complete_schema.sql + rls_policies.sql
-- ============================================================

-- ── SEASONS ──
INSERT INTO seasons (id, name) VALUES
  ('2023-2024', '2023-2024 Season'),
  ('2024-2025', '2024-2025 Season'),
  ('2025-2026', '2025-2026 Season'),
  ('2026-2027', '2026-2027 Season')
ON CONFLICT (id) DO NOTHING;

-- ── CLUBS ──
INSERT INTO clubs (id, name, slug) VALUES
  ('c1a00000-0000-0000-0000-000000000001', 'NOLA DFC', 'nola-dfc'),
  ('c1a00000-0000-0000-0000-000000000002', 'Crescent City FC', 'crescent-city-fc')
ON CONFLICT DO NOTHING;

-- ── TEAMS ──
INSERT INTO teams (id, club_id, name, age_group, gender, tier, color_primary, color_secondary, payment_info) VALUES
  -- NOLA DFC teams
  ('a1000000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001', '2015 Boys Elite', 'U11', 'M', 'competitive', '#1e293b', '#ffffff', 'Venmo @nola-dfc-treasurer\nZelle treasurer@noladfc.com\nCash App $noladfc'),
  ('a1000000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001', '2014 Boys Select', 'U12', 'M', 'select', '#2563eb', '#ffffff', 'Venmo @nola-dfc-treasurer'),
  ('a1000000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000001', '2013 Girls Premier', 'U13', 'F', 'competitive', '#dc2626', '#ffffff', 'Zelle girls-treasurer@noladfc.com'),
  ('a1000000-0000-0000-0000-000000000004', 'c1a00000-0000-0000-0000-000000000001', '2016 Coed Academy', 'U10', 'Coed', 'academy', '#059669', '#ffffff', ''),
  -- Crescent City FC teams
  ('a1000000-0000-0000-0000-000000000005', 'c1a00000-0000-0000-0000-000000000002', 'CCFC 2015 Boys', 'U11', 'M', 'competitive', '#7c3aed', '#ffffff', '')
ON CONFLICT DO NOTHING;

-- ── TEAM SEASONS ──
INSERT INTO team_seasons (id, team_id, season_id, is_finalized, base_fee, buffer_percent, expected_roster_size, total_projected_expenses, total_projected_income) VALUES
  -- 2015 Boys Elite
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2024-2025', true, 600, 5, 14, 8400, 0),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '2025-2026', true, 750, 5, 16, 12000, 0),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', '2026-2027', false, 0, 5, 16, 0, 0),
  -- 2014 Boys Select
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', '2025-2026', true, 500, 5, 18, 9000, 0),
  -- 2013 Girls Premier
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000003', '2025-2026', false, 0, 5, 14, 7000, 0),
  -- 2016 Coed Academy (no budget yet — tests empty state)
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000004', '2025-2026', false, 0, 5, 0, 0, 0)
ON CONFLICT DO NOTHING;

-- ── PLAYERS (16 on 2015 Boys Elite) ──
INSERT INTO players (id, club_id, team_id, first_name, last_name, jersey_number, birthdate, gender, status, medical_release, reeplayer_waiver) VALUES
  -- 2015 Boys Elite — full roster
  ('d1000000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Callen', 'Tran', '3', '2015-05-18', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Maxx', 'Fejka', '10', '2015-02-14', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Byron', 'Lopez', '7', '2015-08-22', 'M', 'active', true, false),
  ('d1000000-0000-0000-0000-000000000004', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Levi', 'Martinez', '9', '2015-11-03', 'M', 'active', false, true),
  ('d1000000-0000-0000-0000-000000000005', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Johan', 'Garcia', '14', '2015-03-30', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000006', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Liam', 'Leon', '5', '2015-07-12', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000007', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Lucas', 'Rodriguez', '11', '2015-01-25', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000008', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Mateo', 'Rodriguez', '8', '2015-01-25', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000009', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Kayden', 'Espana', '4', '2015-06-08', 'M', 'active', true, false),
  ('d1000000-0000-0000-0000-000000000010', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Rene', 'Venegas', '6', '2015-04-17', 'M', 'active', false, false),
  ('d1000000-0000-0000-0000-000000000011', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Jake', 'Allesandro', '13', '2015-09-05', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000012', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Emilio', 'Correa', '2', '2015-12-20', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000013', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Brecht', 'Galiano', '15', '2015-10-11', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000014', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Angel', 'Aleman', '17', '2015-05-02', 'M', 'active', true, true),
  -- Archived player (tests archive filter)
  ('d1000000-0000-0000-0000-000000000015', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Marcus', 'Retired', '99', '2015-01-01', 'M', 'archived', false, false),
  -- Prospect (tests prospect status)
  ('d1000000-0000-0000-0000-000000000016', 'c1a00000-0000-0000-0000-000000000001', NULL, 'Diego', 'Prospect', NULL, '2016-03-15', 'M', 'prospect', false, false),

  -- 2014 Boys Select — smaller roster
  ('d1000000-0000-0000-0000-000000000020', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Noah', 'Williams', '1', '2014-04-10', 'M', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000021', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Ethan', 'Brown', '22', '2014-08-15', 'M', 'active', false, false),

  -- 2013 Girls Premier
  ('d1000000-0000-0000-0000-000000000030', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'Sofia', 'Martinez', '10', '2013-02-28', 'F', 'active', true, true),
  ('d1000000-0000-0000-0000-000000000031', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'Isabella', 'Garcia', '7', '2013-06-14', 'F', 'active', true, false),
  ('d1000000-0000-0000-0000-000000000032', 'c1a00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'Emma', 'Johnson', '3', '2013-11-22', 'F', 'active', false, false),

  -- Crescent City FC (separate club — tests data isolation)
  ('d1000000-0000-0000-0000-000000000040', 'c1a00000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 'James', 'OtherClub', '1', '2015-03-10', 'M', 'active', true, true)
ON CONFLICT DO NOTHING;

-- ── GUARDIANS (parents + contact info) ──
INSERT INTO guardians (player_id, name, email, phone) VALUES
  -- Callen's parents
  ('d1000000-0000-0000-0000-000000000001', 'Ashley Tran', 'ashtran2006@yahoo.com', '(504) 231-6889'),
  ('d1000000-0000-0000-0000-000000000001', 'Jonathan Tran', 'jtran@tulane.edu', '(504) 231-6945'),
  -- Maxx's parent
  ('d1000000-0000-0000-0000-000000000002', 'Erika Fejka', 'erika.fejka@gmail.com', '(504) 555-0102'),
  -- Byron's parent
  ('d1000000-0000-0000-0000-000000000003', 'Maria Lopez', 'maria.lopez@email.com', '(504) 555-0103'),
  -- Levi's parent (no email — tests missing email scenario)
  ('d1000000-0000-0000-0000-000000000004', 'Carlos Martinez', NULL, '(504) 555-0104'),
  -- Johan's parent
  ('d1000000-0000-0000-0000-000000000005', 'Ana Garcia', 'ana.garcia@email.com', '(504) 555-0105'),
  -- Liam's parent
  ('d1000000-0000-0000-0000-000000000006', 'Mike Leon', 'mike.leon@email.com', NULL),
  -- Lucas & Mateo's parent (siblings — same guardian, tests multi-child view)
  ('d1000000-0000-0000-0000-000000000007', 'Carmen Rodriguez', 'carmen.rodriguez@email.com', '(504) 555-0107'),
  ('d1000000-0000-0000-0000-000000000008', 'Carmen Rodriguez', 'carmen.rodriguez@email.com', '(504) 555-0107'),
  -- Girls team guardians
  ('d1000000-0000-0000-0000-000000000030', 'Laura Martinez', 'laura.m@email.com', '(504) 555-0130'),
  ('d1000000-0000-0000-0000-000000000031', 'Rosa Garcia', 'rosa.g@email.com', '(504) 555-0131')
ON CONFLICT DO NOTHING;

-- ── PLAYER SEASONS (enrollment) ──
INSERT INTO player_seasons (player_id, season_id, team_season_id, fee_waived, fundraiser_buyin, status) VALUES
  -- 2015 Boys Elite — 2025-2026 (current season)
  ('d1000000-0000-0000-0000-000000000001', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000002', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000003', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000004', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, false, 'active'),
  ('d1000000-0000-0000-0000-000000000005', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000006', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000007', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000008', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, false, 'active'),
  ('d1000000-0000-0000-0000-000000000009', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000010', '2025-2026', 'b1000000-0000-0000-0000-000000000002', true, false, 'active'),  -- Fee waived
  ('d1000000-0000-0000-0000-000000000011', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000012', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000013', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000014', '2025-2026', 'b1000000-0000-0000-0000-000000000002', false, false, 'active'),
  -- 2015 Boys also had a previous season (tests multi-season)
  ('d1000000-0000-0000-0000-000000000001', '2024-2025', 'b1000000-0000-0000-0000-000000000001', false, true, 'active'),
  ('d1000000-0000-0000-0000-000000000002', '2024-2025', 'b1000000-0000-0000-0000-000000000001', false, true, 'active'),
  -- 2014 Boys Select
  ('d1000000-0000-0000-0000-000000000020', '2025-2026', 'b1000000-0000-0000-0000-000000000004', false, false, 'active'),
  ('d1000000-0000-0000-0000-000000000021', '2025-2026', 'b1000000-0000-0000-0000-000000000004', false, false, 'active'),
  -- 2013 Girls Premier
  ('d1000000-0000-0000-0000-000000000030', '2025-2026', 'b1000000-0000-0000-0000-000000000005', false, false, 'active'),
  ('d1000000-0000-0000-0000-000000000031', '2025-2026', 'b1000000-0000-0000-0000-000000000005', false, false, 'active'),
  ('d1000000-0000-0000-0000-000000000032', '2025-2026', 'b1000000-0000-0000-0000-000000000005', true, false, 'active')  -- Fee waived
ON CONFLICT DO NOTHING;

-- ── BUDGET ITEMS (2015 Boys Elite — 2025-2026) ──
INSERT INTO budget_items (season_id, team_season_id, category, label, income, expenses_fall, expenses_spring) VALUES
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'TOU', 'Fall Tournaments', 0, 2500, 0),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'TOU', 'Spring Tournaments', 0, 0, 3000),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'LEA', 'PSL League Fees', 0, 800, 800),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'LEA', 'Referee Fees', 0, 400, 600),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'OPE', 'Uniforms & Equipment', 0, 1500, 0),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'OPE', 'ReePlayer Camera', 0, 1200, 0),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'OPE', 'Team Events & Parties', 0, 500, 600),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'FRI', 'Scrimmage Referee Fees', 0, 200, 200)
ON CONFLICT DO NOTHING;

-- ── TRANSACTIONS (various scenarios) ──
INSERT INTO transactions (season_id, team_season_id, player_id, date, amount, type, category, title, cleared, notes) VALUES
  -- Team fee payments (TMF) — various states
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '2025-08-01', 200, 'Zelle', 'TMF', 'Fall Payment 1', true, 'First installment'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '2025-09-15', 200, 'Zelle', 'TMF', 'Fall Payment 2', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '2025-10-01', 350, 'Venmo', 'TMF', 'Remaining Balance', true, 'Paid in full'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', '2025-08-05', 750, 'Venmo', 'TMF', 'Full Season Payment', true, 'Paid in full upfront'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003', '2025-08-10', 200, 'Zelle', 'TMF', 'Partial Payment', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000005', '2025-08-15', 163, 'Zelle', 'TMF', 'Payment Plan 1/4', true, 'Monthly plan'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000005', '2025-09-15', 163, 'Zelle', 'TMF', 'Payment Plan 2/4', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000006', '2025-08-20', 750, 'Cash', 'TMF', 'Full Payment (Cash)', true, NULL),
  -- Pending payment (not cleared — tests pending state)
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000009', '2025-09-01', 200, 'Venmo', 'TMF', 'Payment - Pending Clearance', false, 'Awaiting confirmation'),

  -- Sponsorships (SPO)
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '2025-07-15', 1000, 'Zelle', 'SPO', 'Bobby Hebert Cajun Cannon Sponsorship', true, 'Procured by Erika Fejka'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '2025-08-01', 2000, 'Zelle', 'SPO', 'Da Swamp Trampoline Park', true, 'Procured by Jonathan/Ashley Tran'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '2025-10-25', 250, 'Check', 'SPO', 'Jersey Mikes Subs', true, NULL),

  -- Fundraising (FUN)
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', '2025-09-17', 200, 'Zelle', 'FUN', 'Alcohol Raffle Fundraiser', true, 'Profits from 24/25 Alcohol Raffle'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003', '2025-09-17', 130, 'Zelle', 'FUN', 'Alcohol Raffle Fundraiser', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000011', '2025-09-17', 535, 'Zelle', 'FUN', 'Alcohol Raffle Fundraiser', true, NULL),

  -- Expenses (negative amounts)
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-07-15', -660, 'Venmo', 'TOU', 'Fairhope Soccer Club Halloween Blast', true, 'Tournament registration'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-07-23', -450, 'Venmo', 'TOU', 'Deep South Challenge Tournament', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-08-14', -350, 'Venmo', 'TOU', 'Gobbler Cup', true, 'Houma Terrebonne Tournament'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-07-12', -1686, 'Venmo', 'OPE', 'ReePlayer Annual Plan', true, 'AI camera and accessories'),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-08-19', -142, 'Venmo', 'OPE', 'Team Tent (Amazon)', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-08-21', -227, 'Venmo', 'OPE', 'Sponsorship Banner (Quattro)', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-08-18', -45, 'Cash', 'FRI', 'Referee Fees vs DFC 2014B', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-10-19', -45, 'Cash', 'FRI', 'CFC 14B Scrimmage Refs', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-02-17', -65, 'Cash', 'LEA', 'PSL Hammond Referee Fees', true, NULL),
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', NULL, '2025-02-17', -120, 'Cash', 'LEA', 'PSL Baton Rouge Referee Fees', true, NULL),

  -- Previous season transactions (tests multi-season filtering)
  ('2024-2025', 'b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', '2024-08-01', 600, 'Zelle', 'TMF', '2024-2025 Full Payment', true, NULL),
  ('2024-2025', 'b1000000-0000-0000-0000-000000000001', NULL, '2024-09-15', -400, 'Venmo', 'TOU', 'Fall 2024 Tournament', true, NULL),

  -- Credits (CRE)
  ('2025-2026', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000014', '2025-09-01', 50, 'Zelle', 'CRE', 'Referral Credit', true, 'Brought a new player')
ON CONFLICT DO NOTHING;

-- ── TEAM EVENTS ──
INSERT INTO team_events (team_id, uid, title, description, location, event_date, event_type) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'evt-fairhope-2025', 'Fairhope Halloween Blast', '3-game tournament', 'Fairhope, AL', '2025-10-25T09:00:00Z', 'tournament'),
  ('a1000000-0000-0000-0000-000000000001', 'evt-gobbler-2025', 'Gobbler Cup XXXIV', '3-game tournament', 'Houma, LA', '2025-11-22T08:00:00Z', 'tournament'),
  ('a1000000-0000-0000-0000-000000000001', 'evt-psl-1', 'PSL vs Hammond FC', 'League match', 'City Park, NOLA', '2025-09-14T14:00:00Z', 'league'),
  ('a1000000-0000-0000-0000-000000000001', 'evt-psl-2', 'PSL vs Baton Rouge United', 'League match', 'Baton Rouge', '2025-09-28T10:00:00Z', 'league'),
  ('a1000000-0000-0000-0000-000000000001', 'evt-friendly-1', 'Scrimmage vs SYSC 2014B', 'Friendly match', 'Slidell', '2025-10-12T09:00:00Z', 'friendly'),
  ('a1000000-0000-0000-0000-000000000001', 'evt-practice-1', 'Tuesday Practice', 'Regular practice', 'City Park Field 3', '2025-09-09T17:30:00Z', 'practice'),
  ('a1000000-0000-0000-0000-000000000001', 'evt-practice-2', 'Thursday Practice', 'Regular practice', 'City Park Field 3', '2025-09-11T17:30:00Z', 'practice')
ON CONFLICT DO NOTHING;

-- ── CUSTOM CATEGORIES ──
INSERT INTO custom_categories (club_id, code, label, description, color, flow, sort_order) VALUES
  ('c1a00000-0000-0000-0000-000000000001', 'PHO', 'Photography', 'Team and individual photos', 'text-pink-600', 'expense', 1),
  ('c1a00000-0000-0000-0000-000000000001', 'GEA', 'Gear Sales', 'Team gear/merchandise sales', 'text-teal-600', 'income', 2)
ON CONFLICT DO NOTHING;


-- ============================================================
-- SCENARIOS COVERED:
--
-- 1. Multi-club (NOLA DFC + Crescent City FC) — tests data isolation
-- 2. Multi-team (4 teams in NOLA DFC) — tests team switching
-- 3. Multi-season (2024-2025, 2025-2026, 2026-2027) — tests season filtering
-- 4. Finalized vs draft budgets
-- 5. Full roster (14 active + 1 archived + 1 prospect)
-- 6. Fee waived player (Rene Venegas)
-- 7. Fully paid player (Callen Tran — 3 payments totaling $750)
-- 8. Partially paid player (Byron Lopez — $200 of $750)
-- 9. Unpaid players (multiple)
-- 10. Pending transaction (not cleared)
-- 11. Sponsorships from different sources
-- 12. Fundraising credits per player
-- 13. Mixed expense categories (TOU, OPE, LEA, FRI)
-- 14. Sibling players (Lucas & Mateo Rodriguez — same guardian)
-- 15. Guardian with no email (Carlos Martinez)
-- 16. Guardian with no phone (Mike Leon)
-- 17. Boys team, Girls team, Coed team — tests gender filtering
-- 18. Various payment methods (Venmo, Zelle, Cash, Check)
-- 19. Previous season data — tests history
-- 20. Team events (tournaments, league, friendly, practice)
-- 21. Custom transaction categories
-- 22. Empty team (Coed Academy — no budget, no players enrolled)
-- 23. Player credit (CRE category)
-- 24. Prospect player (no team assigned)
-- 25. Different tiers (competitive, select, academy)
-- ============================================================
