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
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { XCircle, AlertCircle, Package, Download } from 'lucide-react';
import {
  selectShowInstallConfirm,
  selectPendingDependencies,
  selectInstallConfirmVersionId,
  selectInstallProgress,
  hideInstallConfirm,
} from '../store/slices/dependencySlice';
import { INSTALL_FROM_MANIFEST } from '../store/sagas/dependencySaga';

export function DependencyInstallConfirmDialog() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();

  const show = useSelector(selectShowInstallConfirm);
  const dependencies = useSelector(selectPendingDependencies);
  const versionId = useSelector(selectInstallConfirmVersionId);
  const installProgress = useSelector(selectInstallProgress);

  const handleConfirm = () => {
    if (versionId) {
      dispatch({ type: INSTALL_FROM_MANIFEST, payload: versionId });
    }
  };

  const handleCancel = () => {
    if (!installProgress.installing) {
      dispatch(hideInstallConfirm());
    }
  };

  const getProgressPercentage = () => {
    if (installProgress.total === 0) return 0;
    return (installProgress.current / installProgress.total) * 100;
  };

  return (
    <Dialog open={show} onOpenChange={(open) => {
      if (!open && !installProgress.installing) {
        handleCancel();
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {installProgress.installing
              ? t('depInstallConfirm.installingTitle')
              : t('depInstallConfirm.title')
            }
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {installProgress.installing ? (
            // 安装进度视图
            <div className="space-y-4">
              <Progress value={getProgressPercentage()} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {installProgress.currentDependency || t('depInstallConfirm.preparing')}
                </span>
                <span className="text-muted-foreground">
                  {installProgress.current} / {installProgress.total}
                </span>
              </div>

              {installProgress.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {installProgress.errors.length} {t('depInstallConfirm.errorsOccurred')}:
                    <ul className="mt-2 list-disc list-inside">
                      {installProgress.errors.map((err, index) => (
                        <li key={index}>{err.dependency}: {err.error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            // 依赖列表视图
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('depInstallConfirm.description', { count: dependencies.length })}
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dependencies.map((dep, index) => (
                  <div key={index} className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{dep.name}</div>
                        {dep.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {dep.description}
                          </div>
                        )}
                        {dep.requiredVersion && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {t('depInstallConfirm.requiredVersion')}: {dep.requiredVersion}
                          </div>
                        )}
                        {dep.installCommand && typeof dep.installCommand === 'string' && (
                          <code className="text-xs bg-muted px-2 py-1 rounded mt-2 block">
                            {dep.installCommand}
                          </code>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('depInstallConfirm.permissionWarning')}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={installProgress.installing}
          >
            {installProgress.installing
              ? t('depInstallConfirm.installing')
              : t('depInstallConfirm.cancel')
            }
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={installProgress.installing}
          >
            {installProgress.installing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                {t('depInstallConfirm.installing')}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {t('depInstallConfirm.confirm')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
