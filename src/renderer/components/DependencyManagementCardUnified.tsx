import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { Download, RefreshCw } from 'lucide-react';
import {
  fetchDependencies,
  checkDependenciesAfterInstall,
} from '../store/thunks/dependencyThunks';
import {
  selectDependencies,
  selectDependenciesLoading,
  type DependencyItem,
} from '../store/slices/dependencySlice';
import { selectDownloadProgress } from '../store/slices/onboardingSlice';
import type { AppDispatch } from '../store';

export interface DependencyManagementCardProps {
  versionId: string;
  context?: 'version-management' | 'onboarding';
  onInstallComplete?: () => void;
  showAdvancedOptions?: boolean;
}

function isManualInstallRequired(dep: DependencyItem): boolean {
  return dep.primaryAction === 'manual-install' || dep.status === 'manual-install-required';
}

export function DependencyManagementCard({
  versionId,
  context = 'version-management',
  onInstallComplete,
}: DependencyManagementCardProps) {
  const { t } = useTranslation(context === 'onboarding' ? 'onboarding' : 'components');
  const dispatch = useDispatch<AppDispatch>();
  const dependencies = useSelector(selectDependencies);
  const loading = useSelector(selectDependenciesLoading);
  const downloadProgress = useSelector(selectDownloadProgress);

  const effectiveVersionId = versionId || downloadProgress?.version || '';

  const refreshDependencies = () => {
    if (effectiveVersionId) {
      dispatch(checkDependenciesAfterInstall({ versionId: effectiveVersionId, context }));
      return;
    }

    dispatch(fetchDependencies());
  };

  useEffect(() => {
    refreshDependencies();
  }, [effectiveVersionId, context, dispatch]);

  useEffect(() => {
    if (!onInstallComplete) {
      return;
    }

    const allSatisfied = dependencies.length > 0 && dependencies.every((dep) => dep.installed && !dep.versionMismatch);
    if (allSatisfied) {
      onInstallComplete();
    }
  }, [dependencies, onInstallComplete]);

  const filteredDependencies = context === 'onboarding'
    ? dependencies.filter((dep) => !dep.installed || dep.versionMismatch)
    : dependencies;

  const manualRequiredDeps = filteredDependencies.filter(isManualInstallRequired);
  const getDependencyStatusText = (dep: DependencyItem) => {
    if (dep.installed && !dep.versionMismatch) {
      return dep.resolutionSource === 'bundled-desktop'
        ? t('dependencyManagement.status.bundled')
        : t('dependencyManagement.status.installed');
    }

    if (isManualInstallRequired(dep)) {
      return t('dependencyManagement.status.manualInstallRequired');
    }

    if (dep.installed && dep.versionMismatch) {
      return t('dependencyManagement.status.versionMismatch');
    }

    return t('dependencyManagement.status.notInstalled');
  };

  const getSourceLabel = (dep: DependencyItem) => {
    if (dep.resolutionSource === 'bundled-desktop') {
      return t('dependencyManagement.details.bundledSource');
    }
    return t('dependencyManagement.details.systemSource');
  };

  const getPrimaryActionLabel = (dep: DependencyItem) => {
    if (dep.primaryAction === 'manual-install') {
      return t('dependencyManagement.actions.viewManualSteps');
    }
    if (dep.primaryAction === 'reinstall-desktop') {
      return t('dependencyManagement.actions.reinstallDesktop');
    }
    if (dep.primaryAction === 'update-desktop') {
      return t('dependencyManagement.actions.updateDesktop');
    }
    if (dep.primaryAction === 'visit-website') {
      return t('dependencyManagement.actions.visitWebsite');
    }

    return t('dependencyManagement.actions.visitWebsite');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">
            {context === 'onboarding' ? t('dependencies.title') : t('dependencyManagement.title')}
          </h2>
          <p className="text-muted-foreground">
            {context === 'onboarding' ? t('dependencies.description') : t('dependencyManagement.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshDependencies}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('dependencyManagement.actions.refresh')}
        </button>
      </div>

      {manualRequiredDeps.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">
            {t('dependencyManagement.manualHandoff.title')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('dependencyManagement.manualHandoff.description')}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('dependencyManagement.manualHandoff.refreshHint')}
          </p>
        </div>
      )}

      {loading && filteredDependencies.length === 0 ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
          <p>{t('dependencyManagement.status.checking')}</p>
        </div>
      ) : (
        <>
          {filteredDependencies.length > 0 ? (
            <div className="scrollbar-hidden max-h-[340px] space-y-3 overflow-y-auto">
              {filteredDependencies.map((dep, index) => {
                const manualAction = dep.manualAction;
                const statusClassName = dep.installed && !dep.versionMismatch
                  ? 'text-green-500'
                  : isManualInstallRequired(dep)
                    ? 'text-amber-500'
                    : dep.installed && dep.versionMismatch
                      ? 'text-yellow-500'
                      : 'text-red-500';

                return (
                  <div
                    key={index}
                    className="rounded-lg border border-border bg-muted/20 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        {dep.installed && !dep.versionMismatch ? (
                          <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : isManualInstallRequired(dep) ? (
                          <svg className="h-5 w-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01m-7.938 4h15.876c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 17c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ) : dep.installed && dep.versionMismatch ? (
                          <svg className="h-5 w-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>

                      <div className="flex-1">
                        <p className="font-medium text-foreground">{dep.name}</p>
                        {dep.resolutionSource === 'bundled-desktop' && (
                          <span className="mt-1 inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {t('dependencyManagement.status.desktopManaged')}
                          </span>
                        )}
                        <p className={`text-sm ${statusClassName}`}>
                          {getDependencyStatusText(dep)}
                        </p>
                        {dep.version && (
                          <span className="text-sm text-muted-foreground">
                            {t('dependencyManagement.details.currentVersion')}: {dep.version}
                          </span>
                        )}
                        {dep.requiredVersion && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t('dependencyManagement.details.requiredVersion')}: {dep.requiredVersion}
                          </p>
                        )}
                        {dep.sourcePath && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {getSourceLabel(dep)}: {dep.sourcePath}
                          </p>
                        )}
                        {dep.description && (
                          <p className="mt-2 text-sm text-muted-foreground">{dep.description}</p>
                        )}
                        {manualAction?.command && (
                          <div className="mt-3 space-y-2 rounded-md border border-border bg-background/60 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {t('dependencyManagement.details.manualCommand')}
                            </p>
                            <code className="block whitespace-pre-wrap break-all text-xs text-foreground">
                              {manualAction.command}
                            </code>
                            <p className="text-xs text-muted-foreground">
                              {t('dependencyManagement.manualHandoff.refreshHint')}
                            </p>
                          </div>
                        )}
                        {!dep.installed && dep.downloadUrl && !isManualInstallRequired(dep) && (
                          <div className="mt-3">
                            <a
                              href={dep.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              <Download className="h-4 w-4" />
                              {getPrimaryActionLabel(dep)}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              {context === 'onboarding' ? t('dependencies.complete.message') : t('dependencyManagement.noDependencies')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
