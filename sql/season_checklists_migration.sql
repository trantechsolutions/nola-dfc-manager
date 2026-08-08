-- Season Checklists: admin-authored task lists that parents complete, scoped to
-- one (team, season) pair.
--
-- Two tables:
--   season_checklists    — the template. One row per team per season, so every
--                          season starts blank; ChecklistManager's "Clone" copies
--                          the `items` array forward from any prior list.
--   checklist_responses  — one row per (checklist, player, item). Parents write
--                          their own rows; staff verify them.
--
-- Items live in a jsonb array rather than their own table because they are edited
-- as a whole document (add/remove/reorder in one Save) and only ever read for the
-- checklist they belong to — the same reasoning as team_evaluation_rubrics.sections.
-- A consequence worth knowing: adding a new per-item field is a code change only,
-- never a migration, so this is the ONLY checklist migration to run.
--
-- SEASON COMPLIANCE. A player is in compliance for a season when every REQUIRED
-- item on that season's checklist is satisfied (isPlayerCompliant in
-- src/utils/checklist.js). A season with no checklist has nothing outstanding and
-- so reads as compliant — a new season should not paint the roster red before an
-- admin has authored anything. The legacy per-season flags on player_seasons
-- (medical_release / reeplayer_waiver / club_registration) are NOT dropped:
-- medical_release stays the backing store for the linked medical form below.
--
-- Run once. Depends on teams / seasons / players / documents from
-- complete_schema.sql and the RLS helper functions in rls_policies.sql.

begin;

-- ── 1. CHECKLIST TEMPLATE ──
create table if not exists season_checklists (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  season_id   text not null references seasons(id),
  title       text,
  -- items shape:
  -- [
  --   {
  --     "key": "uniform_order",           -- stable; responses key off this
  --     "label": "Order your uniform",
  --     "description": "Order through the club store.",
  --     "type": "check",                  -- check | ack | text | date | link | file
  --     "url": "https://…",               -- link items only
  --     "audience": "parent",             -- parent | admin (admin = staff-tracked)
  --     "required": true,                 -- required items define season compliance
  --     "requiresVerification": false,    -- staff must confirm before it counts
  --     "dueDate": "2026-08-15",          -- or null
  --     "linkedForm": null                -- or "medical_release"
  --   }
  -- ]
  --
  -- `linkedForm` wires an item to an in-app form that completes it. Such an item
  -- is NEVER ticked by hand and writes no meaningful response row: its completion
  -- is read from whatever the form already records — for "medical_release" that is
  -- player_seasons.medical_release, set by MedicalReleaseForm. Deriving rather
  -- than copying means a player who completed the form before the item existed
  -- still reads as done, and the two records cannot drift apart.
  -- See LINKED_FORM_KEYS in src/utils/checklist.js for the recognised values.
  --
  -- Adding a field here needs no migration — it lives inside this jsonb column,
  -- and normalizeItems() in src/utils/checklist.js defaults it for older rows.
  items       jsonb not null default '[]',
  -- Draft lists stay invisible to parents so a half-built list is not published
  -- by accident. Enforced in the RLS SELECT policy below, not just the UI.
  is_published boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (team_id, season_id)
);

