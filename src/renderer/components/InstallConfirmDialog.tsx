import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import {
  selectShowInstallConfirm,
  hideInstallConfirm,
  selectWebServiceOperating,
} from '../store/slices/webServiceSlice';
import {
  confirmInstallAndStopAction,
} from '../store/sagas/webServiceSaga';

export default function InstallConfirmDialog() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();
  const open = useSelector(selectShowInstallConfirm);
  const isOperating = useSelector(selectWebServiceOperating);

  const handleCancel = () => {
    dispatch(hideInstallConfirm());
  };

  const handleConfirm = () => {
    dispatch(confirmInstallAndStopAction());
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleCancel();
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            {t('installConfirm.title')}
          </DialogTitle>
          <DialogDescription>
            {t('installConfirm.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="font-medium">{t('installConfirm.continueWill')}</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
            <li>{t('installConfirm.warnings.stopService')}</li>
            <li>{t('installConfirm.warnings.interruptRequests')}</li>
            <li>{t('installConfirm.warnings.installOperation')}</li>
          </ul>

          <p className="text-muted-foreground">
            {t('installConfirm.manualRestart')}
          </p>

          <p className="font-medium">
            {t('installConfirm.shouldContinue')}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isOperating}
          >
            {t('installConfirm.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isOperating}
          >
            {isOperating ? t('installConfirm.stopping') : t('installConfirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
