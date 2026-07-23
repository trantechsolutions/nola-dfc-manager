-- Fixes: a player shows "$0.00" fee, "Budget in Draft", and their Medical
-- Release form appears to keep re-asking for a signature even after it's
-- been submitted (e.g. Matthew Schmidt, DFC 2014/2015B Black).
--
-- Root cause: the player's player_seasons row is not linked to the team's
-- current team_season, either because the row is missing entirely, or (the
-- more common case -- confirmed on Matthew, see step 4) it exists but
-- team_season_id is NULL or points at a stale team_season. Either way:
--   1. player_financials (complete_schema.sql) computes base_fee by joining
--      team_seasons ON team_seasons.id = player_seasons.team_season_id, so
--      an unlinked row means the join finds nothing -> base_fee/balance
--      compute as 0 and the frontend shows "Budget in Draft" regardless of
--      whether the team's budget is actually finalized.
--   2. playerService.setSeasonCompliance() is a plain
--      UPDATE player_seasons SET medical_release = true
--      WHERE player_id = ... AND season_id = ...
--      This still succeeds against an unlinked row (it doesn't need
--      team_season_id), which is why compliance can already show COMPLETE
--      while the fee is still stuck at $0 -- they fail independently.
--
-- This can happen when a player is added to a team (players.team_id) before
-- that team ever has a team_seasons row for the season (e.g. before the
-- budget was first drafted), and nothing later backfills the enrollment or
-- the link once the team_seasons row is created.
--
-- Run the diagnostic SELECTs first (1 and 4) and review the rows before
-- running the INSERT/UPDATE statements below.

-- 1. Diagnostic: active players on a team roster with no player_seasons row
--    for that team's season(s).
select p.id as player_id, p.first_name, p.last_name, t.name as team_name,
       ts.id as team_season_id, ts.season_id, ts.is_finalized
from players p
join teams t on t.id = p.team_id
join team_seasons ts on ts.team_id = p.team_id
left join player_seasons ps on ps.player_id = p.id and ps.season_id = ts.season_id
where ps.id is null
  and p.status = 'active'
order by t.name, p.last_name;

begin;

-- 2. Backfill the missing enrollment rows found above (idempotent: only
--    inserts where no row exists yet, and only for active players).
insert into player_seasons (player_id, season_id, team_season_id, fee_waived, status)
select p.id, ts.season_id, ts.id, false, 'active'
from players p
join teams t on t.id = p.team_id
join team_seasons ts on ts.team_id = p.team_id
left join player_seasons ps on ps.player_id = p.id and ps.season_id = ts.season_id
where ps.id is null
  and p.status = 'active'
on conflict (player_id, season_id) do nothing;

-- 3. Restore medical compliance for anyone whose setSeasonCompliance() call
--    silently no-op'd against a then-missing row, but who already has an
--    uploaded/verified medical_release document or a completed medical form
--    on file.
update player_seasons ps
set medical_release = true
where ps.medical_release = false
  and (
    exists (
      select 1 from documents d
      where d.player_id = ps.player_id
        and d.season_id = ps.season_id
        and d.doc_type = 'medical_release'
        and d.status in ('uploaded', 'verified')
    )
    or exists (
      select 1 from medical_forms mf
      where mf.player_id = ps.player_id
        and mf.season_id = ps.season_id
    )
  );

-- 4. Diagnostic: player_seasons rows that already exist but are unlinked
--    from their player's CURRENT team's team_season for that season --
--    this is the case that left Matthew's fee at $0 after steps 1-3.
--    (team_seasons has UNIQUE(team_id, season_id), so this join is 1:1.)
select ps.player_id, p.first_name, p.last_name, p.team_id, t.name as team_name,
       ps.season_id, ps.team_season_id as currently_linked_to, ts.id as should_be
from player_seasons ps
join players p on p.id = ps.player_id
join teams t on t.id = p.team_id
join team_seasons ts on ts.team_id = p.team_id and ts.season_id = ps.season_id
where ps.team_season_id is distinct from ts.id
  and p.status = 'active';

-- 5. Relink those rows to the correct team_season so base_fee resolves.
update player_seasons ps
set team_season_id = ts.id
from players p, team_seasons ts
where ps.player_id = p.id
  and ts.team_id = p.team_id
  and ts.season_id = ps.season_id
  and ps.team_season_id is distinct from ts.id
  and p.status = 'active';

commit;
