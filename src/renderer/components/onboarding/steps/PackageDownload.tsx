import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { CheckCircle2, Download, HardDrive, AlertCircle } from 'lucide-react';
import { Progress } from '../../ui/progress';
import { selectDownloadProgress, selectOnboardingError } from '../../../store/slices/onboardingSlice';
import type { RootState } from '../../../store';

function PackageDownload() {
  const { t } = useTranslation('onboarding');
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const error = useSelector((state: RootState) => selectOnboardingError(state));

  const isComplete = downloadProgress?.progress === 100;
  const isInProgress = downloadProgress && downloadProgress.progress > 0 && downloadProgress.progress < 100;

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
    <div className="space-y-8">
      {/* Status header */}
      <div className="text-center space-y-2">
        {error ? (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-destructive/10 rounded-full">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-destructive">下载失败</h2>
          </>
        ) : isComplete ? (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-green-500/10 rounded-full">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold">{t('download.complete.title')}</h2>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Download className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold">{t('download.downloading.title')}</h2>
          </>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Download info card */}
      <div className="bg-muted/20 rounded-lg p-6 space-y-6">
        {/* Version info */}
        {downloadProgress?.version && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span>{t('download.version')}</span>
            </div>
            <p className="font-medium">{downloadProgress.version}</p>
          </div>
        )}

        {/* Progress bar */}
        {isInProgress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('download.progress')}</span>
              <span className="font-medium">{downloadProgress.progress}%</span>
            </div>
            <Progress value={downloadProgress.progress} className="h-2" />
          </div>
        )}

        {/* Download stats */}
        {isInProgress && downloadProgress && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">{t('download.downloaded')}</p>
              <p className="font-medium">
                {formatBytes(downloadProgress.downloadedBytes)} / {formatBytes(downloadProgress.totalBytes)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">{t('download.speed')}</p>
              <p className="font-medium">{formatSpeed(downloadProgress.speed)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">{t('download.remaining')}</p>
              <p className="font-medium">{formatTime(downloadProgress.remainingSeconds)}</p>
            </div>
          </div>
        )}

        {/* Complete message */}
        {isComplete && downloadProgress && (
          <div className="space-y-2">
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">
                {t('download.complete.message')}
              </p>
            </div>
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">{t('download.fileSize')}</p>
              <p className="font-medium">{formatBytes(downloadProgress.totalBytes)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      {isInProgress && (
        <div className="text-center text-sm text-muted-foreground">
          {t('download.pleaseWait')}
        </div>
      )}
    </div>
  );
}

export default PackageDownload;
