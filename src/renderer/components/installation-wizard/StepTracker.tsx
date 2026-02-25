import React from 'react';

interface StepTrackerProps {
  currentStep: number;
  totalSteps: number;
  stepTitles: string[];
}

/**
 * StepTracker component displays the current progress in the installation wizard
 */
export const StepTracker: React.FC<StepTrackerProps> = ({
  currentStep,
  totalSteps,
  stepTitles,
}) => {
  return (
    <div className="step-tracker">
      <div className="step-info">
        <span className="step-current">
          {currentStep + 1} / {totalSteps}
        </span>
        <span className="step-title">{stepTitles[currentStep]}</span>
      </div>
      <div className="step-progress">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={`step-dot ${
              index < currentStep
                ? 'completed'
                : index === currentStep
                ? 'active'
                : 'pending'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default StepTracker;
