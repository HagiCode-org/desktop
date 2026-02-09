import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface OnboardingActionsProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onSkip?: () => void;
}

function OnboardingActions({
  canGoNext,
  canGoPrevious,
  onNext,
  onPrevious,
  onSkip,
}: OnboardingActionsProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div className="flex items-center justify-between px-8 py-4 border-t bg-muted/20 rounded-b-lg">
      {/* Left side - Previous button */}
      <div className="flex-1">
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

      {/* Right side - Next/Skip buttons */}
      <div className="flex items-center gap-3">
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
          className="gap-2"
        >
          {t('actions.next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default OnboardingActions;
