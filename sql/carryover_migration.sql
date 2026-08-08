-- Migration: Add optional prior-season carryover to team_seasons
-- Run this in the Supabase SQL editor.
--
-- A carryover is cash left over from the previous season that the team is
-- rolling forward. It is NOT budget income: income lines are covered by the
-- budget table and never touch the fee, whereas a carryover directly reduces
-- the amount that has to be collected from players. It is therefore subtracted
-- from (expenses + buffer) before the per-player division.

alter table team_seasons
  add column if not exists carryover_amount numeric(10,2) not null default 0;

comment on column team_seasons.carryover_amount is
  'Optional funds carried over from the prior season. Reduces the amount covered by player fees.';

-- Recompute base_fee with the carryover applied. Mirrors computeSeasonFee()
-- in src/utils/feeCalculator.js — the two must stay in step.
create or replace view player_financials as
select
  ps.player_id,
  ps.season_id,
  ps.team_season_id,
  ps.fee_waived,
  case
    when ps.fee_waived then 0
    else coalesce(
      ceil(
        greatest(
          0,
          (ts.total_projected_expenses * (1 + ts.buffer_percent / 100.0))
            - coalesce(ts.carryover_amount, 0)
        ) / nullif(ts.expected_roster_size, 0)
      / 50) * 50, 0)
  end as base_fee,
  coalesce(sum(t.amount) filter (where t.category = 'TMF' and t.cleared), 0) as total_paid,
  coalesce(sum(t.amount) filter (where t.category = 'FUN' and t.cleared and t.waterfall_batch_id is not null), 0) as fundraising,
  coalesce(sum(t.amount) filter (where t.category = 'SPO' and t.cleared and t.waterfall_batch_id is not null), 0) as sponsorships,
  coalesce(sum(t.amount) filter (where t.category = 'CRE' and t.cleared), 0) as credits,
  greatest(0,
    case when ps.fee_waived then 0
    else coalesce(
      ceil(
        greatest(
          0,
          (ts.total_projected_expenses * (1 + ts.buffer_percent / 100.0))
            - coalesce(ts.carryover_amount, 0)
        ) / nullif(ts.expected_roster_size, 0)
      / 50) * 50, 0)
    end
    - coalesce(sum(t.amount) filter (where t.category = 'TMF' and t.cleared), 0)
    - coalesce(sum(t.amount) filter (where t.category = 'FUN' and t.cleared and t.waterfall_batch_id is not null), 0)
    - coalesce(sum(t.amount) filter (where t.category = 'SPO' and t.cleared and t.waterfall_batch_id is not null), 0)
    - coalesce(sum(t.amount) filter (where t.category = 'CRE' and t.cleared), 0)
  ) as remaining_balance
from player_seasons ps
left join team_seasons ts on ts.id = ps.team_season_id
left join transactions t on t.player_id = ps.player_id and t.season_id = ps.season_id
group by ps.player_id, ps.season_id, ps.team_season_id, ps.fee_waived,
         ts.total_projected_expenses, ts.buffer_percent, ts.expected_roster_size,
         ts.carryover_amount;
