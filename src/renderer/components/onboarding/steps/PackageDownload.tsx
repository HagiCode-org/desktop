import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { CheckCircle2, Download, HardDrive, AlertCircle } from 'lucide-react';
import { Progress } from '../../ui/progress';
import { Alert, AlertDescription } from '../../ui/alert';
import { selectDownloadProgress, selectOnboardingError } from '../../../store/slices/onboardingSlice';
import type { RootState } from '../../../store';
import { cn } from '@/lib/utils';

function PackageDownload() {
  const { t } = useTranslation('onboarding');
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const error = useSelector((state: RootState) => selectOnboardingError(state));

  const isComplete = downloadProgress?.progress === 100;
  const isInProgress = downloadProgress && downloadProgress.progress > 0 && downloadProgress.progress < 100;
  const progressValue = downloadProgress?.progress ?? (isComplete ? 100 : 0);
  const statusTitle = error
    ? t('download.title')
    : isComplete
      ? t('download.complete.title')
      : t('download.downloading.title');
  const statusDescription = error
    ? null
    : isComplete
      ? t('download.complete.message')
      : t('download.pleaseWait');

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return `${formatBytes(bytesPerSecond)}/s`;
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-2xl border bg-muted/20 p-6 sm:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl',
                error ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
              )}
            >
              {error ? (
                <AlertCircle className="h-7 w-7" />
              ) : isComplete ? (
                <CheckCircle2 className="h-7 w-7" />
              ) : (
                <Download className={cn('h-7 w-7', isInProgress && 'animate-pulse')} />
              )}
            </div>

            <div className="space-y-2">
              <h2 className={cn('text-2xl font-semibold tracking-tight', error && 'text-destructive')}>
                {statusTitle}
              </h2>
              {statusDescription && (
                <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{statusDescription}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card px-4 py-3">
            <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">
              {downloadProgress?.version ? t('download.version') : t('download.progress')}
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {downloadProgress?.version ?? `${progressValue}%`}
            </div>
          </div>
        </div>

        {(isInProgress || isComplete) && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('download.progress')}</span>
              <span className="font-medium text-foreground">{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {downloadProgress?.version && (
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span>{t('download.version')}</span>
            </div>
            <p className="mt-2 font-medium text-foreground">{downloadProgress.version}</p>
          </div>
        )}

        {(isInProgress || isComplete) && downloadProgress && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t('download.downloaded')}</p>
            <p className="mt-2 font-medium text-foreground">
              {formatBytes(downloadProgress.downloadedBytes)} / {formatBytes(downloadProgress.totalBytes)}
            </p>
          </div>
        )}

        {isInProgress && downloadProgress && (
          <>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t('download.speed')}</p>
              <p className="mt-2 font-medium text-foreground">{formatSpeed(downloadProgress.speed)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t('download.remaining')}</p>
              <p className="mt-2 font-medium text-foreground">{formatTime(downloadProgress.remainingSeconds)}</p>
            </div>
          </>
        )}

        {isComplete && downloadProgress && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t('download.fileSize')}</p>
            <p className="mt-2 font-medium text-foreground">{formatBytes(downloadProgress.totalBytes)}</p>
          </div>
        )}
      </div>

      {!error && !isInProgress && !isComplete && (
        <Alert>
          <Download className="h-4 w-4" />
          <AlertDescription>{t('download.pleaseWait')}</AlertDescription>
        </Alert>
      )}

      {!error && isComplete && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{t('download.complete.message')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default PackageDownload;
