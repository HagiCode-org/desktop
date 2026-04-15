interface OnboardingProgressProps {
  currentStepNumber: number;
  totalSteps: number;
}

function OnboardingProgress({ currentStepNumber, totalSteps }: OnboardingProgressProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center">
            <div
              className={`
                h-3 w-3 rounded-full transition-all duration-300
                ${step <= currentStepNumber ? 'bg-primary' : 'bg-muted-foreground/30'}
              `}
            />
            {index < steps.length - 1 && (
              <div
                className={`
                  -mx-1 h-0.5 w-8 transition-all duration-300
                  ${step < currentStepNumber ? 'bg-primary' : 'bg-muted-foreground/30'}
                `}
              />
            )}
          </div>
        ))}
      </div>

      <span className="text-sm text-muted-foreground">
        {currentStepNumber}/{totalSteps}
      </span>
    </div>
  );
}

export default OnboardingProgress;
