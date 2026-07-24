-- Migration: add the 'fundraiser' team-level role.
-- fundraiser covers sponsor/fundraising outreach (view/edit sponsors, view roster
-- and budget) without ledger or budget-edit access, so a club can delegate
-- fundraising to a volunteer without also granting money custody.
-- Run this in the Supabase SQL editor.

-- Drop and recreate the CHECK constraint on user_roles to include 'fundraiser'.
alter table user_roles drop constraint if exists user_roles_role_check;

alter table user_roles
  add constraint user_roles_role_check
  check (role in ('super_admin', 'club_admin', 'club_manager', 'team_manager', 'treasurer', 'scheduler', 'head_coach', 'assistant_coach', 'fundraiser', 'parent'));

-- Note: invitations.role has no CHECK constraint, so no change needed there.
