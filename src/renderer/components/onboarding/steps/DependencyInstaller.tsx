import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { CheckCircle2, Package, ChevronDown, ChevronRight, AlertCircle, XCircle } from 'lucide-react';
import { DependencyManagementCard } from '../../DependencyManagementCardUnified';
import { selectDownloadProgress, selectDependencyCheckResults } from '../../../store/slices/onboardingSlice';
import { goToNextStep } from '../../../store/thunks/onboardingThunks';
import type { RootState } from '../../../store';
import { useDispatch } from 'react-redux';
import { useState, useMemo } from 'react';
import type { DependencyCheckResult } from '../../../../types/onboarding';

function DependencyInstaller() {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch();
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const dependencyCheckResults = useSelector((state: RootState) => selectDependencyCheckResults(state));

  // State for collapse/expand
  const [isExpanded, setIsExpanded] = useState(true);

  const handleInstallComplete = () => {
    // Automatically proceed to the next step after successful installation
    dispatch(goToNextStep());
  };

  // Calculate summary statistics
  const summary = useMemo(() => {
    const total = dependencyCheckResults.length;
    const passed = dependencyCheckResults.filter(dep => dep.installed && !dep.versionMismatch).length;
    const failed = total - passed;
    return { total, passed, failed };
  }, [dependencyCheckResults]);

  // Get all dependencies (not just missing ones) for the detailed display
  const allDependencies = dependencyCheckResults;

  return (
    <div className="space-y-8">
      {/* Status header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Package className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-semibold">
          {t('dependencies.installing.title')}
        </h2>
        <p className="text-muted-foreground">
          {t('dependencies.description')}
        </p>
      </div>

      {/* Dependency Check Results Summary */}
      {allDependencies.length > 0 && (
        <div className="bg-muted/20 rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">
              {t('dependencyCheck.title')}
            </h3>
            {summary.total > 0 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    {t('dependencyCheck.details.collapse')}
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-4 h-4" />
                    {t('dependencyCheck.details.expand')}
                  </>
                )}
              </button>
            )}
          </div>

          {/* Summary message */}
          {summary.total > 0 && (
            <div className={`flex items-center gap-2 ${summary.failed > 0 ? 'text-yellow-600 dark:text-yellow-500' : 'text-green-600 dark:text-green-500'}`}>
              {summary.failed === 0 ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : summary.failed > 0 ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span className="text-sm">
                {t('dependencyCheck.summary', {
                  total: summary.total,
                  passed: summary.passed,
                  failed: summary.failed,
                })}
              </span>
            </div>
          )}

          {/* Detailed dependency list */}
          {isExpanded && (
            <div className="mt-4 max-h-80 overflow-y-auto space-y-2 pr-2">
              {allDependencies.map((dep, index) => {
                const isInstalled = dep.installed && !dep.versionMismatch;
                const hasMismatch = dep.installed && dep.versionMismatch;

                return (
                  <div
                    key={index}
                    className="bg-background rounded-md p-3 border border-border"
                  >
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {isInstalled ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : hasMismatch ? (
                          <AlertCircle className="w-5 h-5 text-yellow-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>

                      {/* Dependency info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{dep.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            isInstalled
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : hasMismatch
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {isInstalled
                              ? t('dependencyManagement.status.installed')
                              : hasMismatch
                              ? t('dependencyManagement.status.versionMismatch')
                              : t('dependencyManagement.status.notInstalled')}
                          </span>
                        </div>

                        {/* Version info */}
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          {dep.version && (
                            <span>
                              {t('dependencyCheck.details.currentVersion')}: {dep.version}
                            </span>
                          )}
                          {dep.requiredVersion && (
                            <span>
                              {t('dependencyCheck.details.requiredVersion')}: {dep.requiredVersion}
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {dep.description && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {dep.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Unified Dependency Management Card */}
      <DependencyManagementCard
        versionId={downloadProgress?.version || ''}
        context="onboarding"
        onInstallComplete={handleInstallComplete}
        showAdvancedOptions={false}
      />
    </div>
  );
}

export default DependencyInstaller;
