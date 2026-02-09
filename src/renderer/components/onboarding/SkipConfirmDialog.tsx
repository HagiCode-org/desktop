import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';

interface SkipConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function SkipConfirmDialog({ open, onConfirm, onCancel }: SkipConfirmDialogProps) {
  const { t } = useTranslation('onboarding');

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('skip.title')}</DialogTitle>
          <DialogDescription className="pt-2">
            {t('skip.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('skip.manualInstallNote')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('skip.reenableNote')}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t('skip.cancel')}
          </Button>
          <Button variant="default" onClick={onConfirm}>
            {t('skip.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SkipConfirmDialog;
