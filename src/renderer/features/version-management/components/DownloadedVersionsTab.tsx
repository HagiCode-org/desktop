import { AlertCircle, CheckCircle, FolderOpen, HardDrive, Package, RefreshCw, Rocket, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { InstalledVersion, VersionManagementTabProps } from '../types';

export default function DownloadedVersionsTab({
  installedVersions,
  onReinstall,
  onOpenLogs,
  onSwitch,
  onUninstall,
  onStartOnboarding,
  switching,
  uninstalling,
  isInstalling,
  installProgress,
  getInstallProgressText,
  renderInstallTelemetry,
  getVersionStatus,
  getPlatformLabel,
  formatDate,
  isDesktopIncompatible,
  getDesktopCompatibility,
}: VersionManagementTabProps) {
  const { t } = useTranslation('pages');

  return (
    <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
      {installedVersions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 p-12">
          <div className="space-y-6 text-center">
            <div className="flex justify-center"><div className="rounded-full bg-primary/10 p-4"><Rocket className="h-12 w-12 text-primary" /></div></div>
            <div>
              <h2 className="mb-2 text-2xl font-bold text-foreground">{t('versionManagement.noVersionsInstalled.title')}</h2>
              <p className="mx-auto max-w-md text-muted-foreground">{t('versionManagement.noVersionsInstalled.description')}</p>
            </div>
            <Button onClick={onStartOnboarding}><Rocket className="h-5 w-5" />{t('versionManagement.noVersionsInstalled.startButton')}</Button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
            <HardDrive className="h-5 w-5 text-primary" />
            {t('versionManagement.installedVersions')}
          </h2>
          <div className="space-y-3">
            {installedVersions.map((version) => {
              const compatibility = getDesktopCompatibility(version);
              return (
                <div key={version.id} className="overflow-hidden rounded-2xl border border-border/70 bg-background/60">
                  <div className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Package className="h-5 w-5 text-primary" /></div>
                        <div>
                          <div className="flex items-center gap-2"><h3 className="font-semibold text-foreground">{version.packageFilename}</h3>{getVersionStatus(version)}</div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{getPlatformLabel(version.platform)}</span><span>•</span>
                            <span>{t('versionManagement.installedAt')}: {formatDate(version.installedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isInstalling && installProgress ? (
                          <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${installProgress.progress}%` }} /></div>
                            <span className="min-w-[50px] text-xs text-muted-foreground">{['downloading', 'backfilling', 'extracting'].includes(installProgress.stage) ? `${installProgress.progress}%` : getInstallProgressText()}</span>
                          </div>
                        ) : (
                          <button onClick={() => onReinstall(version.id)} disabled={isInstalling || switching === version.id} className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50" title={t('versionManagement.actions.reinstallPackage')}>
                            <RefreshCw className="h-4 w-4" />{t('versionManagement.actions.reinstall')}
                          </button>
                        )}
                        <button onClick={() => onOpenLogs(version.id)} className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80" title={t('versionManagement.actions.openLogs')}>
                          <FolderOpen className="h-4 w-4" />{t('versionManagement.actions.openLogs')}
                        </button>
                        {!version.isActive && (
                          <button onClick={() => onSwitch(version.id)} disabled={switching === version.id || isInstalling || isDesktopIncompatible(version)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50" title={isDesktopIncompatible(version) ? t('versionManagement.actions.switchDisabledDesktop') : undefined}>
                            {switching === version.id ? <><Loader2 className="h-3 w-3 animate-spin" />{t('versionManagement.switching')}</> : <><RefreshCw className="h-4 w-4" />{t('versionManagement.actions.switch')}</>}
                          </button>
                        )}
                        {!version.isActive && (
                          <button onClick={() => onUninstall(version.id)} disabled={uninstalling === version.id || isInstalling} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50" title={t('versionManagement.actions.uninstall')}>
                            {uninstalling === version.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {isDesktopIncompatible(version) && (
                      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-300" />
                          <div className="space-y-2 text-sm">
                            <p className="font-medium text-amber-900 dark:text-amber-100">{t('versionManagement.desktopCompatibility.blockedTitle')}</p>
                            <div className="grid gap-1 text-amber-900/90 dark:text-amber-100/90">
                              <p>{t('versionManagement.desktopCompatibility.requiredVersion')} <span className="font-mono">{compatibility?.requiredVersion}</span></p>
                              <p>{t('versionManagement.desktopCompatibility.currentVersion')} <span className="font-mono">{compatibility?.currentVersion}</span></p>
                            </div>
                            <p className="text-xs text-amber-800/90 dark:text-amber-200/90">{compatibility?.reason ?? t('versionManagement.desktopCompatibility.upgradeGuidance')}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {renderInstallTelemetry(version.id)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
