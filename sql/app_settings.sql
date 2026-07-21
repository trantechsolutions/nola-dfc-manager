-- app_settings: global key/value store for app-wide configuration.
-- Only super admins may write; any authenticated user may read (settings drive
-- UI chrome such as single-team mode).
create table if not exists app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;

drop policy if exists "app_settings_select" on app_settings;
drop policy if exists "app_settings_insert" on app_settings;
drop policy if exists "app_settings_update" on app_settings;
drop policy if exists "app_settings_delete" on app_settings;

create policy "app_settings_select" on app_settings for select to authenticated using (true);
create policy "app_settings_insert" on app_settings for insert to authenticated with check (is_super_admin());
create policy "app_settings_update" on app_settings for update to authenticated using (is_super_admin());
create policy "app_settings_delete" on app_settings for delete to authenticated using (is_super_admin());
