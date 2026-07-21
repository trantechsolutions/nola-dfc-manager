// src/hooks/useAppSettings.js
// Loads the app-wide settings map (app_settings table). Fetches unconditionally
// so the loading flag always resolves — including for anonymous visitors, whose
// RLS-filtered read simply returns an empty map. If the table is missing (the
// migration hasn't been run yet) the fetch fails and we degrade to {}, letting
// the build-time env flag take over.

import { useState, useEffect, useCallback } from 'react';
import { supabaseService } from '../services/supabaseService';

export const useAppSettings = (user) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const map = await supabaseService.getAppSettings();
      setSettings(map || {});
    } catch (e) {
      console.warn('Failed to load app settings:', e.message);
      setSettings({});
    } finally {
      setLoading(false);
    }
    // Re-fetch when auth changes so a fresh login picks up readable settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSetting = useCallback(async (key, value) => {
    await supabaseService.setAppSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  return { settings, settingsLoading: loading, refreshSettings: fetchSettings, saveSetting };
};
