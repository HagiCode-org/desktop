import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { CheckCircle2, Loader2, Rocket, ExternalLink, Github, FileText } from 'lucide-react';
import { Button } from '../../ui/button';
import { selectServiceProgress, selectDownloadProgress } from '../../../store/slices/onboardingSlice';
import { completeOnboarding, startService } from '../../../store/thunks/onboardingThunks';
import { fetchActiveVersionAction } from '../../../store/sagas/webServiceSaga';
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
  const isStartingService = useSelector((state: RootState) => state.onboarding.isStartingService);

  const isRunning = serviceProgress?.phase === 'running';
  const isStarting = serviceProgress?.phase === 'starting';
  const hasStarted = isStartingService || isStarting || isRunning;

  // Use ref to track if we've already triggered the start
  const hasTriggeredStartRef = useRef(false);

  const handleComplete = () => {
    const version = downloadProgress?.version;
    if (version) {
      dispatch(completeOnboarding(version));
      // Refresh the web service state to sync with the onboarding state
      dispatch(fetchActiveVersionAction());
    }
    onComplete?.();
  };

  // Auto-start service when entering this step
  // Only trigger once per component lifecycle
  useEffect(() => {
    if (!hasTriggeredStartRef.current && !hasStarted && downloadProgress?.version) {
      console.log('[ServiceLauncher] Auto-starting service for version:', downloadProgress.version);
      hasTriggeredStartRef.current = true;
      dispatch(startService(downloadProgress.version));
    }
  }, [hasStarted, downloadProgress?.version, dispatch]);

  return (
    <div className="space-y-8">
      {/* Status header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            {isRunning ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <Rocket className="h-8 w-8 text-primary animate-pulse" />
            )}
          </div>
        </div>
        <h2 className="text-2xl font-semibold">
          {isRunning ? t('launch.complete.title') : t('launch.starting.title')}
        </h2>
        <p className="text-muted-foreground">
          {isRunning ? t('launch.complete.subtitle') : t('launch.starting.subtitle')}
        </p>
      </div>

      {/* Progress info */}
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

      {/* Complete state */}
      {isRunning && (
        <div className="space-y-6">
          {/* Success message */}
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

          {/* Installation info */}
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
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('launch.installInfo.url')}</span>
                  <a
                    href={serviceProgress.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {serviceProgress.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* What's next */}
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

          {/* Support links */}
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

          {/* Complete button */}
          <div className="flex justify-center pt-4">
            <Button onClick={handleComplete} size="lg" className="gap-2">
              {t('launch.complete.button')}
              <Rocket className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceLauncher;
