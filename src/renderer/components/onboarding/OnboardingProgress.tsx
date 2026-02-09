import { useTranslation } from 'react-i18next';
import type { OnboardingStep } from '../../../types/onboarding';

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
  totalSteps: number;
}

function OnboardingProgress({ currentStep, totalSteps }: OnboardingProgressProps) {
  const { t } = useTranslation('onboarding');

  const steps = Array.from({ length: totalSteps }, (_, i) => i);

  return (
    <div className="flex items-center gap-3">
      {/* Progress dots */}
      <div className="flex items-center gap-2">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center">
            {/* Step dot */}
            <div
              className={`
                w-3 h-3 rounded-full transition-all duration-300
                ${step <= currentStep
                  ? 'bg-primary'
                  : 'bg-muted-foreground/30'
                }
              `}
            />
            {/* Connector line (not shown after last step) */}
            {index < steps.length - 1 && (
              <div
                className={`
                  w-8 h-0.5 transition-all duration-300 -mx-1
                  ${step < currentStep
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30'
                  }
                `}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step counter */}
      <span className="text-sm text-muted-foreground">
        {currentStep + 1}/{totalSteps}
      </span>
    </div>
  );
}

export default OnboardingProgress;
