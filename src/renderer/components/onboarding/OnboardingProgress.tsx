import { Progress } from '../ui/progress';

interface OnboardingProgressProps {
  currentStepNumber: number;
  totalSteps: number;
  currentStepLabel: string;
}

function OnboardingProgress({ currentStepNumber, totalSteps, currentStepLabel }: OnboardingProgressProps) {
  const normalizedTotalSteps = Math.max(totalSteps, 1);
  const steps = Array.from({ length: normalizedTotalSteps }, (_, i) => i + 1);
  const progressValue = Math.min(100, Math.max(0, (currentStepNumber / normalizedTotalSteps) * 100));

  return (
    <div className="min-w-[220px] rounded-xl border bg-muted/30 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">
            {currentStepNumber}/{normalizedTotalSteps}
          </div>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{currentStepLabel}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {steps.map((step) => (
            <div
              key={step}
              className={`
                h-2.5 w-2.5 rounded-full transition-colors duration-200
                ${step <= currentStepNumber ? 'bg-primary' : 'bg-muted-foreground/30'}
              `}
            />
          ))}
        </div>
      </div>

      <Progress value={progressValue} aria-label={`${currentStepNumber}/${normalizedTotalSteps}`} className="mt-3 h-1.5 bg-muted" />
    </div>
  );
}

export default OnboardingProgress;
