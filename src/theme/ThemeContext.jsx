import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'app_theme';
const THEMES = ['light', 'dark', 'system'];

const ThemeContext = createContext();

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      return 'system';
    }
  });

  const setTheme = useCallback((t) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* noop */
    }
    applyTheme(t);
  }, []);

  const cycleTheme = useCallback(() => {
    const idx = THEMES.indexOf(theme);
    setTheme(THEMES[(idx + 1) % THEMES.length]);
  }, [theme, setTheme]);

  // Apply on mount + listen for system changes
  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme, cycleTheme }), [theme, setTheme, cycleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
