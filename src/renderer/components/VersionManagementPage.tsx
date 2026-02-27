import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDispatch, useSelector } from 'react-redux';
import {
  Package,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  HardDrive,
  FolderOpen,
  Loader2,
  Rocket,
  Bot,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import {
  selectWebServiceOperating,
  selectWebServiceStatus,
  selectInstallState,
  selectIsInstallingFromState,
  selectInstallProgress,
} from '../store/slices/webServiceSlice';
import {
  installWebServicePackage,
} from '../store/thunks/webServiceThunks';
import type { RootState } from '../store';
import { PackageSourceSelector } from './PackageSourceSelector';


interface Version {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
}

interface InstalledVersion {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  installedPath: string;
  installedAt: string;
  status: 'installed-ready' | 'installed-incomplete';
  dependencies: any[];
  isActive: boolean;
}

interface DependencyCheckResult {
  name: string;
  type: string;
  requiredVersion?: string;
  description?: string;
  installHint?: string;
  // Removed status fields - static display only
}

declare global {
  interface Window {
    electronAPI: {
      versionList: () => Promise<Version[]>;
      versionGetInstalled: () => Promise<InstalledVersion[]>;
      versionGetActive: () => Promise<InstalledVersion | null>;
      versionInstall: (versionId: string) => Promise<{ success: boolean; error?: string }>;
      versionUninstall: (versionId: string) => Promise<boolean>;
      versionSwitch: (versionId: string) => Promise<boolean>;
      versionReinstall: (versionId: string) => Promise<boolean>;
      versionCheckDependencies: (versionId: string) => Promise<DependencyCheckResult[]>;
      versionOpenLogs: (versionId: string) => Promise<{ success: boolean; error?: string }>;
      onInstalledVersionsChanged: (callback: (versions: InstalledVersion[]) => void) => void;
      onActiveVersionChanged: (callback: (version: InstalledVersion | null) => void) => void;
      installDependency: (type: string) => Promise<boolean>;
    };
  }
}

export default function VersionManagementPage() {
  const { t } = useTranslation('pages');
  const dispatch = useDispatch();
  const webServiceOperating = useSelector((state: RootState) => selectWebServiceOperating(state));
  const webServiceStatus = useSelector((state: RootState) => selectWebServiceStatus(state));
  const installState = useSelector((state: RootState) => selectInstallState(state));
  const isInstallingFromState = useSelector((state: RootState) => selectIsInstallingFromState(state));
  const webServiceInstallProgress = useSelector((state: RootState) => selectInstallProgress(state));
  const [availableVersions, setAvailableVersions] = useState<Version[]>([]);
  const [installedVersions, setInstalledVersions] = useState<InstalledVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<InstalledVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<Record<string, DependencyCheckResult[]>>({});
  const [isVersionsExpanded, setIsVersionsExpanded] = useState(false);

  // LLM Installation states
  const [llmCallStatus, setLlmCallStatus] = useState<'idle' | 'calling' | 'completed' | 'error'>('idle');
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmOutput, setLlmOutput] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<'cn' | 'international'>('cn');
  const [llmVersionId, setLlmVersionId] = useState<string | null>(null);

  // Dialog states
  const [reinstallDialogOpen, setReinstallDialogOpen] = useState(false);
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);
  const [pendingVersionId, setPendingVersionId] = useState<string | null>(null);


  useEffect(() => {
    fetchAllData();

    const unsubscribeInstalled = window.electronAPI.onInstalledVersionsChanged((versions) => {
      setInstalledVersions(versions);
    });

    const unsubscribeActive = window.electronAPI.onActiveVersionChanged((version) => {
      setActiveVersion(version);
      // Auto-expand dependencies if active version (now just shows static requirements)
      if (version && version.dependencies && version.dependencies.length > 0) {
        setExpandedVersion(version.id);
        // Pre-load dependencies for the expanded version (static list)
        if (!dependencies[version.id]) {
          (async () => {
            try {
              const deps = await window.electronAPI.getDependencyList(version.id);
              const formattedDeps = deps.map((dep: any) => ({
                name: dep.name,
                type: dep.type,
                requiredVersion: dep.requiredVersion, // API already computed this
                description: dep.description,
                installHint: dep.installHint,
              }));
              setDependencies((prev) => ({ ...prev, [version.id]: formattedDeps }));
            } catch (error) {
              console.error('Failed to load dependencies:', error);
            }
          })();
        }
      }
    });

    const unsubscribeVersionListChanged = window.electronAPI.onVersionListChanged(() => {
      // Refresh available versions when package source changes
      fetchAllData();
    });

    return () => {
      if (typeof unsubscribeInstalled === 'function') {
        unsubscribeInstalled();
      }
      if (typeof unsubscribeActive === 'function') {
        unsubscribeActive();
      }
      if (typeof unsubscribeVersionListChanged === 'function') {
        unsubscribeVersionListChanged();
      }
    };
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [available, installed, active] = await Promise.all([
        window.electronAPI.versionList(),
        window.electronAPI.versionGetInstalled(),
        window.electronAPI.versionGetActive(),
      ]);

      setAvailableVersions(available);
      setInstalledVersions(installed);
      setActiveVersion(active);

      // Auto-expand dependencies if active version (now just shows static requirements)
      if (active && active.dependencies && active.dependencies.length > 0) {
        setExpandedVersion(active.id);
        // Pre-load dependencies for the expanded version (static list)
        if (!dependencies[active.id]) {
          const deps = await window.electronAPI.getDependencyList(active.id);
          const formattedDeps = deps.map((dep: any) => ({
            name: dep.name,
            type: dep.type,
            requiredVersion: dep.requiredVersion, // API already computed this
            description: dep.description,
            installHint: dep.installHint,
          }));
          setDependencies((prev) => ({ ...prev, [active.id]: formattedDeps }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch version data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (versionId: string) => {
    if (isInstallingFromState || webServiceOperating) return;

    // Use Redux thunk which will check service status and show confirmation dialog if needed
    dispatch(installWebServicePackage(versionId));
  };

  const handleUninstall = async (versionId: string) => {
    if (uninstalling) return;

    // Open confirmation dialog instead of using native confirm
    setPendingVersionId(versionId);
    setUninstallDialogOpen(true);
  };

  const confirmUninstall = async () => {
    if (!pendingVersionId || uninstalling) {
      setUninstallDialogOpen(false);
      setPendingVersionId(null);
      return;
    }

    try {
      setUninstalling(pendingVersionId);
      setUninstallDialogOpen(false);
      const success = await window.electronAPI.versionUninstall(pendingVersionId);

      if (success) {
        toast.success(t('versionManagement.toast.uninstallSuccess'));
        await fetchAllData();
        setExpandedVersion(null);
      } else {
        toast.error(t('versionManagement.toast.uninstallFailed'));
      }
    } catch (error) {
      console.error('Error uninstalling version:', error);
      toast.error(t('versionManagement.toast.uninstallFailed'));
    } finally {
      setUninstalling(null);
      setPendingVersionId(null);
    }
  };

  const handleSwitch = async (versionId: string) => {
    if (switching) return;

    try {
      setSwitching(versionId);
      const success = await window.electronAPI.versionSwitch(versionId);

      if (success) {
        await fetchAllData();
      }
    } catch (error) {
      console.error('Error switching version:', error);
    } finally {
      setSwitching(null);
    }
  };

  const handleReinstall = async (versionId: string) => {
    if (isInstallingFromState || webServiceOperating) return;

    // Use Redux thunk which will check service status and show confirmation dialog if needed
    dispatch(installWebServicePackage(versionId));
  };

  const confirmReinstall = async () => {
    if (!pendingVersionId || isInstallingFromState) {
      setReinstallDialogOpen(false);
      setPendingVersionId(null);
      return;
    }

    // Use Redux thunk which will check service status and show confirmation dialog
    dispatch(installWebServicePackage(pendingVersionId));
    setReinstallDialogOpen(false);
    setPendingVersionId(null);
  };

  const handleOpenLogs = async (versionId: string) => {
    try {
      const result = await window.electronAPI.versionOpenLogs(versionId);

      if (result.success) {
        toast.success(t('versionManagement.toast.openLogsSuccess'));
      } else {
        if (result.error === 'logs_not_found') {
          toast.error(t('versionManagement.toast.logsNotFound'));
        } else {
          toast.error(t('versionManagement.toast.openLogsError'));
        }
      }
    } catch (error) {
      console.error('Error opening logs folder:', error);
      toast.error(t('versionManagement.toast.openLogsError'));
    }
  };

  const handleToggleDependencies = async (versionId: string) => {
    // Toggle dependency view - now just shows static requirements without status checking
    if (expandedVersion === versionId) {
      setExpandedVersion(null);
    } else {
      setExpandedVersion(versionId);
      // No longer calling versionCheckDependencies - just get static list
      if (!dependencies[versionId]) {
        // Use getDependencyList instead of versionCheckDependencies for static display
        const deps = await window.electronAPI.getDependencyList(versionId);
        // Transform to our format without status checking
        const formattedDeps = deps.map((dep: any) => ({
          name: dep.name,
          type: dep.type,
          requiredVersion: dep.requiredVersion, // API already computed this
          description: dep.description,
          installHint: dep.installHint,
          // No status fields - static display only
        }));
        setDependencies((prev) => ({ ...prev, [versionId]: formattedDeps }));
      }
    }
  };

  // LLM Installation handlers
  const handleCallClaude = async (versionId: string) => {
    setLlmCallStatus('calling');
    setLlmError(null);
    setLlmOutput('');
    setLlmVersionId(versionId);

    try {
      const manifestPathResult = await window.electronAPI.llmGetManifestPath(versionId);

      if (!manifestPathResult.success || !manifestPathResult.manifestPath) {
        throw new Error(manifestPathResult.error || 'Failed to get manifest path');
      }

      // Call LLM API with selected region
      const apiResponse = await window.electronAPI.llmCallApi(
        manifestPathResult.manifestPath,
        selectedRegion
      );

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'API call failed');
      }

      // Set status back to idle to keep button active for retry
      setLlmCallStatus('idle');
      // No success toast - button remains active
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLlmError(errorMessage);
      setLlmCallStatus('error');
      toast.error(`Claude API call failed: ${errorMessage}`);
    }
  };

  const handleRetryClaude = async () => {
    if (llmVersionId) {
      await handleCallClaude(llmVersionId);
    }
  };

  const handleStartOnboarding = async () => {
    try {
      // Reset onboarding state to allow it to show again
      await window.electronAPI.resetOnboarding();
      // Check trigger condition to activate onboarding
      const result = await window.electronAPI.checkTriggerCondition();
      if (result.shouldShow) {
        toast.success(t('versionManagement.toast.onboardingStarted'));
      } else {
        toast.error(t('versionManagement.toast.onboardingFailed') + `: ${result.reason || 'Unknown reason'}`);
      }
    } catch (error) {
      console.error('Failed to start onboarding:', error);
      toast.error(t('versionManagement.toast.onboardingFailed'));
    }
  };

  const getDepTypeFromName = (depName: string): string | null => {
    const nameMap: Record<string, string> = {
      'Claude Code': 'claudeCode',
      'ClaudeCode': 'claudeCode',
      'Dotnet': 'dotnet',
      'Node': 'node',
      'Npm': 'npm',
      'Openspec': 'openspec',
      'OpenSpec': 'openspec',
    };
    return nameMap[depName] || null;
  };

  const getInstallProgressText = () => {
    if (!webServiceInstallProgress) return t('versionManagement.installing');

    const stageTexts: Record<string, string> = {
      'downloading': t('versionManagement.downloading'),
      'extracting': t('versionManagement.extracting'),
      'verifying': t('versionManagement.verifying'),
      'completed': t('versionManagement.completed'),
      'error': t('versionManagement.toast.installFailed'),
    };

    return stageTexts[webServiceInstallProgress.stage] || webServiceInstallProgress.message || t('versionManagement.installing');
  };

  const getVersionStatus = (version: InstalledVersion) => {
    if (version.isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          <CheckCircle className="w-3 h-3" />
          {t('versionManagement.status.active')}
        </span>
      );
    }

    if (version.status === 'installed-ready') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          <CheckCircle className="w-3 h-3" />
          {t('versionManagement.status.ready')}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent-foreground border border-accent/20">
        <AlertCircle className="w-3 h-3" />
        {t('versionManagement.status.incomplete')}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getPlatformLabel = (platform: string) => {
    // Simplified platform labels - only 3 types: linux, windows, osx
    const labels: Record<string, string> = {
      'linux': 'Linux',
      'windows': 'Windows',
      'osx': 'macOS',
    };

    // Direct match
    if (labels[platform]) {
      return labels[platform];
    }

    // Case-insensitive match
    const lowerPlatform = platform.toLowerCase();
    for (const [key, label] of Object.entries(labels)) {
      if (key.toLowerCase() === lowerPlatform) {
        return label;
      }
    }

    // Partial match for backwards compatibility with old platform names
    if (lowerPlatform.includes('linux') || lowerPlatform.includes('ubuntu') || lowerPlatform.includes('debian')) {
      return 'Linux';
    }
    if (lowerPlatform.includes('darwin') || lowerPlatform.includes('mac') || lowerPlatform.includes('osx')) {
      return 'macOS';
    }
    if (lowerPlatform.includes('win') || lowerPlatform.includes('msys') || lowerPlatform.includes('cygwin')) {
      return 'Windows';
    }

    // Return original if no match
    return platform;
  };

  // Computed properties for version list display
  const displayVersions = isVersionsExpanded
    ? availableVersions
    : availableVersions.slice(0, 3);
  const remainingCount = availableVersions.length - 3;
  const showExpandButton = availableVersions.length > 3;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-12 h-12 bg-primary rounded-xl">
            <Package className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {t('versionManagement.title')}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{t('versionManagement.description')}</p>
          </div>
        </div>

      </div>

      {/* Package Source Selector */}
      <div className="mb-8">
        <PackageSourceSelector />
      </div>

      {/* Available Versions */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-foreground">
            <Download className="w-5 h-5 text-primary" />
            {t('versionManagement.availableVersions')}
          </h2>
          <button
            onClick={fetchAllData}
            className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            {t('versionManagement.actions.refresh')}
          </button>
        </div>

        <div className="space-y-3">
          {displayVersions.map((version) => {
            const installed = installedVersions.find((v) => v.id === version.id);

            return (
              <div
                key={version.id}
                className="bg-card rounded-xl p-4 border border-border hover:border-border/80 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
                      <Package className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{version.packageFilename}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{getPlatformLabel(version.platform)}</span>
                        {installed && (
                          <span className="text-primary">• {t('versionManagement.installed')}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!installed ? (
                    <div className="flex items-center gap-2">
                      {isInstallingFromState && webServiceInstallProgress ? (
                        <div className="flex items-center gap-2">
                          {/* 进度条 */}
                          <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300 ease-out"
                              style={{ width: `${webServiceInstallProgress.progress}%` }}
                            />
                          </div>
                          {/* 进度文本 */}
                          <span className="text-xs text-muted-foreground min-w-[60px]">
                            {webServiceInstallProgress.stage === 'downloading' && `${webServiceInstallProgress.progress}%`}
                            {webServiceInstallProgress.stage === 'extracting' && `${webServiceInstallProgress.progress}%`}
                            {webServiceInstallProgress.stage === 'verifying' && t('versionManagement.verifying')}
                            {webServiceInstallProgress.stage === 'completed' && t('versionManagement.completed')}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleInstall(version.id)}
                          disabled={isInstallingFromState || webServiceOperating}
                          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isInstallingFromState ? (
                            <>
                              <Loader2 className="animate-spin h-4 w-4" />
                              {getInstallProgressText()}
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              {t('versionManagement.actions.install')}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-primary flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      {t('versionManagement.installed')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {showExpandButton && (
            <button
              onClick={() => setIsVersionsExpanded(!isVersionsExpanded)}
              className="mt-4 w-full py-2 text-sm text-primary hover:text-primary/80 transition-colors flex items-center justify-center gap-2"
            >
              {isVersionsExpanded
                ? t('versionManagement.actions.showLessVersions')
                : t('versionManagement.actions.showMoreVersions', { count: remainingCount })}
            </button>
          )}

          {availableVersions.length === 0 && (
            <div className="bg-card rounded-xl p-8 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('versionManagement.noVersionsAvailable')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Installed Versions */}
      {installedVersions.length === 0 ? (
        /* No versions installed - show onboarding CTA */
        <div className="bg-card rounded-xl border border-border p-12">
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-4 bg-primary/10 rounded-full">
                <Rocket className="w-12 h-12 text-primary" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {t('versionManagement.noVersionsInstalled.title')}
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                {t('versionManagement.noVersionsInstalled.description')}
              </p>
            </div>
            <button
              onClick={handleStartOnboarding}
              className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
            >
              <Rocket className="w-5 h-5" />
              {t('versionManagement.noVersionsInstalled.startButton')}
            </button>
          </div>
        </div>
      ) : (
        /* Has installed versions - show list */
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2 text-foreground mb-4">
            <HardDrive className="w-5 h-5 text-primary" />
            {t('versionManagement.installedVersions')}
          </h2>

          <div className="space-y-3">
            {installedVersions.map((version) => (
              <div
                key={version.id}
                className="bg-card rounded-xl border border-border overflow-hidden"
              >
                {/* Version Header */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
                        <Package className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{version.packageFilename}</h3>
                          {getVersionStatus(version)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{getPlatformLabel(version.platform)}</span>
                          <span>•</span>
                          <span>{t('versionManagement.installedAt')}: {formatDate(version.installedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Always show "View Dependencies" button for all installed versions */}
                      <button
                        onClick={() => handleToggleDependencies(version.id)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                          expandedVersion === version.id
                            ? 'bg-primary/10 hover:bg-primary/20 text-primary'
                            : version.status === 'installed-incomplete'
                            ? 'bg-accent/10 hover:bg-accent/20 text-accent-foreground'
                            : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                        }`}
                      >
                        <AlertCircle className="w-4 h-4" />
                        {expandedVersion === version.id ? t('versionManagement.actions.collapseDependencies') : t('versionManagement.actions.viewDependencies')}
                      </button>

                      {/* Reinstall button for all installed versions */}
                      {isInstallingFromState && webServiceInstallProgress ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
                          {/* 进度条 */}
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300 ease-out"
                              style={{ width: `${webServiceInstallProgress.progress}%` }}
                            />
                          </div>
                          {/* 进度文本 */}
                          <span className="text-xs text-muted-foreground min-w-[50px]">
                            {webServiceInstallProgress.stage === 'downloading' && `${webServiceInstallProgress.progress}%`}
                            {webServiceInstallProgress.stage === 'extracting' && `${webServiceInstallProgress.progress}%`}
                            {webServiceInstallProgress.stage === 'verifying' && t('versionManagement.verifying')}
                            {webServiceInstallProgress.stage === 'completed' && t('versionManagement.completed')}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleReinstall(version.id)}
                          disabled={isInstallingFromState || switching === version.id}
                          className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          title={t('versionManagement.actions.reinstallPackage')}
                        >
                          {isInstallingFromState ? (
                            <>
                              <Loader2 className="animate-spin h-3 w-3" />
                              {getInstallProgressText()}
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              {t('versionManagement.actions.reinstall')}
                            </>
                          )}
                        </button>
                      )}

                      {/* Open Logs button for all installed versions */}
                      <button
                        onClick={() => handleOpenLogs(version.id)}
                        className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors flex items-center gap-1.5"
                        title={t('versionManagement.actions.openLogs')}
                      >
                        <FolderOpen className="w-4 h-4" />
                        {t('versionManagement.actions.openLogs')}
                      </button>

                      {!version.isActive && version.status === 'installed-ready' && (
                        <button
                          onClick={() => handleSwitch(version.id)}
                          disabled={switching === version.id || isInstallingFromState}
                          className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {switching === version.id ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-foreground"></div>
                              {t('versionManagement.switching')}
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              {t('versionManagement.actions.switch')}
                            </>
                          )}
                        </button>
                      )}

                      {!version.isActive && (
                        <button
                          onClick={() => handleUninstall(version.id)}
                          disabled={uninstalling === version.id || isInstallingFromState}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t('versionManagement.actions.uninstall')}
                        >
                          {uninstalling === version.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-destructive"></div>
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dependencies Section */}
                  {expandedVersion === version.id && dependencies[version.id] && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-foreground">
                          {t('versionManagement.dependencies')}
                        </h4>
                      </div>

                      {/* Claude Installation Section */}
                      <div className="mb-3 bg-primary/10 border border-primary/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-foreground">
                              {t('versionManagement.claude.title')}
                            </span>
                          </div>

                          {/* Region selector */}
                          <select
                            value={selectedRegion}
                            onChange={(e) => setSelectedRegion(e.target.value as 'cn' | 'international')}
                            disabled={llmCallStatus === 'calling'}
                            className="px-2 py-1 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                          >
                            <option value="cn">{t('versionManagement.claude.region.cn')}</option>
                            <option value="international">{t('versionManagement.claude.region.international')}</option>
                          </select>
                        </div>

                        <p className="text-xs text-muted-foreground mb-2">
                          {t('versionManagement.claude.description')}
                        </p>

                        {/* LLM Call Status */}
                        {llmCallStatus === 'idle' && (
                          <button
                            onClick={() => handleCallClaude(version.id)}
                            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                          >
                            <Bot className="w-4 h-4" />
                            {t('versionManagement.claude.callButton')}
                          </button>
                        )}

                        {llmCallStatus === 'calling' && (
                          <div className="flex items-center justify-center gap-2 py-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">
                              {t('versionManagement.claude.calling')}
                            </span>
                          </div>
                        )}

                        {llmCallStatus === 'completed' && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded-md p-2">
                            <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-sm font-medium">
                                {t('versionManagement.claude.completed')}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('versionManagement.claude.completedHint')}
                            </p>
                          </div>
                        )}

                        {llmCallStatus === 'error' && (
                          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 text-destructive">
                                <AlertCircle className="w-4 h-4" />
                                <span className="text-sm font-medium">{t('versionManagement.claude.failed')}</span>
                              </div>
                              <button
                                onClick={handleRetryClaude}
                                className="text-xs text-primary hover:underline"
                              >
                                {t('versionManagement.claude.retry')}
                              </button>
                            </div>
                            {llmError && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {llmError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info banner */}
                      <div className="mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          {t('versionManagement.dependencyInfo.description')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        {dependencies[version.id].map((dep: any, index: number) => (
                          <div
                            key={index}
                            className="bg-muted rounded-lg p-3"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-foreground">{dep.name}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {t('versionManagement.dependencyInfo.required')}
                                  </span>
                                </div>
                                {dep.requiredVersion && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {t('versionManagement.dependencyInfo.requiredVersion')} <span className="font-mono">{dep.requiredVersion}</span>
                                  </div>
                                )}
                                {dep.description && (
                                  <p className="text-xs text-muted-foreground mt-1">{dep.description}</p>
                                )}
                                {dep.installHint && (
                                  <p className="text-xs text-primary mt-1">{dep.installHint}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-5 h-5 bg-primary/10 rounded mt-0.5 flex-shrink-0">
            <Clock className="w-3 h-3 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-foreground font-medium mb-1">
              {t('versionManagement.info.title')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('versionManagement.info.description')}
            </p>
          </div>
        </div>
      </div>

      {/* Reinstall Confirmation Dialog */}
      <Dialog open={reinstallDialogOpen} onOpenChange={setReinstallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('versionManagement.dialog.reinstallTitle')}</DialogTitle>
            <DialogDescription>
              {t('versionManagement.dialog.reinstallDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReinstallDialogOpen(false);
                setPendingVersionId(null);
              }}
              disabled={isInstallingFromState}
            >
              {t('versionManagement.dialog.cancel')}
            </Button>
            <Button
              onClick={confirmReinstall}
              disabled={isInstallingFromState}
            >
              {isInstallingFromState ? t('versionManagement.reinstalling') : t('versionManagement.dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Uninstall Confirmation Dialog */}
      <Dialog open={uninstallDialogOpen} onOpenChange={setUninstallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('versionManagement.dialog.uninstallTitle')}</DialogTitle>
            <DialogDescription>
              {t('versionManagement.dialog.uninstallDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUninstallDialogOpen(false);
                setPendingVersionId(null);
              }}
              disabled={uninstalling !== null}
            >
              {t('versionManagement.dialog.cancel')}
            </Button>
            <Button
              onClick={confirmUninstall}
              disabled={uninstalling !== null}
              variant="destructive"
            >
              {uninstalling ? t('versionManagement.switching') : t('versionManagement.dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
