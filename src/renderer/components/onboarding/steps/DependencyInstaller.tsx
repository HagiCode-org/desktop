import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { CheckCircle2, Package, ChevronDown, ChevronRight, AlertCircle, XCircle, Loader2, Download } from 'lucide-react';
import {
  selectDownloadProgress,
  selectDependencyCheckResults,
  selectCurrentStep,
  addScriptOutput,
  clearScriptOutput,
} from '../../../store/slices/onboardingSlice';
import { checkDependenciesAfterInstall, installFromManifest } from '../../../store/thunks/dependencyThunks';
import { selectInstallProgress } from '../../../store/slices/dependencySlice';
import { OnboardingStep } from '../../../../types/onboarding';
import type { RootState } from '../../../store';
import { useState, useMemo, useEffect, useRef } from 'react';
import type { DependencyCheckResult, ScriptOutput } from '../../../../types/onboarding';
import { ScriptOutputConsole } from './ScriptOutputConsole';

interface DependencyCheckResultWithKey extends DependencyCheckResult {
  key: string;
}

function DependencyInstaller() {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch();
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const dependencyCheckResults = useSelector((state: RootState) => selectDependencyCheckResults(state));
  const installProgress = useSelector((state: RootState) => selectInstallProgress(state));

  // State for collapse/expand
  const [isExpanded, setIsExpanded] = useState(true);

  // Ref to track if we've set up script output listener
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Track previous installation state to detect completion
  const prevInstallingRef = useRef(false);

  // Set up script output listener on mount
  useEffect(() => {
    // Clear previous logs when component mounts
    dispatch(clearScriptOutput());

    // Set up listener for script output events
    const unsubscribe = window.electronAPI.onScriptOutput((output: ScriptOutput) => {
      dispatch(addScriptOutput(output));
    });

    unsubscribeRef.current = unsubscribe;

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [dispatch]);

  // Note: Dependency check is no longer triggered on component mount to avoid duplicate checks.
  // The check should be triggered when user explicitly enters the Dependencies step or via other user interactions.
  // This prevents the issue where the same dependency check was running twice:
  // 1. When download completes (component was already mounted)
  // 2. When user clicks "Next" to enter the Dependencies step (component mounts again)
  const currentStep = useSelector((state: RootState) => selectCurrentStep(state));

  // Trigger dependency check only when user enters the Dependencies step
  useEffect(() => {
    // Only trigger if:
    // 1. We're currently on the Dependencies step
    // 2. Download is complete (version exists)
    // 3. No dependency check results yet
    if (currentStep === OnboardingStep.Dependencies &&
        downloadProgress?.version &&
        dependencyCheckResults.length === 0) {
      console.log('[DependencyInstaller] Dependencies step active, triggering dependency check for version:', downloadProgress.version);
      dispatch(checkDependenciesAfterInstall({ versionId: downloadProgress.version, context: 'onboarding' }));
    }
  }, [currentStep, downloadProgress?.version, dispatch]);
  // Re-check dependencies after installation completes
  useEffect(() => {
    const wasInstalling = prevInstallingRef.current;
    const isNowInstalling = installProgress.installing;

    // If installation was in progress and now it's complete, re-check dependencies
    if (wasInstalling && !isNowInstalling && downloadProgress?.version) {
      console.log('[DependencyInstaller] Installation completed, re-checking dependencies for version:', downloadProgress.version);
      dispatch(checkDependenciesAfterInstall({ versionId: downloadProgress.version, context: 'onboarding' }));
    }

    // Update ref for next time
    prevInstallingRef.current = isNowInstalling;
  }, [installProgress.installing, downloadProgress?.version, dispatch]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const total = dependencyCheckResults.length;
    const checking = dependencyCheckResults.filter(dep => dep.isChecking).length;
    const passed = dependencyCheckResults.filter(dep => dep.installed && !dep.versionMismatch && !dep.isChecking).length;
    const failed = total - passed - checking;
    return { total, passed, failed, checking };
  }, [dependencyCheckResults]);

  // Count dependencies that need installation
  const needsInstall = useMemo(() => {
    return dependencyCheckResults.filter(dep => !dep.installed || dep.versionMismatch || dep.isChecking).length;
  }, [dependencyCheckResults]);

  // Handle one-click install for all missing dependencies
  const handleInstallAll = () => {
    if (installProgress.installing || !downloadProgress?.version) return;
    console.log('[DependencyInstaller] Installing all dependencies for version:', downloadProgress.version);
    dispatch(installFromManifest({
      versionId: downloadProgress.version,
      context: 'onboarding',
    }));
  };

  // Get all dependencies (not just missing ones) for detailed display
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
            <div className={`flex items-center gap-2 ${
              summary.checking > 0
                ? 'text-blue-600 dark:text-blue-500'
                : summary.failed > 0
                ? 'text-yellow-600 dark:text-yellow-500'
                : 'text-green-600 dark:text-green-500'
            }`}>
              {summary.checking > 0 ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : summary.failed === 0 ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span className="text-sm">
                {summary.checking > 0
                  ? t('dependencyCheck.checking', { total: summary.total })
                  : t('dependencyCheck.summary', {
                      total: summary.total,
                      passed: summary.passed,
                      failed: summary.failed,
                    })}
              </span>
            </div>
          )}

          {/* One-click install button - show when there are dependencies to install and not currently installing */}
          {needsInstall > 0 && summary.checking === 0 && (
            <button
              onClick={handleInstallAll}
              disabled={installProgress.installing}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
            >
              {installProgress.installing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('depInstallConfirm.installing')}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  {t('depInstallConfirm.installButton', { count: needsInstall })}
                </>
              )}
            </button>
          )}

          {/* Detailed dependency list */}
          {isExpanded && (
            <div className="mt-4 max-h-80 overflow-y-auto space-y-2 pr-2">
              {allDependencies.map((dep, index) => {
                const isChecking = dep.isChecking;
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
                        {isChecking ? (
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        ) : isInstalled ? (
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
                            isChecking
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : isInstalled
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : hasMismatch
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {isChecking
                              ? t('dependencyManagement.status.checking')
                              : isInstalled
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
    </div>
  );
}

export default DependencyInstaller;
