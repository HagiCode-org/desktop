import { CheckCircle2, Globe2, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_DESKTOP_LANGUAGE,
  DESKTOP_LANGUAGES,
  type DesktopLanguageCode,
} from '../../../../shared/desktop-languages';
import { cn } from '@/lib/utils';

export interface LanguageSelectionStepProps {
  selectedLanguage: DesktopLanguageCode;
  onSelect: (language: DesktopLanguageCode) => void;
  isPending: boolean;
  error: string | null;
}

function LanguageSelectionStep({
  selectedLanguage,
  onSelect,
  isPending,
  error,
}: LanguageSelectionStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Languages className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold">{t('languageSelection.title')}</h2>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">
            {t('languageSelection.description')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DESKTOP_LANGUAGES.map((language) => {
          const isSelected = language.code === selectedLanguage;
          const isRecommended = language.code === DEFAULT_DESKTOP_LANGUAGE;

          return (
            <button
              key={language.code}
              type="button"
              aria-pressed={isSelected}
              disabled={isPending}
              onClick={() => onSelect(language.code)}
              className={cn(
                'group flex min-h-44 flex-col rounded-2xl border bg-card p-5 text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isPending && 'cursor-not-allowed opacity-70',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-border hover:border-primary/40 hover:bg-muted/20',
              )}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-lg font-semibold">{language.nativeName}</div>
                  <div className="text-sm text-muted-foreground">{language.name}</div>
                </div>
                <div className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {language.shortLabel}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                  <Globe2 className="h-3.5 w-3.5" />
                  {language.code}
                </span>
                {isRecommended && (
                  <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {t('languageSelection.recommended')}
                  </span>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between text-sm">
                <span className={cn('text-muted-foreground', isSelected && 'text-primary')}>
                  {isSelected ? t('languageSelection.selected') : t('languageSelection.choose')}
                </span>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <div className="font-medium">{t('languageSelection.error')}</div>
          <div className="mt-1 break-words text-destructive/90">{error}</div>
        </div>
      )}
    </div>
  );
}

export default LanguageSelectionStep;
