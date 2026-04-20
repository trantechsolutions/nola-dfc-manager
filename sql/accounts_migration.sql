-- Migration: Add accounts table + wire transactions to accounts (non-breaking)
-- Run this in the Supabase SQL editor.
--
-- Phase 1 of the payment-type refactor:
--   - Introduces a per-team accounts table with three "holding" buckets:
--     digital, bank, cash (plus 'none' for excluded entries like credits).
--   - Adds nullable account_id / transfer_from_account_id / transfer_to_account_id
--     columns to transactions. Legacy type/transfer_from/transfer_to strings
--     are kept in place until the UI fully migrates (Phase 4).
--   - Seeds one account per distinct existing tx.type value per team, then
--     backfills the new account columns so nothing changes behaviorally.

-- ── 1. accounts table ──
create table if not exists accounts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id),
  name        text not null,
  holding     text not null check (holding in ('digital', 'bank', 'cash', 'none')),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (team_id, name)
);

create index if not exists accounts_team_id_idx on accounts(team_id);

alter table accounts enable row level security;

create policy "accounts_select" on accounts for select to authenticated
  using (is_super_admin() or team_id in (select user_team_ids()));
create policy "accounts_insert" on accounts for insert to authenticated
  with check (is_super_admin() or team_id in (select user_team_ids()));
create policy "accounts_update" on accounts for update to authenticated
  using (is_super_admin() or team_id in (select user_team_ids()));
create policy "accounts_delete" on accounts for delete to authenticated
  using (is_super_admin() or team_id in (select user_team_ids()));

-- ── 2. new columns on transactions (nullable, non-cascade FK) ──
alter table transactions
  add column if not exists account_id              uuid references accounts(id),
  add column if not exists transfer_from_account_id uuid references accounts(id),
  add column if not exists transfer_to_account_id   uuid references accounts(id);

create index if not exists transactions_account_id_idx               on transactions(account_id);
create index if not exists transactions_transfer_from_account_id_idx on transactions(transfer_from_account_id);
create index if not exists transactions_transfer_to_account_id_idx   on transactions(transfer_to_account_id);

-- ── 3. seed accounts from the distinct type strings each team actually used ──
-- Maps legacy strings to holding buckets:
--   'Venmo', 'Zeffy'                                        -> digital
--   'Zelle', 'Check', 'ACH', 'Bank Transfer', 'Card'        -> bank
--   'Cash'                                                  -> cash
--   'Other' / NULL / anything else                          -> none (account named 'Uncategorized')
with tx_types as (
  select distinct ts.team_id, coalesce(nullif(trim(t.type), ''), 'Other') as raw_type
  from transactions t
  join team_seasons ts on ts.id = t.team_season_id
  where t.team_season_id is not null
  union
  select distinct ts.team_id, trim(t.transfer_from) as raw_type
  from transactions t
  join team_seasons ts on ts.id = t.team_season_id
  where t.category = 'TRF' and t.transfer_from is not null and trim(t.transfer_from) <> ''
  union
  select distinct ts.team_id, trim(t.transfer_to) as raw_type
  from transactions t
  join team_seasons ts on ts.id = t.team_season_id
  where t.category = 'TRF' and t.transfer_to is not null and trim(t.transfer_to) <> ''
),
mapped as (
  select
    team_id,
    case
      when raw_type in ('Venmo', 'Zeffy') then raw_type
      when raw_type in ('Zelle', 'Check', 'ACH', 'Bank Transfer', 'Card') then raw_type
      when raw_type = 'Cash' then 'Cash'
      else 'Uncategorized'
    end as name,
    case
      when raw_type in ('Venmo', 'Zeffy') then 'digital'
      when raw_type in ('Zelle', 'Check', 'ACH', 'Bank Transfer', 'Card') then 'bank'
      when raw_type = 'Cash' then 'cash'
      else 'none'
    end as holding
  from tx_types
)
insert into accounts (team_id, name, holding, sort_order)
select distinct team_id, name, holding,
  case holding when 'bank' then 10 when 'digital' then 20 when 'cash' then 30 else 40 end
from mapped
on conflict (team_id, name) do nothing;

-- ── 4. backfill transactions.account_id from existing tx.type ──
update transactions t
set account_id = a.id
from team_seasons ts, accounts a
where t.team_season_id = ts.id
  and a.team_id = ts.team_id
  and t.account_id is null
  and t.category <> 'TRF'
  and a.name = case
    when coalesce(nullif(trim(t.type), ''), 'Other') in ('Venmo', 'Zeffy', 'Zelle', 'Check', 'ACH', 'Bank Transfer', 'Card', 'Cash')
      then trim(t.type)
    else 'Uncategorized'
  end;

-- ── 5. backfill transfer_from_account_id / transfer_to_account_id for TRF rows ──
update transactions t
set transfer_from_account_id = a.id
from team_seasons ts, accounts a
where t.team_season_id = ts.id
  and a.team_id = ts.team_id
  and t.transfer_from_account_id is null
  and t.category = 'TRF'
  and t.transfer_from is not null
  and trim(t.transfer_from) <> ''
  and a.name = case
    when trim(t.transfer_from) in ('Venmo', 'Zeffy', 'Zelle', 'Check', 'ACH', 'Bank Transfer', 'Card', 'Cash')
      then trim(t.transfer_from)
    else 'Uncategorized'
  end;

update transactions t
set transfer_to_account_id = a.id
from team_seasons ts, accounts a
where t.team_season_id = ts.id
  and a.team_id = ts.team_id
  and t.transfer_to_account_id is null
  and t.category = 'TRF'
  and t.transfer_to is not null
  and trim(t.transfer_to) <> ''
  and a.name = case
    when trim(t.transfer_to) in ('Venmo', 'Zeffy', 'Zelle', 'Check', 'ACH', 'Bank Transfer', 'Card', 'Cash')
      then trim(t.transfer_to)
    else 'Uncategorized'
  end;

-- ── Reconciliation checks (run manually after migration) ──
-- Every non-CRE, non-TRF transaction with a team_season should have an account_id:
--   select count(*) from transactions t
--   join team_seasons ts on ts.id = t.team_season_id
--   where t.account_id is null and t.category not in ('CRE', 'TRF');
--
-- Every TRF transaction should have both transfer_*_account_id populated:
--   select count(*) from transactions
--   where category = 'TRF'
--     and (transfer_from_account_id is null or transfer_to_account_id is null);
