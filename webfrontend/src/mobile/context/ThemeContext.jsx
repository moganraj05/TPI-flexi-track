import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Light / dark / follow-the-phone appearance, same three options and storage
// key as the Expo app. The palette itself lives in mobile.css as CSS custom
// properties under [data-theme], so components only use var(--…) colours.
const THEME_KEY = 'flexitrack_theme_mode';
const MODES = ['system', 'light', 'dark'];

// Background colour per theme, for the browser/status bar (meta theme-color).
const BAR_COLORS = { light: '#F4F4F7', dark: '#0E0D14' };

const ThemeContext = createContext(null);

function loadMode() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (MODES.includes(stored)) return stored;
  } catch {
    // fall through
  }
  return 'system';
}

const systemPrefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function MobileThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(loadMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const onChange = (e) => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);
  const resolved = isDark ? 'dark' : 'light';

  // Tint the phone's status bar / browser chrome to match, and the page
  // background behind overscroll so a pull past the edge doesn't flash white.
  useEffect(() => {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    const previousColor = meta.content;
    const previousBodyBg = document.body.style.background;
    meta.content = BAR_COLORS[resolved];
    document.body.style.background = BAR_COLORS[resolved];
    document.documentElement.style.colorScheme = resolved;
    return () => {
      meta.content = previousColor;
      document.body.style.background = previousBodyBg;
      document.documentElement.style.colorScheme = '';
    };
  }, [resolved]);

  const setThemeMode = useCallback((mode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // still applies for this visit
    }
  }, []);

  const value = useMemo(() => ({ themeMode, setThemeMode, isDark, resolved }), [themeMode, setThemeMode, isDark, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useMobileTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useMobileTheme must be used within MobileThemeProvider');
  return ctx;
}
