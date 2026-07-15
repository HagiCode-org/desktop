import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';

interface OnboardingActionsProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onSkip?: () => void;
  nextLabel?: string;
}

function OnboardingActions({
  canGoNext,
  canGoPrevious,
  onNext,
  onPrevious,
  onSkip,
  nextLabel,
}: OnboardingActionsProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div className="border-t bg-card/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:px-6">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-h-10 items-center">
          {canGoPrevious && (
            <Button
              variant="ghost"
              onClick={onPrevious}
              className="w-full gap-2 sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('actions.previous')}
            </Button>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          {onSkip && (
            <Button
              variant="ghost"
              onClick={onSkip}
              className="w-full text-muted-foreground sm:w-auto"
            >
              {t('actions.skip')}
            </Button>
          )}
          <Button
            onClick={onNext}
            disabled={!canGoNext}
            className="w-full min-w-40 justify-center gap-2 sm:w-auto"
          >
            {nextLabel ?? t('actions.next')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingActions;
