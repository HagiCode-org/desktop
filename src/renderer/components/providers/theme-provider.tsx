import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyDesktopTheme,
  DESKTOP_THEME_STORAGE_KEY,
  readSavedDesktopTheme,
  type DesktopTheme,
} from '@/lib/desktop-theme';

type ThemeContextValue = {
  theme: DesktopTheme;
  resolvedTheme: DesktopTheme;
  setTheme: (theme: DesktopTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type DesktopThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: DesktopTheme;
  storageKey?: string;
};

// NOTE: This provider renders no inline <script>. The initial theme is already
// applied to documentElement before React mounts (see src/renderer/main.tsx),
// so an SSR no-flash script is unnecessary and would only trigger a React 19
// "Encountered a script tag while rendering React component" warning on the
// client. Theme persistence/apply is handled via @/lib/desktop-theme.
export function ThemeProvider({
  children,
  defaultTheme = 'light',
  storageKey = DESKTOP_THEME_STORAGE_KEY,
}: DesktopThemeProviderProps) {
  const [theme, setThemeState] = useState<DesktopTheme>(
    () => readSavedDesktopTheme(window.localStorage, storageKey) ?? defaultTheme,
  );

  const setTheme = useCallback(
    (nextTheme: DesktopTheme) => {
      setThemeState(nextTheme);
      try {
        window.localStorage.setItem(storageKey, nextTheme);
      } catch (error) {
        console.warn('[Theme] Failed to persist desktop theme:', error);
      }
    },
    [storageKey],
  );

  useEffect(() => {
    applyDesktopTheme(document.documentElement, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme, setTheme }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return context;
}
