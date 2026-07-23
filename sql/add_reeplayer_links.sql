-- Adds team-level ReePlayer links.
--
-- reeplayer_player_link: sign-up URL shown to parents so they can create the
--   player's ReePlayer account; hidden once staff confirms the account via
--   the existing per-season "ReePlayer Waiver" toggle (players.reeplayer_waiver
--   / player_seasons.reeplayer_waiver).
-- reeplayer_fan_link: the team's ReePlayer fan page, always shown to parents.

alter table teams
  add column if not exists reeplayer_player_link text default '',
  add column if not exists reeplayer_fan_link text default '';
