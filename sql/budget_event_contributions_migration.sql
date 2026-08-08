-- Migration: track what each event contributed to the season budget.
-- Run this in the Supabase SQL editor.
--
-- "Add to budget" on an event sums its expenses per category and moves the
-- matching budget line. Without a record of what a given event already put in,
-- a second push adds the whole total again and every player is billed twice for
-- the same tournament. One row per (team_season, event, category, half) holds
-- the amount currently applied, so a re-push moves the line by the DELTA and
-- corrections — an expense edited, deleted, recategorised, or the event moved
-- across the new year — flow back out of the budget instead of stranding money.

create table if not exists budget_event_contributions (
  id              uuid default gen_random_uuid() primary key,
  team_season_id  uuid not null references team_seasons(id) on delete cascade,
  event_id        uuid not null references team_events(id) on delete cascade,
  category        text not null,
  half            text not null check (half in ('fall', 'spring')),
  -- The line this contribution is folded into. Nulled rather than cascaded if
  -- the treasurer deletes the line by hand: the next push then rebuilds it
  -- instead of failing on a dangling reference.
  budget_item_id  uuid references budget_items(id) on delete set null,
  applied_amount  numeric(10,2) not null default 0,
  applied_at      timestamptz not null default now(),
  applied_by      uuid references auth.users(id),
  -- Set when the push had to be recorded as an amendment because the budget was
  -- already finalized, so the budget screen can explain where a line came from.
  amendment_id    uuid references budget_amendments(id) on delete set null,
  unique (team_season_id, event_id, category, half)
);

create index if not exists budget_event_contributions_event_idx
  on budget_event_contributions (team_season_id, event_id);

-- ── RLS: same team scoping as budget_items ──
alter table budget_event_contributions enable row level security;

drop policy if exists "budget_event_contributions_select" on budget_event_contributions;
create policy "budget_event_contributions_select" on budget_event_contributions for select to authenticated
  using (
    is_super_admin()
    or team_season_id in (select id from team_seasons where team_id in (select user_team_ids()))
  );

drop policy if exists "budget_event_contributions_insert" on budget_event_contributions;
create policy "budget_event_contributions_insert" on budget_event_contributions for insert to authenticated
  with check (
    is_super_admin()
    or team_season_id in (select id from team_seasons where team_id in (select user_team_ids()))
  );

drop policy if exists "budget_event_contributions_update" on budget_event_contributions;
create policy "budget_event_contributions_update" on budget_event_contributions for update to authenticated
  using (
    is_super_admin()
    or team_season_id in (select id from team_seasons where team_id in (select user_team_ids()))
  );

drop policy if exists "budget_event_contributions_delete" on budget_event_contributions;
create policy "budget_event_contributions_delete" on budget_event_contributions for delete to authenticated
  using (
    is_super_admin()
    or team_season_id in (select id from team_seasons where team_id in (select user_team_ids()))
  );
