import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Github,
  Loader2,
  RefreshCw,
  Rocket,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Alert, AlertDescription } from '../../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import {
  hideStartupFailureDialog,
  selectDownloadProgress,
  selectIsRecoveringFromStartupFailure,
  selectOnboardingError,
  selectServiceProgress,
  selectShowStartupFailureDialog,
  selectStartupFailure,
  showStartupFailureDialog,
} from '../../../store/slices/onboardingSlice';
import {
  completeOnboarding,
  recoverFromStartupFailure,
  startService,
} from '../../../store/thunks/onboardingThunks';
import { writeTextToClipboard } from '../../../lib/clipboard.js';
import { fetchActiveVersion } from '../../../store/thunks/webServiceThunks';
import type { RootState } from '../../../store';
import type { AppDispatch } from '../../../store';

interface ServiceLauncherProps {
  onComplete?: () => void;
}

function ServiceLauncher({ onComplete }: ServiceLauncherProps) {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch<AppDispatch>();
  const serviceProgress = useSelector((state: RootState) => selectServiceProgress(state));
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const startupFailure = useSelector((state: RootState) => selectStartupFailure(state));
  const showFailureDialog = useSelector((state: RootState) => selectShowStartupFailureDialog(state));
  const onboardingError = useSelector((state: RootState) => selectOnboardingError(state));
  const isStartingService = useSelector((state: RootState) => state.onboarding.isStartingService);
  const isRecovering = useSelector((state: RootState) => selectIsRecoveringFromStartupFailure(state));

  const isRunning = serviceProgress?.phase === 'running';
  const isStarting = serviceProgress?.phase === 'starting';
  const isFailed = serviceProgress?.phase === 'error';
  const hasStarted = isStartingService || isStarting || isRunning;
  const hasTriggeredStartRef = useRef(false);

  const handleComplete = () => {
    const version = downloadProgress?.version;
    if (version) {
      dispatch(completeOnboarding(version));
      dispatch(fetchActiveVersion());
    }
    onComplete?.();
  };

  const handleRetryStart = () => {
    const version = downloadProgress?.version;
    if (!version || isRecovering) {
      return;
    }

    dispatch(startService(version));
  };

  const handleRecover = () => {
    const version = downloadProgress?.version;
    if (!version || isRecovering) {
      return;
    }

    dispatch(recoverFromStartupFailure(version));
  };

  const handleCopyStartupFailureLog = async () => {
    if (!startupFailure?.log) {
      toast.error(t('launch.failure.copyEmpty'));
      return;
    }

    try {
      await writeTextToClipboard(startupFailure.log);
      toast.success(t('launch.failure.copySuccess'));
    } catch (error) {
      console.error('Failed to copy onboarding startup failure log:', error);
      toast.error(t('launch.failure.copyError'));
    }
  };

  useEffect(() => {
    if (!hasTriggeredStartRef.current && !hasStarted && downloadProgress?.version) {
      console.log('[ServiceLauncher] Auto-starting service for version:', downloadProgress.version);
      hasTriggeredStartRef.current = true;
      dispatch(startService(downloadProgress.version));
    }
  }, [hasStarted, downloadProgress?.version, dispatch]);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className={`p-3 rounded-full ${isFailed ? 'bg-destructive/10' : 'bg-primary/10'}`}>
            {isRunning ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : isFailed ? (
              <AlertTriangle className="h-8 w-8 text-destructive" />
            ) : (
              <Rocket className="h-8 w-8 text-primary animate-pulse" />
            )}
          </div>
        </div>
        <h2 className="text-2xl font-semibold">
          {isRunning
            ? t('launch.complete.title')
            : isFailed
              ? t('launch.failure.title')
              : t('launch.starting.title')}
        </h2>
        <p className="text-muted-foreground">
          {isRunning
            ? t('launch.complete.subtitle')
            : isFailed
              ? t('launch.failure.subtitle')
              : t('launch.starting.subtitle')}
        </p>
      </div>

      {isStarting && serviceProgress && (
        <div className="bg-muted/20 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <span className="font-medium">{serviceProgress.message}</span>
          </div>
          {serviceProgress.progress > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('launch.progress')}</span>
                <span className="font-medium">{serviceProgress.progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${serviceProgress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {isFailed && startupFailure && (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-3">
                <div>
                  <p className="font-medium">{startupFailure.summary}</p>
                  <p className="text-sm opacity-90">{t('launch.failure.guidance')}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => dispatch(showStartupFailureDialog())} disabled={isRecovering}>
                    {t('launch.failure.viewLog')}
                  </Button>
                  <Button variant="outline" onClick={handleRetryStart} disabled={isRecovering} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {t('launch.failure.retryButton')}
                  </Button>
                  <Button onClick={handleRecover} disabled={isRecovering} className="gap-2">
                    {isRecovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                    {isRecovering ? t('launch.failure.reinstallingButton') : t('launch.failure.reinstallButton')}
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {onboardingError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{onboardingError}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {isRunning && (
        <div className="space-y-6">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium text-green-600 dark:text-green-400">
                  {t('launch.complete.success')}
                </p>
                <p className="text-sm text-green-600/80 dark:text-green-400/80 mt-1">
                  {t('launch.complete.ready')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-muted/20 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">{t('launch.installInfo.title')}</h3>
            <div className="space-y-3 text-sm">
              {downloadProgress?.version && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('launch.installInfo.version')}</span>
                  <span className="font-medium">{downloadProgress.version}</span>
                </div>
              )}
              {serviceProgress?.port && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('launch.installInfo.port')}</span>
                  <span className="font-medium">{serviceProgress.port}</span>
                </div>
              )}
              {serviceProgress?.url && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{t('launch.installInfo.url')}</span>
                  <a
                    href={serviceProgress.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 break-all"
                  >
                    {serviceProgress.url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="bg-muted/20 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">{t('launch.whatsNext.title')}</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{t('launch.whatsNext.manage')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{t('launch.whatsNext.webUI')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{t('launch.whatsNext.logs')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{t('launch.whatsNext.config')}</span>
              </li>
            </ul>
          </div>

          <div className="bg-muted/20 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">{t('launch.support.title')}</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" asChild>
                <a href="https://hagicode.com/docs" target="_blank" rel="noopener noreferrer" className="gap-2">
                  <FileText className="h-4 w-4" />
                  {t('launch.support.docs')}
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="https://github.com/hagicode/issues" target="_blank" rel="noopener noreferrer" className="gap-2">
                  <Github className="h-4 w-4" />
                  {t('launch.support.issues')}
                </a>
              </Button>
            </div>
          </div>

          <div className="flex justify-center pt-4">
            <Button onClick={handleComplete} size="lg" className="gap-2">
              {t('launch.complete.button')}
              <Rocket className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={showFailureDialog}
        onOpenChange={(open) => {
          if (!open && !isRecovering) {
            dispatch(hideStartupFailureDialog());
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('launch.failure.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {startupFailure?.summary || t('launch.failure.emptySummary')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-xs text-muted-foreground font-mono">
              {startupFailure
                ? t('launch.failure.meta', {
                    port: startupFailure.port,
                    timestamp: startupFailure.timestamp,
                  })
                : t('launch.failure.emptyLog')}
            </div>
            <pre className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">
              {startupFailure?.log || t('launch.failure.emptyLog')}
            </pre>
            {startupFailure?.truncated && (
              <div className="text-xs text-muted-foreground">
                {t('launch.failure.truncatedHint')}
              </div>
            )}
            <Alert>
              <Wrench className="h-4 w-4" />
              <AlertDescription>{t('launch.failure.recoveryHint')}</AlertDescription>
            </Alert>
            {onboardingError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{onboardingError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="sm:justify-between gap-3">
            <Button variant="outline" onClick={handleCopyStartupFailureLog} disabled={isRecovering}>
              {t('launch.failure.copyButton')}
            </Button>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={handleRetryStart} disabled={isRecovering} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                {t('launch.failure.retryButton')}
              </Button>
              <Button onClick={handleRecover} disabled={isRecovering} className="gap-2">
                {isRecovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                {isRecovering ? t('launch.failure.reinstallingButton') : t('launch.failure.reinstallButton')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServiceLauncher;
