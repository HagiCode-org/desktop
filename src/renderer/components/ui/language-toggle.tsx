import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentLanguage, selectAvailableLanguages } from '@/store/slices/i18nSlice';
import { changeLanguage } from '@/store/thunks/i18nThunks';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDesktopLanguageShortLabel } from '../../../shared/desktop-languages';

export function LanguageToggle() {
  const dispatch = useDispatch();
  const currentLanguage = useSelector(selectCurrentLanguage);
  const availableLanguages = useSelector(selectAvailableLanguages);
  const [mounted, setMounted] = useState(false);

  // Get current language info
  const currentLangInfo = availableLanguages.find(lang => lang.code === currentLanguage);

  const currentLabel = getDesktopLanguageShortLabel(currentLanguage);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !currentLangInfo) {
    return (
      <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          title="切换语言"
        >
          <span className="text-sm font-medium">{currentLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {availableLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => dispatch(changeLanguage(lang.code))}
            className={currentLanguage === lang.code ? 'bg-accent' : ''}
          >
            <span>{lang.nativeName}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
