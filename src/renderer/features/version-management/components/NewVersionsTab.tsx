import { CheckCircle, Download, Loader2, Package, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RootState } from '@/store';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectIsInstallingFromState,
  selectInstallProgress,
  selectInstallingVersionId,
  selectWebServiceOperating,
} from '@/store/slices/webServiceSlice';
import { installWebServicePackage } from '@/store/thunks/webServiceThunks';
import type { InstalledVersion, Version, VersionManagementTabProps } from '../types';

export default function NewVersionsTab({
  availableVersions,
  installedVersions,
  getPlatformLabel,
  renderInstallTelemetry,
  getInstallProgressText,
  onRefresh,
}: VersionManagementTabProps) {
  const { t } = useTranslation('pages');
  const dispatch = useDispatch();
  const webServiceOperating = useSelector((state: RootState) => selectWebServiceOperating(state));
  const isInstallingFromState = useSelector((state: RootState) => selectIsInstallingFromState(state));
  const webServiceInstallProgress = useSelector((state: RootState) => selectInstallProgress(state));
  const installingVersionId = useSelector((state: RootState) => selectInstallingVersionId(state));
  const [isVersionsExpanded, setIsVersionsExpanded] = useState(false);

  const handleInstall = (versionId: string) => {
    if (isInstallingFromState || webServiceOperating) return;
    dispatch(installWebServicePackage(versionId));
  };

  const displayVersions = isVersionsExpanded ? availableVersions : availableVersions.slice(0, 3);
  const remainingCount = availableVersions.length - 3;
  const showExpandButton = availableVersions.length > 3;

  return (
    <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Download className="h-5 w-5 text-primary" />
          {t('versionManagement.availableVersions')}
        </h2>
        <button type="button" onClick={onRefresh} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted">
          <RefreshCw className="h-4 w-4" />
          {t('versionManagement.actions.refresh')}
        </button>
      </div>
      <div className="space-y-3">
        {displayVersions.map((version: Version) => {
          const installed = installedVersions.find((item: InstalledVersion) => item.id === version.id);
          const isInstallingCurrentVersion = isInstallingFromState && installingVersionId === version.id;

          return (
            <div key={version.id} className="rounded-2xl border border-border/70 bg-background/60 p-4 transition-colors hover:border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{version.packageFilename}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{getPlatformLabel(version.platform)}</span>
                      {installed && <span className="text-primary">• {t('versionManagement.installed')}</span>}
                    </div>
                  </div>
                </div>
                {!installed ? (
                  isInstallingCurrentVersion && webServiceInstallProgress ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${webServiceInstallProgress.progress}%` }} />
                      </div>
                      <span className="min-w-[60px] text-xs text-muted-foreground">
                        {webServiceInstallProgress.stage === 'fetching-torrent' && t('versionManagement.downloadStage.fetchingTorrent')}
                        {['downloading', 'backfilling', 'extracting'].includes(webServiceInstallProgress.stage) && `${webServiceInstallProgress.progress}%`}
                        {webServiceInstallProgress.stage === 'verifying' && t('versionManagement.verifying')}
                        {webServiceInstallProgress.stage === 'switching' && t('versionManagement.switching')}
                        {webServiceInstallProgress.stage === 'completed' && t('versionManagement.completed')}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleInstall(version.id)}
                      disabled={isInstallingFromState || webServiceOperating}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isInstallingCurrentVersion ? <><Loader2 className="h-4 w-4 animate-spin" />{getInstallProgressText()}</> : <><Download className="h-4 w-4" />{t('versionManagement.actions.install')}</>}
                    </button>
                  )
                ) : (
                  <span className="flex items-center gap-1 text-sm text-primary">
                    <CheckCircle className="h-4 w-4" />
                    {t('versionManagement.installed')}
                  </span>
                )}
              </div>
              {renderInstallTelemetry(version.id)}
            </div>
          );
        })}
        {showExpandButton && (
          <button onClick={() => setIsVersionsExpanded(!isVersionsExpanded)} className="mt-4 flex w-full items-center justify-center gap-2 py-2 text-sm text-primary transition-colors hover:text-primary/80">
            {isVersionsExpanded ? t('versionManagement.actions.showLessVersions') : t('versionManagement.actions.showMoreVersions', { count: remainingCount })}
          </button>
        )}
        {availableVersions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 p-8 text-center text-muted-foreground">
            <Package className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p>{t('versionManagement.noVersionsAvailable')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
