import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';
import { DESKTOP_THEMES, DESKTOP_THEME_STORAGE_KEY } from '@/lib/desktop-theme';

type DesktopThemeProviderProps = Omit<ThemeProviderProps, 'attribute' | 'enableSystem' | 'themes'>;

export function ThemeProvider({
  children,
  storageKey = DESKTOP_THEME_STORAGE_KEY,
  ...props
}: DesktopThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      enableSystem={false}
      storageKey={storageKey}
      themes={[...DESKTOP_THEMES]}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
