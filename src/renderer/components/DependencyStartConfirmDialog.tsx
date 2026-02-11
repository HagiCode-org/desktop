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
import { Alert, AlertDescription } from './ui/alert';
import {
  selectShowStartConfirm,
  selectMissingDependenciesList,
  hideStartConfirmDialog,
  selectWebServiceOperating,
} from '../store/slices/webServiceSlice';
import {
  confirmStartWithWarning,
} from '../store/thunks/webServiceThunks';
import type { DependencyItem } from '../store/slices/webServiceSlice';

export default function DependencyStartConfirmDialog() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();
  const open = useSelector(selectShowStartConfirm);
  const missingDependencies = useSelector(selectMissingDependenciesList);
  const isOperating = useSelector(selectWebServiceOperating);

  const handleCancel = () => {
    dispatch(hideStartConfirmDialog());
  };

  const handleConfirm = () => {
    dispatch(confirmStartWithWarning());
  };

  const getDependencyIcon = (dep: DependencyItem) => {
    if (!dep.installed) return '❌';
    if (dep.versionMismatch) return '⚠️';
    return '✅';
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open && !isOperating) {
        handleCancel();
      }
    }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            {t('dependencyStartConfirm.title')}
          </DialogTitle>
          <DialogDescription className="space-y-4">
            <p className="text-sm">{t('dependencyStartConfirm.description')}</p>

            {/* Missing Dependencies List */}
            {missingDependencies.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('dependencyStartConfirm.missingDependencies')}</p>
                <div className="space-y-2 bg-muted/50 p-3 rounded-md">
                  {missingDependencies.map((dep, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 flex-1">
                        <span>{getDependencyIcon(dep)}</span>
                        <div className="flex flex-col">
                          <span className="font-medium">{dep.name}</span>
                          {dep.version && (
                            <span className="text-xs text-muted-foreground">
                              {t('dependencyStartConfirm.currentVersion')}: {dep.version}
                              {dep.requiredVersion && ` (${t('dependencyStartConfirm.required')}: ${dep.requiredVersion})`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Warning */}
            <Alert variant="warning">
              <AlertDescription className="text-sm">
                <p className="font-medium mb-2">{t('dependencyStartConfirm.risksTitle')}</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>{t('dependencyStartConfirm.risks.startupFailure')}</li>
                  <li>{t('dependencyStartConfirm.risks.featureUnavailable')}</li>
                  <li>{t('dependencyStartConfirm.risks.runtimeErrors')}</li>
                </ul>
              </AlertDescription>
            </Alert>

            {/* Confirmation Question */}
            <p className="text-sm font-medium text-foreground">
              {t('dependencyStartConfirm.confirmation')}
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isOperating}
          >
            {t('dependencyStartConfirm.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isOperating}
            variant="default"
          >
            {isOperating ? t('dependencyStartConfirm.starting') : t('dependencyStartConfirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