-- ── 2. PER-PLAYER RESPONSES ──
create table if not exists checklist_responses (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references season_checklists(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  item_key      text not null,
  completed     boolean not null default false,
  -- Free-form answer for text/date items. File items instead point at a row in
  -- `documents` so uploads reuse the existing storage bucket and RLS.
  value         text,
  document_id   uuid references documents(id) on delete set null,
  completed_at  timestamptz,
  completed_by  uuid,
  verified      boolean not null default false,
  verified_at   timestamptz,
  verified_by   uuid,
  updated_at    timestamptz not null default now(),
  unique (checklist_id, player_id, item_key)
);

create index if not exists checklist_responses_checklist_idx on checklist_responses (checklist_id);
create index if not exists checklist_responses_player_idx on checklist_responses (player_id);

-- ── 3. updated_at triggers ──
create or replace function set_checklist_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists season_checklists_updated_at on season_checklists;
create trigger season_checklists_updated_at
  before update on season_checklists
  for each row execute function set_checklist_updated_at();

drop trigger if exists checklist_responses_updated_at on checklist_responses;
create trigger checklist_responses_updated_at
  before update on checklist_responses
  for each row execute function set_checklist_updated_at();

-- ── 4. RLS helper: who may author a checklist / verify a response ──
-- Deliberately narrower than user_team_ids(): coaches, treasurers, schedulers,
-- and fundraisers read the list but must not edit it or sign items off. Mirrors
-- user_medical_admin_team_ids() (rls_policies.sql).
create or replace function user_checklist_admin_team_ids()
returns setof uuid
language sql
stable
security definer
as $$
  select team_id from user_roles
  where user_id = auth.uid() and team_id is not null and role = 'team_manager'
  union
  select t.id from teams t
  join user_roles ur on ur.club_id = t.club_id
  where ur.user_id = auth.uid() and ur.role = 'club_admin'
$$;

-- ── 5. RLS: season_checklists ──
alter table season_checklists enable row level security;

-- Staff see every list including drafts; guardians only see a published list
-- for their own player's team.
create policy "season_checklists_select" on season_checklists for select to authenticated
  using (
    is_super_admin()
    or team_id in (select user_team_ids())
    or (
      is_published
      and team_id in (select team_id from players where id in (select user_guardian_player_ids()))
    )
  );

create policy "season_checklists_insert" on season_checklists for insert to authenticated
  with check (is_super_admin() or team_id in (select user_checklist_admin_team_ids()));

create policy "season_checklists_update" on season_checklists for update to authenticated
  using (is_super_admin() or team_id in (select user_checklist_admin_team_ids()))
  with check (is_super_admin() or team_id in (select user_checklist_admin_team_ids()));

create policy "season_checklists_delete" on season_checklists for delete to authenticated
  using (is_super_admin() or team_id in (select user_checklist_admin_team_ids()));

-- ── 6. RLS: checklist_responses ──
alter table checklist_responses enable row level security;

create policy "checklist_responses_select" on checklist_responses for select to authenticated
  using (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or checklist_id in (select id from season_checklists where team_id in (select user_team_ids()))
  );

create policy "checklist_responses_insert" on checklist_responses for insert to authenticated
  with check (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or checklist_id in (select id from season_checklists where team_id in (select user_checklist_admin_team_ids()))
  );

create policy "checklist_responses_update" on checklist_responses for update to authenticated
  using (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or checklist_id in (select id from season_checklists where team_id in (select user_checklist_admin_team_ids()))
  )
  with check (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or checklist_id in (select id from season_checklists where team_id in (select user_checklist_admin_team_ids()))
  );

-- Only staff delete responses; a guardian un-completes by flipping `completed`.
create policy "checklist_responses_delete" on checklist_responses for delete to authenticated
  using (
    is_super_admin()
    or checklist_id in (select id from season_checklists where team_id in (select user_checklist_admin_team_ids()))
  );

-- ── 7. Guardians must not sign off their own items ──
-- The UPDATE policy above has to let guardians write their own rows, which would
-- otherwise also let a crafted request set verified = true. Column-level grants
-- can't express "unless you're staff", so a trigger pins the verification columns
-- back to their prior values for anyone who is not a checklist admin.
create or replace function guard_checklist_verification()
returns trigger language plpgsql security definer as $$
declare
  is_admin boolean;
  team uuid;
begin
  select sc.team_id into team from season_checklists sc where sc.id = new.checklist_id;
  is_admin := is_super_admin() or team in (select user_checklist_admin_team_ids());

  if not is_admin then
    if tg_op = 'INSERT' then
      new.verified := false;
      new.verified_at := null;
      new.verified_by := null;
    else
      new.verified := old.verified;
      new.verified_at := old.verified_at;
      new.verified_by := old.verified_by;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_responses_guard_verification on checklist_responses;
create trigger checklist_responses_guard_verification
  before insert or update on checklist_responses
  for each row execute function guard_checklist_verification();

-- ── 8. Realtime ──
-- ChecklistManager watches checklist_responses so the admin matrix fills in as
-- parents work through the list. REPLICA IDENTITY FULL is required for the
-- filtered subscription to see deletes — see sql/enable_realtime.sql.
do $$
declare
  t text;
begin
  foreach t in array array['season_checklists', 'checklist_responses']
  loop
    execute format('alter table %I replica identity full', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

commit;
