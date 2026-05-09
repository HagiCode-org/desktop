import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';

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
    <div className="border-t bg-muted/10 px-6 py-4 sm:px-8">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-h-10 items-center">
        {canGoPrevious && (
          <Button
            variant="ghost"
            onClick={onPrevious}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('actions.previous')}
          </Button>
        )}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {onSkip && (
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground"
          >
            {t('actions.skip')}
          </Button>
        )}
        <Button
          onClick={onNext}
          disabled={!canGoNext}
          className="min-w-40 justify-center gap-2"
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
