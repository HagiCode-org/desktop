export const DESKTOP_THEMES = ['light', 'dark'] as const;
export type DesktopTheme = (typeof DESKTOP_THEMES)[number];

export const DESKTOP_THEME_STORAGE_KEY = 'hagicode-desktop-theme';

type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>;
type MediaQueryLike = Pick<MediaQueryList, 'matches'>;
type ThemeTarget = {
  classList: Pick<DOMTokenList, 'add' | 'remove'>;
  style: {
    colorScheme: string;
  };
};

export function isDesktopTheme(value: unknown): value is DesktopTheme {
  return value === 'light' || value === 'dark';
}

export function readSavedDesktopTheme(
  storage: StorageLike | null | undefined,
  storageKey: string = DESKTOP_THEME_STORAGE_KEY,
): DesktopTheme | null {
  if (!storage) {
    return null;
  }

  try {
    const storedTheme = storage.getItem(storageKey);
    if (isDesktopTheme(storedTheme)) {
      return storedTheme;
    }

    if (storedTheme) {
      storage.removeItem(storageKey);
    }
  } catch (error) {
    console.warn('[Theme] Failed to read persisted desktop theme:', error);
  }

  return null;
}

export function resolveDesktopTheme(
  savedTheme: string | null | undefined,
  prefersDark: boolean,
): DesktopTheme {
  if (isDesktopTheme(savedTheme)) {
    return savedTheme;
  }

  return prefersDark ? 'dark' : 'light';
}

export function resolveInitialDesktopTheme({
  storage,
  mediaQueryList,
  storageKey = DESKTOP_THEME_STORAGE_KEY,
}: {
  storage?: StorageLike | null;
  mediaQueryList?: MediaQueryLike | null;
  storageKey?: string;
} = {}): DesktopTheme {
  const savedTheme = readSavedDesktopTheme(storage, storageKey);
  return resolveDesktopTheme(savedTheme, mediaQueryList?.matches ?? false);
}

export function applyDesktopTheme(target: ThemeTarget, theme: DesktopTheme): void {
  target.classList.remove(...DESKTOP_THEMES);
  target.classList.add(theme);
  target.style.colorScheme = theme;
}
