import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { CheckCircle2, Circle, Loader2, AlertCircle, Package, Download } from 'lucide-react';
import { Progress } from '../../ui/progress';
import { Button } from '../../ui/button';
import { selectDependenciesStatus, selectDownloadProgress } from '../../../store/slices/onboardingSlice';
import { installDependencies } from '../../../store/thunks/onboardingThunks';
import type { RootState } from '../../../store';
import type { AppDispatch } from '../../../store';

function DependencyInstaller() {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch<AppDispatch>();
  const dependencies = useSelector((state: RootState) => selectDependenciesStatus(state));
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const isInstallingFromState = useSelector((state: RootState) => state.onboarding.isInstallingDependencies);

  const [isInstalling, setIsInstalling] = useState(false);

  const isInstallingGlobally = isInstalling || isInstallingFromState;

  const handleInstallDependencies = useCallback(() => {
    // Prevent duplicate installation calls
    if (isInstallingGlobally) {
      console.log('[DependencyInstaller] Installation already in progress, ignoring duplicate request');
      return;
    }

    if (downloadProgress?.version) {
      setIsInstalling(true);
      dispatch(installDependencies(downloadProgress.version));
    }
  }, [dispatch, downloadProgress, isInstallingGlobally]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'installed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'installing':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = (dep: { status: string; version?: string }) => {
    switch (dep.status) {
      case 'installed':
        return dep.version || t('dependencies.status.installed');
      case 'installing':
        return t('dependencies.status.installing');
      case 'error':
        return t('dependencies.status.error');
      default:
        return t('dependencies.status.pending');
    }
  };

  const overallProgress = dependencies.length > 0
    ? dependencies.reduce((sum, dep) => sum + dep.progress, 0) / dependencies.length
    : 0;

  const allComplete = dependencies.length > 0 &&
    dependencies.every(dep => dep.status === 'installed');

  const hasError = dependencies.some(dep => dep.status === 'error');
  const hasInstalling = dependencies.some(dep => dep.status === 'installing');

  const hasPendingDependencies = dependencies.length > 0 &&
    dependencies.some(dep => dep.status === 'pending' || dep.status === 'error');

  return (
    <div className="space-y-8">
      {/* Status header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            {allComplete ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <Package className="h-8 w-8 text-primary" />
            )}
          </div>
        </div>
        <h2 className="text-2xl font-semibold">
          {allComplete ? t('dependencies.complete.title') : t('dependencies.installing.title')}
        </h2>
        <p className="text-muted-foreground">
          {t('dependencies.description')}
        </p>
      </div>

      {/* Install dependencies button */}
      {hasPendingDependencies && !hasInstalling && !isInstallingGlobally && (
        <div className="flex justify-center">
          <Button
            onClick={handleInstallDependencies}
            size="lg"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {t('dependencies.installButton')}
          </Button>
        </div>
      )}

      {/* Overall progress */}
      {dependencies.length > 0 && !allComplete && (
        <div className="bg-muted/20 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('dependencies.overallProgress')}</span>
            <span className="font-medium">{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      )}

      {/* Dependencies list */}
      <div className="space-y-3">
        {dependencies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('dependencies.checking')}
          </div>
        ) : (
          dependencies.map((dep, index) => (
            <div
              key={index}
              className={`bg-muted/20 rounded-lg p-4 space-y-3 ${
                dep.status === 'installing' ? 'ring-2 ring-primary/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(dep.status)}
                  <div>
                    <p className="font-medium">{dep.name}</p>
                    <p className="text-sm text-muted-foreground">{getStatusText(dep)}</p>
                  </div>
                </div>
                {dep.requiredVersion && (
                  <span className="text-sm text-muted-foreground">
                    {dep.requiredVersion}
                  </span>
                )}
              </div>

              {/* Individual progress for installing dependency */}
              {dep.status === 'installing' && dep.progress > 0 && (
                <div className="space-y-2">
                  <Progress value={dep.progress} className="h-1" />
                </div>
              )}

              {/* Error message */}
              {dep.status === 'error' && dep.error && (
                <div className="text-sm text-destructive">
                  {dep.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Complete message */}
      {allComplete && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <p className="text-sm text-green-600 dark:text-green-400">
            {t('dependencies.complete.message')}
          </p>
        </div>
      )}

      {/* Error message */}
      {hasError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm text-destructive">
            {t('dependencies.error.message')}
          </p>
        </div>
      )}
    </div>
  );
}

export default DependencyInstaller;
