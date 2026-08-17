-- ============================================================
-- Home field scheduling (club-wide field booking)
--
-- Replaces the shared "HWY 51 SCHEDULE" spreadsheet: a weekend grid
-- of fixed time blocks per field that any team in the club can claim.
--
--   fields           the club's playable fields (11v11, 9v9, …).
--   field_bookings   one team's claim on one block of one field. A team
--                    manager books an open block outright; anyone else on
--                    staff files a request and a club admin decides it.
--                    Confirming settles the block — every other request
--                    for it is declined in the same transaction.
--   field_closures   a field (or every field) taken off the board for a
--                    date range, so nothing can be booked into it.
--
-- Blocks themselves are not stored. A day's grid is generated from the
-- constants in src/utils/fieldSlots.js and a booking simply records
-- which block it holds (booking_date + slot_time), so an empty weekend
-- costs zero rows — same as the empty yellow bands on the sheet.
--
-- Referee counts live on the booking because that is where the sheet
-- keeps them ("# of Refs", "* number may vary depending on availability").
--
-- Run this against an existing project. complete_schema.sql carries the
-- same tables for fresh installs.
-- ============================================================

-- ── FIELDS ──
CREATE TABLE IF NOT EXISTS fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  -- Short label for the column header on the grid, e.g. "11 v 11".
  short_name  text,
  location    text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (club_id, name)
);

CREATE INDEX IF NOT EXISTS idx_fields_club ON fields(club_id, sort_order);

-- ── BOOKINGS ──
CREATE TABLE IF NOT EXISTS field_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  field_id        uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  -- The team holding the block. Null is a club-run event (tryouts, camp)
  -- booked by an admin on nobody's behalf.
  team_id         uuid REFERENCES teams(id),
  season_id       text REFERENCES seasons(id),
  booking_date    date NOT NULL,
  slot_time       time NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled')),
  -- Free text on purpose: the sheet's "Manager" column is whoever is
  -- standing on the touchline that day, not necessarily an app user.
  manager_name    text,
  opponent_name   text,
  age_group       text,
  game_type       text,
  -- "# of Refs" on the sheet. Requested, not guaranteed — the sheet's own
  -- footnote says the number may vary with availability.
  referees_needed integer NOT NULL DEFAULT 0 CHECK (referees_needed >= 0 AND referees_needed <= 9),
  notes           text,
  requested_by    uuid,
  decided_by      uuid,
  decided_at      timestamptz,
  decline_reason  text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_bookings_club_date ON field_bookings(club_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_field_bookings_field_date ON field_bookings(field_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_field_bookings_team ON field_bookings(team_id, booking_date);

-- One team on the field at a time. Competing REQUESTS for the same block are
-- allowed on purpose — that is the queue the club admin is there to settle —
-- but only one of them can end up confirmed.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_field_booking_confirmed_slot
  ON field_bookings(field_id, booking_date, slot_time)
  WHERE status = 'confirmed';

-- ── CLOSURES ──
CREATE TABLE IF NOT EXISTS field_closures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  -- Null closes every field in the club — holiday weekends, field-wide
  -- maintenance, a hurricane.
  field_id    uuid REFERENCES fields(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  -- Null closes the whole day. Set it to shut one block only.
  slot_time   time,
  reason      text,
  created_by  uuid,
  created_at  timestamptz DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_field_closures_club_range ON field_closures(club_id, start_date, end_date);

-- ── TRIGGERS ──
CREATE OR REPLACE FUNCTION set_field_bookings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS field_bookings_updated_at ON field_bookings;
CREATE TRIGGER field_bookings_updated_at
  BEFORE UPDATE ON field_bookings
  FOR EACH ROW EXECUTE FUNCTION set_field_bookings_updated_at();

-- Club admins of this club only. Mirrors user_medical_admin_club_ids() but is
-- named for what it gates, so the two can diverge without surprising anyone.
CREATE OR REPLACE FUNCTION user_club_admin_club_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT club_id FROM user_roles
  WHERE user_id = auth.uid() AND club_id IS NOT NULL AND role = 'club_admin'
$$;

-- Teams this user is the manager of — the team-level admin, and the only
-- team role that books the home field outright. Deliberately not
-- user_team_ids(), which also hands every team to club-level roles.
CREATE OR REPLACE FUNCTION user_team_manager_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT team_id FROM user_roles
  WHERE user_id = auth.uid() AND team_id IS NOT NULL AND role = 'team_manager'
$$;

-- Who may decide a booking, enforced in the database rather than only in the
-- UI:
--
--   confirm — a club admin, or the manager of the team the block is for. A
--             team manager runs their own fixture list, so they take an open
--             block outright instead of queuing for permission to use their
--             own club's field.
--   decline — a club admin only. Turning down someone else's request is a
--             club decision; a manager who changes their mind cancels.
--
-- Everyone else on staff (scheduler, coaches) still files a request and waits.
CREATE OR REPLACE FUNCTION guard_field_booking_decision()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  is_decision boolean;
BEGIN
  -- The cascade below settles a block by declining the requests that lost it.
  -- It runs as whoever confirmed the booking — often a team manager, who is
  -- not allowed to decline — so it announces itself and skips this check.
  IF current_setting('app.field_booking_settling', true) = 'on' THEN
    RETURN NEW;
  END IF;

  is_decision := NEW.status IN ('confirmed', 'declined')
    AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status);

  IF is_decision THEN
    IF NEW.status = 'confirmed' THEN
      IF NOT (
        is_super_admin()
        OR NEW.club_id IN (SELECT user_club_admin_club_ids())
        OR (NEW.team_id IS NOT NULL AND NEW.team_id IN (SELECT user_team_manager_team_ids()))
      ) THEN
        RAISE EXCEPTION 'Only a club admin or the team''s own manager can confirm a field booking';
      END IF;

      -- The unique index would catch this too, but as a constraint violation
      -- nobody can read. Two people racing for the last open Saturday block
      -- deserve a sentence, not "23505".
      IF EXISTS (
        SELECT 1 FROM field_bookings
        WHERE id <> NEW.id
          AND field_id = NEW.field_id
          AND booking_date = NEW.booking_date
          AND slot_time = NEW.slot_time
          AND status = 'confirmed'
      ) THEN
        RAISE EXCEPTION 'That block has already been booked by another team';
      END IF;
    ELSIF NOT (is_super_admin() OR NEW.club_id IN (SELECT user_club_admin_club_ids())) THEN
      RAISE EXCEPTION 'Only a club admin can decline a field booking';
    END IF;

    NEW.decided_by = auth.uid();
    NEW.decided_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS field_bookings_guard_decision ON field_bookings;
CREATE TRIGGER field_bookings_guard_decision
  BEFORE INSERT OR UPDATE ON field_bookings
  FOR EACH ROW EXECUTE FUNCTION guard_field_booking_decision();

-- Confirming a block settles it: whatever else was queued for that field, day
-- and time is declined on the spot. This lives in the database because the
-- person confirming is often a team manager, who can neither see nor write
-- another team's rows — leaving those requests pending forever, waiting on a
-- slot that is already gone.
CREATE OR REPLACE FUNCTION settle_field_booking_slot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.field_booking_settling', 'on', true);

  UPDATE field_bookings
     SET status = 'declined',
         decline_reason = 'Another team was given this slot',
         decided_by = auth.uid(),
         decided_at = now()
   WHERE id <> NEW.id
     AND field_id = NEW.field_id
     AND booking_date = NEW.booking_date
     AND slot_time = NEW.slot_time
     AND status = 'pending';

  PERFORM set_config('app.field_booking_settling', 'off', true);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS field_bookings_settle_slot ON field_bookings;
CREATE TRIGGER field_bookings_settle_slot
  AFTER INSERT OR UPDATE OF status ON field_bookings
  FOR EACH ROW EXECUTE FUNCTION settle_field_booking_slot();

-- ── RLS ──
-- The field schedule is deliberately club-transparent: everyone with a role in
-- the club sees every booking, because knowing the field is taken is the point.
-- Writing is scoped to the requesting team; deciding is scoped to club admins.
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fields_select" ON fields;
CREATE POLICY "fields_select" ON fields FOR SELECT TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

DROP POLICY IF EXISTS "fields_write" ON fields;
CREATE POLICY "fields_write" ON fields FOR ALL TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_admin_club_ids()))
  WITH CHECK (is_super_admin() OR club_id IN (SELECT user_club_admin_club_ids()));

