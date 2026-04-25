import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isDesktopTheme } from '@/lib/desktop-theme';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation('common');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
    );
  }

  const activeTheme = isDesktopTheme(resolvedTheme) ? resolvedTheme : 'light';
  const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
  const actionLabel = nextTheme === 'dark'
    ? t('themeToggle.switchToDark')
    : t('themeToggle.switchToLight');

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={actionLabel}
      aria-pressed={activeTheme === 'dark'}
      className={cn(
        'group relative flex h-9 w-9 items-center justify-center rounded-full border text-[color:var(--theme-toggle-fg)] transition-all duration-300 ease-out',
        'border-[color:var(--theme-toggle-border)] bg-[color:var(--theme-toggle-bg)]',
        '[box-shadow:var(--theme-toggle-shadow)]',
        'hover:-translate-y-0.5 hover:scale-[1.03] hover:border-[color:var(--theme-toggle-border-hover)] hover:bg-[color:var(--theme-toggle-bg-hover)] hover:[box-shadow:var(--theme-toggle-shadow-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--theme-toggle-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:scale-[0.98]',
      )}
      style={{
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
      }}
      title={actionLabel}
    >
      <span className="sr-only">{actionLabel}</span>
      {activeTheme === 'dark' ? (
        <Sun className="h-4 w-4 transition-transform duration-150 ease-out group-hover:rotate-[15deg] group-focus-visible:rotate-[15deg]" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-150 ease-out group-hover:rotate-[15deg] group-focus-visible:rotate-[15deg]" />
      )}
    </button>
  );
}
