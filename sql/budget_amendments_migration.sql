-- Migration: Add budget_amendments table
-- Run this in the Supabase SQL editor.

create table if not exists budget_amendments (
  id               uuid default gen_random_uuid() primary key,
  team_season_id   uuid references team_seasons(id) on delete cascade not null,
  amendment_number integer not null default 1,
  reason           text,
  amended_total_expenses numeric(10,2) not null default 0,
  amended_total_income   numeric(10,2) not null default 0,
  amended_base_fee       numeric(10,2) not null default 0,
  amended_at       timestamptz not null default now(),
  amended_by       uuid references auth.users(id)
);

-- Auto-increment amendment_number per team_season
create or replace function set_amendment_number()
returns trigger as $$
begin
  select coalesce(max(amendment_number), 0) + 1
  into new.amendment_number
  from budget_amendments
  where team_season_id = new.team_season_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_amendment_number_trigger on budget_amendments;
create trigger set_amendment_number_trigger
  before insert on budget_amendments
  for each row execute function set_amendment_number();

-- RLS: allow authenticated users to read/insert for their club's teams
alter table budget_amendments enable row level security;

create policy "authenticated read amendments"
  on budget_amendments for select
  to authenticated
  using (true);

create policy "authenticated insert amendments"
  on budget_amendments for insert
  to authenticated
  with check (true);
