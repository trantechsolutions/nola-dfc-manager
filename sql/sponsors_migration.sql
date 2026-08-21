-- ============================================================
-- Sponsor Directory
--
-- Who sponsors the team, how to reach them, what they committed, and
-- their logo — the things a manager needs on hand when writing a thank
-- you, renewing next season, or putting a banner together. Scoped to
-- team_id and NOT to a season: the same local business gets carried
-- from year to year, with `renewal_date` marking when to ask again.
--
-- Money still lives in the ledger. A sponsor row records the pledge
-- (`committed_amount`); the SPO transactions record what actually came
-- in, and the distribution engine decides who it credits.
--
-- Run this against an existing project. complete_schema.sql has been
-- updated to include this table for fresh installs.
-- ============================================================

CREATE TABLE IF NOT EXISTS sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  tier text,                       -- free text: 'Gold', 'Banner', 'In-kind', …
  status text NOT NULL DEFAULT 'prospect',  -- prospect | committed | paid | declined
  contact_name text,
  email text,
  phone text,
  website text,
  address text,
  committed_amount numeric(12, 2) DEFAULT 0,
  renewal_date date,
  notes text,
  -- Object path inside the public `sponsor-logos` bucket, shaped
  -- `${team_id}/${sponsor_id}_${timestamp}.${ext}`. Null until a logo is added.
  logo_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_team ON sponsors(team_id);

CREATE OR REPLACE FUNCTION set_sponsors_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sponsors_updated_at ON sponsors;
CREATE TRIGGER sponsors_updated_at
  BEFORE UPDATE ON sponsors
  FOR EACH ROW EXECUTE FUNCTION set_sponsors_updated_at();

-- ── LEDGER LINK ──
-- A sponsor row and its money are separate things: the ledger entry keeps the
-- title it was booked under, while the sponsor row can be renamed and enriched
-- freely. sponsor_id is what ties them together, so the directory can show what
-- a sponsor has actually paid without matching on text.
-- ON DELETE SET NULL — removing a sponsor from the directory must never delete
-- or orphan a booked transaction.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES sponsors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_sponsor ON transactions(sponsor_id);

-- ── RLS ──
-- Team-scoped, same shape as opponent_contacts. Sponsor contact details are
-- staff business (a parent has no reason to hold the owner's cell number), so
-- there is no guardian-facing policy here.
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sponsors_select" ON sponsors;
DROP POLICY IF EXISTS "sponsors_insert" ON sponsors;
DROP POLICY IF EXISTS "sponsors_update" ON sponsors;
DROP POLICY IF EXISTS "sponsors_delete" ON sponsors;

CREATE POLICY "sponsors_select" ON sponsors FOR SELECT TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "sponsors_insert" ON sponsors FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "sponsors_update" ON sponsors FOR UPDATE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "sponsors_delete" ON sponsors FOR DELETE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

-- ── STORAGE: sponsor-logos ──
-- The bucket is created here rather than by hand, so running this file is all
-- it takes to make logo uploads work — without it every upload fails with
-- "Bucket not found". Public on purpose: a sponsor logo is a marketing asset
-- meant to be shown on banners, socials, and eventually parent-facing pages,
-- and public URLs mean no signed-URL refresh cycle to keep an <img> alive.
-- Nothing private ever goes in here.
--
-- Re-running is safe: an existing bucket has its settings brought back in line
-- rather than being replaced, so nothing already uploaded is touched.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sponsor-logos',
  'sponsor-logos',
  true,
  2097152,  -- 2MB, matching MAX_LOGO_BYTES in src/utils/sponsors.js
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Writes are staff-only and confined to the caller's own team folder — path
-- shape is `${team_id}/…`, so folder [1] is the team. Reads ride the bucket's
-- public flag and need no policy.
DROP POLICY IF EXISTS "sponsor_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "sponsor_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "sponsor_logos_delete" ON storage.objects;

CREATE POLICY "sponsor_logos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sponsor-logos'
    AND (is_super_admin() OR (storage.foldername(name))[1]::uuid IN (SELECT user_team_ids()))
  );

CREATE POLICY "sponsor_logos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'sponsor-logos'
    AND (is_super_admin() OR (storage.foldername(name))[1]::uuid IN (SELECT user_team_ids()))
  );

CREATE POLICY "sponsor_logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'sponsor-logos'
    AND (is_super_admin() OR (storage.foldername(name))[1]::uuid IN (SELECT user_team_ids()))
  );