DROP POLICY IF EXISTS "field_bookings_select" ON field_bookings;
CREATE POLICY "field_bookings_select" ON field_bookings FOR SELECT TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

DROP POLICY IF EXISTS "field_bookings_insert" ON field_bookings;
CREATE POLICY "field_bookings_insert" ON field_bookings FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR club_id IN (SELECT user_club_admin_club_ids())
    OR team_id IN (SELECT user_team_ids())
  );

DROP POLICY IF EXISTS "field_bookings_update" ON field_bookings;
CREATE POLICY "field_bookings_update" ON field_bookings FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR club_id IN (SELECT user_club_admin_club_ids())
    OR team_id IN (SELECT user_team_ids())
  );

DROP POLICY IF EXISTS "field_bookings_delete" ON field_bookings;
CREATE POLICY "field_bookings_delete" ON field_bookings FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR club_id IN (SELECT user_club_admin_club_ids())
    OR team_id IN (SELECT user_team_ids())
  );

DROP POLICY IF EXISTS "field_closures_select" ON field_closures;
CREATE POLICY "field_closures_select" ON field_closures FOR SELECT TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

-- Closing the field is a club decision, not a team one.
DROP POLICY IF EXISTS "field_closures_write" ON field_closures;
CREATE POLICY "field_closures_write" ON field_closures FOR ALL TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_admin_club_ids()))
  WITH CHECK (is_super_admin() OR club_id IN (SELECT user_club_admin_club_ids()));

-- ── SEED ──
-- The two fields the spreadsheet tracks. Safe to re-run; edit or add rows for
-- clubs with a different setup.
INSERT INTO fields (club_id, name, short_name, sort_order)
SELECT c.id, '11 v 11 Field', '11 v 11', 1 FROM clubs c
ON CONFLICT (club_id, name) DO NOTHING;

INSERT INTO fields (club_id, name, short_name, sort_order)
SELECT c.id, '9 v 9 Field', '9 v 9', 2 FROM clubs c
ON CONFLICT (club_id, name) DO NOTHING;
