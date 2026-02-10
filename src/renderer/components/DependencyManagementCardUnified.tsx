import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectDependencies,
  selectDependenciesLoading,
  selectInstallProgress,
} from '../store/slices/dependencySlice';
import { CHECK_DEPENDENCIES_AFTER_INSTALL, INSTALL_SINGLE_DEPENDENCY } from '../store/sagas/dependencySaga';
import { selectDownloadProgress } from '../store/slices/onboardingSlice';
import { Download } from 'lucide-react';

export interface DependencyManagementCardProps {
  versionId: string;
  context?: 'version-management' | 'onboarding';
  onInstallComplete?: () => void;
  showAdvancedOptions?: boolean;
}

export function DependencyManagementCard({
  versionId,
  context = 'version-management',
  onInstallComplete,
  showAdvancedOptions = true,
}: DependencyManagementCardProps) {
  const { t } = useTranslation(context === 'onboarding' ? 'onboarding' : 'components');
  const dispatch = useDispatch();

  const dependencies = useSelector(selectDependencies);
  const loading = useSelector(selectDependenciesLoading);
  const installProgress = useSelector(selectInstallProgress);

  // Track which dependencies are currently being installed
  const [installingDeps, setInstallingDeps] = useState<Set<string>>(new Set());
  const [isInstallingAll, setIsInstallingAll] = useState(false);

  // For onboarding context, check missing dependencies on mount
  useEffect(() => {
    if (context === 'onboarding' && versionId) {
      dispatch({
        type: CHECK_DEPENDENCIES_AFTER_INSTALL,
        payload: { versionId, context },
      });
    } else {
      // For version management, fetch all dependencies
      dispatch({ type: 'dependency/fetchDependencies' });
    }
  }, [versionId, context, dispatch]);

  // Listen for installation completion in onboarding context
  useEffect(() => {
    if (context === 'onboarding' && onInstallComplete) {
      const checkCompletion = () => {
        const allInstalled = dependencies.every(dep => dep.installed && !dep.versionMismatch);
        if (allInstalled && dependencies.length > 0) {
          onInstallComplete();
        }
      };
      checkCompletion();
    }
  }, [dependencies, context, onInstallComplete]);

  // Update installing deps based on progress
  useEffect(() => {
    if (installProgress.installing) {
      setInstallingDeps(new Set([installProgress.currentDependency]));
    } else {
      // Clear all installing states when installation completes
      setInstallingDeps(new Set());
      setIsInstallingAll(false);
    }
  }, [installProgress]);

  const downloadProgress = useSelector(selectDownloadProgress);

  // Use the provided versionId
  const effectiveVersionId = versionId || downloadProgress?.version || '';

  // Filter dependencies to only show missing ones for onboarding
  const filteredDependencies = context === 'onboarding'
    ? dependencies.filter(dep => !dep.installed || dep.versionMismatch)
    : dependencies;

  // Count missing and version mismatched dependencies
  const missingCount = filteredDependencies.filter(dep => !dep.installed).length;
  const mismatchCount = filteredDependencies.filter(dep => dep.installed && dep.versionMismatch).length;

  const hasMissingDependencies = filteredDependencies.some(dep => !dep.installed || dep.versionMismatch);

  // Get appropriate install message based on dependency status
  const getInstallMessage = () => {
    if (missingCount > 0 && mismatchCount > 0) {
      return t('depInstallConfirm.mixedMissingMessage', {
        missing: missingCount,
        mismatch: mismatchCount
      });
    } else if (mismatchCount > 0) {
      return t('depInstallConfirm.versionMismatchOnlyMessage', { count: mismatchCount });
    } else {
      return t('depInstallConfirm.description', { count: missingCount });
    }
  };

  // Handle installing a single dependency
  const handleInstallSingle = (depKey: string) => {
    if (installingDeps.size > 0) return; // Check if any installation is in progress

    setInstallingDeps(new Set([depKey]));
    dispatch({
      type: INSTALL_SINGLE_DEPENDENCY,
      payload: { dependencyKey: depKey, versionId: effectiveVersionId },
    });
  };

  // Handle one-click install for all missing dependencies
  const handleInstallAll = () => {
    if (installingDeps.size > 0) return; // Check if any installation is in progress

    // Mark all missing dependencies as installing
    const missingKeys = filteredDependencies
      .filter(dep => !dep.installed || dep.versionMismatch)
      .map(dep => dep.key);
    setInstallingDeps(new Set(missingKeys));
    setIsInstallingAll(true);

    dispatch({
      type: 'dependency/installFromManifest',
      payload: effectiveVersionId,
    });
  };

  const isDepInstalling = (depKey: string) => {
    return installingDeps.has(depKey) || installProgress.installing;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">
          {context === 'onboarding' ? t('dependencies.title') : t('dependencyManagement.title')}
        </h2>
        <p className="text-muted-foreground">
          {context === 'onboarding' ? t('dependencies.description') : t('dependencyManagement.description')}
        </p>
      </div>

      {/* Loading state */}
      {loading && filteredDependencies.length === 0 ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          <p>{t('dependencyManagement.status.checking')}</p>
        </div>
      ) : (
        <>
          {/* Dependencies list */}
          {filteredDependencies.length > 0 ? (
            <div className="space-y-3">
              {filteredDependencies.map((dep, index) => {
                const needsInstall = !dep.installed || dep.versionMismatch;
                const installing = isDepInstalling(dep.key);

                return (
                  <div
                    key={index}
                    className="bg-muted/20 rounded-lg p-4 border border-border"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        {dep.installed && !dep.versionMismatch ? (
                          <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : dep.installed && dep.versionMismatch ? (
                          <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{dep.name}</p>
                          <p className={`text-sm ${
                            dep.installed && !dep.versionMismatch
                              ? 'text-green-500'
                              : dep.installed && dep.versionMismatch
                              ? 'text-yellow-500'
                              : 'text-red-500'
                          }`}>
                            {dep.installed && !dep.versionMismatch
                              ? t('dependencyManagement.status.installed')
                              : dep.installed && dep.versionMismatch
                              ? t('dependencyManagement.status.versionMismatch')
                              : t('dependencyManagement.status.notInstalled')}
                          </p>
                          {dep.version && (
                            <span className="text-sm text-muted-foreground">
                              {t('dependencyManagement.details.currentVersion')}: {dep.version}
                            </span>
                          )}
                          {dep.description && (
                            <p className="text-sm text-muted-foreground mt-2">{dep.description}</p>
                          )}
                          {dep.requiredVersion && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {t('depInstallConfirm.requiredVersion')}: {dep.requiredVersion}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Install button for each missing dependency */}
                      {needsInstall && (
                        <button
                          onClick={() => handleInstallSingle(dep.key)}
                          disabled={installing}
                          className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          {installing ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                              {t('dependencyManagement.actions.installing')}
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              {dep.installed && dep.versionMismatch
                                ? t('dependencyManagement.actions.upgrade')
                                : t('dependencyManagement.actions.install')
                              }
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {context === 'onboarding' ? t('dependencies.complete.message') : t('dependencyManagement.noDependencies')}
            </div>
          )}

          {/* One-click install button for all missing dependencies */}
          {hasMissingDependencies && installingDeps.size === 0 && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-foreground mb-2">
                {getInstallMessage()}
              </p>
              {mismatchCount > 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  {t('depInstallConfirm.upgradeNote')}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleInstallAll}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {t('depInstallConfirm.confirm')}
                </button>
              </div>
            </div>
          )}

          {/* Show installation progress when installing all dependencies */}
          {isInstallingAll && installingDeps.size > 0 && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-foreground mb-2">
                {t('depInstallConfirm.installing')}
              </p>
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">
                  {installProgress.current} / {installProgress.total}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
