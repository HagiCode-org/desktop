import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';

export interface PreconditionErrorProps {
  /**
   * The title of the error message (supports i18n)
   */
  title: string;
  /**
   * The detailed error message (supports i18n)
   */
  message: string;
  /**
   * The label for the action button (supports i18n)
   */
  actionLabel: string;
  /**
   * Callback function when the action button is clicked
   */
  onAction: () => void;
}

/**
 * PreconditionError Component
 *
 * A reusable component for displaying precondition validation errors
 * in the onboarding wizard. Provides bilingual support and a navigation action.
 *
 * @example
 * ```tsx
 * <PreconditionError
 *   title="Prerequisite Not Completed"
 *   message="This step requires completing 'Step 2: Agent CLI Selection' first."
 *   actionLabel="Return to Step 2"
 *   onAction={() => dispatch(goToStep(OnboardingStep.AgentCliSelection))}
 * />
 * ```
 */
function PreconditionError({ title, message, actionLabel, onAction }: PreconditionErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-8 px-4">
      {/* Error Icon */}
      <div className="flex justify-center">
        <div className="p-4 bg-yellow-500/10 rounded-full">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
        </div>
      </div>

      {/* Error Message */}
      <div className="text-center space-y-2 max-w-md">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-muted-foreground">{message}</p>
      </div>

      {/* Action Button */}
      <Button
        onClick={onAction}
        className="min-w-[200px]"
      >
        {actionLabel}
      </Button>
    </div>
  );
}

export default PreconditionError;
