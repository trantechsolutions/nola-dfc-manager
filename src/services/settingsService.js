import { supabase } from '../supabase';

export const settingsService = {
  // Returns a { key: value } map of all app-wide settings.
  getAppSettings: async () => {
    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) throw error;
    const map = {};
    (data || []).forEach((row) => {
      map[row.key] = row.value;
    });
    return map;
  },

  // Upserts a single app-wide setting. Super-admin only (enforced by RLS).
  setAppSetting: async (key, value) => {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
  },
};
