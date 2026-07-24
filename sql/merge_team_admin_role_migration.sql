-- Migration: fold the 'team_admin' role into 'team_manager'.
-- team_admin and team_manager granted the same practical access and were kept as
-- separate roles only by accident of naming. This migration normalizes on
-- 'team_manager' as the single top-level team role.
-- Run this in the Supabase SQL editor.

-- 1. Reassign any existing team_admin role rows to team_manager.
update user_roles
set role = 'team_manager'
where role = 'team_admin';

update invitations
set role = 'team_manager'
where role = 'team_admin';

-- 2. Drop and recreate the CHECK constraint on user_roles without 'team_admin'.
alter table user_roles drop constraint if exists user_roles_role_check;

alter table user_roles
  add constraint user_roles_role_check
  check (role in ('super_admin', 'club_admin', 'club_manager', 'team_manager', 'treasurer', 'scheduler', 'head_coach', 'assistant_coach', 'parent'));
