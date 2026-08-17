-- Enables live updates (Supabase Realtime) for the tables the app subscribes
-- to via postgres_changes. Without this, `.channel(...).on('postgres_changes', ...)`
-- never fires — the client silently gets zero events, which is why the app
-- currently needs a full page refresh to see other users' changes.
--
-- Root cause found live on the linked project:
--   select * from pg_publication_tables where pubname = 'supabase_realtime';
-- returned zero rows — the publication exists but has no tables in it.
--
-- REPLICA IDENTITY FULL is required so DELETE events carry the full old row.
-- With the default identity, a DELETE only carries the primary key, so a
-- subscription filtered on a non-PK column (team_id=eq.., team_season_id=eq..)
-- can never match a delete and the event is dropped.

do $$
declare
  t text;
begin
  foreach t in array array[
    'players',
    'transactions',
    'team_events',
    'matchups',
    'opponent_contacts',
    'budget_items',
    'budget_amendments',
    'documents',
    -- The field board is shared by the whole club: two managers looking at
    -- the same Saturday need to see a block get taken without reloading.
    'field_bookings',
    'field_closures'
  ]
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
