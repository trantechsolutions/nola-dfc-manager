-- Make medical release + ReePlayer waiver compliance PER-SEASON.
--
-- Before: players.medical_release / players.reeplayer_waiver were global booleans
-- and medical_forms held one row per player, so a waiver checked once counted for
-- every season. This moves the compliance flags onto player_seasons and re-keys
-- medical_forms to (player_id, season_id) so each season needs its own waiver.
-- Existing compliance is backfilled onto the active season (2025-2026) so the
-- current roster's status is preserved and every other season starts fresh.
--
-- Run once. Depends on the `seasons`/`player_seasons` tables and the
-- `seasonal_roster` view from complete_schema.sql. If your active season is not
-- 2025-2026, change the two '2025-2026' literals below before running.

begin;

-- 1. Per-season compliance flags on player_seasons.
alter table player_seasons
  add column if not exists medical_release boolean default false,
  add column if not exists reeplayer_waiver boolean default false;

-- 2. Backfill: copy each player's current global flag onto the ACTIVE season
--    (the one the app displays). Every other season stays false so it requires
--    a fresh waiver. Only players enrolled in this season are affected.
update player_seasons ps
set medical_release = p.medical_release,
    reeplayer_waiver = p.reeplayer_waiver
from players p
where ps.player_id = p.id
  and ps.season_id = '2025-2026';

-- 3. Re-key medical_forms to (player_id, season_id) so each year is its own record.
alter table medical_forms
  add column if not exists season_id text references seasons(id);

-- Tie each existing single-row form to the active season (the season it was
-- completed for). A later season's form becomes a separate row.
update medical_forms mf
set season_id = '2025-2026'
where mf.season_id is null;

-- Safety net: drop any form still unassigned (only if the active season is absent).
delete from medical_forms where season_id is null;

alter table medical_forms alter column season_id set not null;
alter table medical_forms drop constraint if exists medical_forms_pkey;
alter table medical_forms add primary key (player_id, season_id);

-- 4. Repoint seasonal_roster at the per-season flags BEFORE dropping the columns.
--    Drop-and-recreate: CREATE OR REPLACE VIEW cannot rename/reorder columns, and
--    this view's first column is player_id (p.id aliased), which the app reads.
drop view if exists seasonal_roster;
create view seasonal_roster as
select
  p.id as player_id,
  p.first_name, p.last_name, p.jersey_number, p.birthdate, p.gender,
  p.status as player_status,
  ps.medical_release, ps.reeplayer_waiver,
  p.club_id, p.team_id,
  ps.id as season_profile_id, ps.season_id, ps.team_season_id,
  ps.fee_waived, ps.fundraiser_buyin, ps.status as season_status
from players p
join player_seasons ps on p.id = ps.player_id;

-- 5. Clean cutover: drop the old global columns so there is a single source of truth.
alter table players drop column if exists medical_release;
alter table players drop column if exists reeplayer_waiver;

commit;
