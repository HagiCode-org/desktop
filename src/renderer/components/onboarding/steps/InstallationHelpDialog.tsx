import { useTranslation } from 'react-i18next';
import { AlertCircle, BookOpen, ExternalLink, RefreshCw, SkipForward } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';

interface InstallationHelpDialogProps {
  isOpen: boolean;
  onRetry: () => void;
  onSkip: () => void;
  onOpenDocs: () => void;
}

/**
 * InstallationHelpDialog
 *
 * Displayed when user indicates they need help with AI installation.
 * Provides troubleshooting steps and options.
 *
 * Features:
 * - Common troubleshooting steps
 * - Link to detailed documentation
 * - "Retry" button to restart installation
 * - "Skip" button to continue without confirmation
 */
export function InstallationHelpDialog({
  isOpen,
  onRetry,
  onSkip,
  onOpenDocs,
}: InstallationHelpDialogProps) {
  const { t } = useTranslation('onboarding');

  const troubleshootingSteps = [
    {
      title: t('installationHelp.steps.network.title'),
      description: t('installationHelp.steps.network.description'),
    },
    {
      title: t('installationHelp.steps.permissions.title'),
      description: t('installationHelp.steps.permissions.description'),
    },
    {
      title: t('installationHelp.steps.cliPath.title'),
      description: t('installationHelp.steps.cliPath.description'),
    },
    {
      title: t('installationHelp.steps.apiKey.title'),
      description: t('installationHelp.steps.apiKey.description'),
    },
  ];

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-500/10 rounded-full">
              <AlertCircle className="h-6 w-6 text-orange-500" />
            </div>
            <DialogTitle className="text-lg">
              {t('installationHelp.title')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            {t('installationHelp.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          {/* Troubleshooting Steps */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {t('installationHelp.troubleshootingTitle')}
            </h4>
            <div className="space-y-2">
              {troubleshootingSteps.map((step, index) => (
                <div key={index} className="bg-muted/50 rounded-lg p-3">
                  <p className="font-medium text-sm">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Documentation Link */}
          <Button
            variant="outline"
            onClick={onOpenDocs}
            className="w-full gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            {t('installationHelp.viewDocs')}
          </Button>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            variant="ghost"
            onClick={onSkip}
            className="w-full sm:w-auto text-muted-foreground"
          >
            <SkipForward className="h-4 w-4 mr-2" />
            {t('installationHelp.skip')}
          </Button>
          <Button
            onClick={onRetry}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('installationHelp.retry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InstallationHelpDialog;
