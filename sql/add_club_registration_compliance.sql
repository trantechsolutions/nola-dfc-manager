-- Adds a third per-season compliance flag: club registration. A player must
-- register with the club before being finalized on the roster, same as the
-- medical release and ReePlayer waiver. Admin-set only (no parent form, like
-- reeplayer_waiver) — toggled from RosterManagement / PlayerModal.
--
-- Run once. Depends on sql/season_compliance_migration.sql already having
-- moved medical_release/reeplayer_waiver onto player_seasons.

begin;

alter table player_seasons
  add column if not exists club_registration boolean default false;

-- Repoint seasonal_roster at the new flag. Drop-and-recreate: CREATE OR
-- REPLACE VIEW cannot add a column in the middle of the existing list without
-- reordering, and this view's column order is relied on elsewhere.
drop view if exists seasonal_roster;
create view seasonal_roster as
select
  p.id as player_id,
  p.first_name, p.last_name, p.jersey_number, p.birthdate, p.gender,
  p.status as player_status,
  ps.medical_release, ps.reeplayer_waiver, ps.club_registration,
  p.club_id, p.team_id,
  ps.id as season_profile_id, ps.season_id, ps.team_season_id,
  ps.fee_waived, ps.fundraiser_buyin, ps.status as season_status
from players p
join player_seasons ps on p.id = ps.player_id;

commit;
