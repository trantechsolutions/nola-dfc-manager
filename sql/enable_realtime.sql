-- Fixes: data is written to the database but the UI keeps showing the old
-- state until the page is reloaded (the ledger is the clearest example).
--
-- useAppData subscribes to postgres_changes for players, transactions and
-- team_events, but nothing ever added those tables to the supabase_realtime
-- publication, so Postgres never published the changes and the subscription
-- had nothing to deliver. (The client-side half of this — a filter on a
-- transactions.team_id column that does not exist, which made the whole
-- channel fail to subscribe — is fixed in useAppData.js.)
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- The publication exists on every Supabase project, but create it if this is
-- being run against a plain Postgres instance.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['players', 'transactions', 'team_events', 'player_seasons', 'team_seasons']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;

-- DELETE and UPDATE events only carry the primary key in payload.old by
-- default. The transactions listener routes on the row's team_season_id, so
-- it needs the full old row to tell whether a deleted transaction belonged to
-- the team being viewed (without it, every delete anywhere forces a refetch).
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.team_events REPLICA IDENTITY FULL;

-- Verify: these five tables should be listed.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
