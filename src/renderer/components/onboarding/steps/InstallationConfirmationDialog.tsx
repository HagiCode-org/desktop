import { useTranslation } from 'react-i18next';
import { CheckCircle2, HelpCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';

interface InstallationConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onNeedHelp: () => void;
}

/**
 * InstallationConfirmationDialog
 *
 * Displayed after AI installation command completes.
 * Asks user to confirm whether installation is complete.
 *
 * Features:
 * - Clear question: "AI 是否已经安装完成？"
 * - Primary action: "是，继续" (Yes, continue)
 * - Secondary action: "否，需要帮助" (No, need help)
 */
export function InstallationConfirmationDialog({
  isOpen,
  onConfirm,
  onNeedHelp,
}: InstallationConfirmationDialogProps) {
  const { t } = useTranslation('onboarding');

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-full">
              <HelpCircle className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-lg">
              {t('installationConfirmation.title')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            {t('installationConfirmation.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">{t('installationConfirmation.checkTitle')}</p>
              <p className="text-muted-foreground mt-1">
                {t('installationConfirmation.checkDescription')}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 mt-4">
          <Button
            variant="outline"
            onClick={onNeedHelp}
            className="w-full sm:w-auto"
          >
            {t('installationConfirmation.needHelp')}
          </Button>
          <Button
            onClick={onConfirm}
            className="w-full sm:w-auto bg-primary text-primary-foreground"
          >
            {t('installationConfirmation.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InstallationConfirmationDialog;
