import { useState, useEffect } from 'react';
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
  installWebServicePackageAction,
} from '../store/sagas/webServiceSaga';
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
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
  installCommand?: string;
  downloadUrl?: string;
  description?: string;
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
  const installProgress = useSelector((state: RootState) => selectInstallProgress(state));
  const [availableVersions, setAvailableVersions] = useState<Version[]>([]);
  const [installedVersions, setInstalledVersions] = useState<InstalledVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<InstalledVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<Record<string, DependencyCheckResult[]>>({});
  const [installingDep, setInstallingDep] = useState<string | null>(null);

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
      // Auto-expand dependencies if active version has missing dependencies
      if (version && version.dependencies && version.dependencies.length > 0) {
        const hasMissingDeps = version.dependencies.some(
          (dep) => !dep.installed || dep.versionMismatch
        );
        if (hasMissingDeps) {
          setExpandedVersion(version.id);
          // Pre-load dependencies for the expanded version
          handleRefreshDependencies(version.id);
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

      // Auto-expand dependencies if active version has missing dependencies
      if (active && active.dependencies && active.dependencies.length > 0) {
        const hasMissingDeps = active.dependencies.some(
          (dep) => !dep.installed || dep.versionMismatch
        );
        if (hasMissingDeps) {
          setExpandedVersion(active.id);
          // Pre-load dependencies for the expanded version
          const deps = await window.electronAPI.versionCheckDependencies(active.id);
          setDependencies((prev) => ({ ...prev, [active.id]: deps }));
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

    // Use Redux action which will check service status and show confirmation dialog if needed
    dispatch(installWebServicePackageAction(versionId));
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

    // Use Redux action which will check service status and show confirmation dialog if needed
    dispatch(installWebServicePackageAction(versionId));
  };

  const confirmReinstall = async () => {
    if (!pendingVersionId || isInstallingFromState) {
      setReinstallDialogOpen(false);
      setPendingVersionId(null);
      return;
    }

    // Use Redux action which will check service status and show confirmation dialog
    dispatch(installWebServicePackageAction(pendingVersionId));
    setReinstallDialogOpen(false);
    setPendingVersionId(null);
  };

  const handleRefreshDependencies = async (versionId: string) => {
    try {
      const deps = await window.electronAPI.versionCheckDependencies(versionId);
      setDependencies((prev) => ({ ...prev, [versionId]: deps }));
      await fetchAllData();
    } catch (error) {
      console.error('Failed to refresh dependencies:', error);
    }
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
    if (expandedVersion === versionId) {
      setExpandedVersion(null);
    } else {
      setExpandedVersion(versionId);
      if (!dependencies[versionId]) {
        const deps = await window.electronAPI.versionCheckDependencies(versionId);
        setDependencies((prev) => ({ ...prev, [versionId]: deps }));
      }
    }
  };

  const handleInstallDependency = async (depName: string) => {
    try {
      setInstallingDep(depName);
      const depType = getDepTypeFromName(depName);
      if (depType) {
        const success = await window.electronAPI.installDependency(depType);
        if (success) {
          // Refresh dependencies for all expanded versions
          await Promise.all(
            Object.keys(dependencies).map(async (versionId) => {
              const deps = await window.electronAPI.versionCheckDependencies(versionId);
              setDependencies((prev) => ({ ...prev, [versionId]: deps }));
            })
          );
          // Refresh installed versions to update status
          const installed = await window.electronAPI.versionGetInstalled();
          setInstalledVersions(installed);
        }
      }
    } catch (error) {
      console.error('Failed to install dependency:', error);
    } finally {
      setInstallingDep(null);
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
    if (!installProgress) return t('versionManagement.installing');

    const stageTexts: Record<string, string> = {
      'downloading': t('versionManagement.downloading'),
      'extracting': t('versionManagement.extracting'),
      'verifying': t('versionManagement.verifying'),
      'completed': t('versionManagement.completed'),
      'error': '安装失败',
    };

    return stageTexts[installProgress.stage] || installProgress.message || t('versionManagement.installing');
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
          {availableVersions.map((version) => {
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
                      {isInstallingFromState && installProgress ? (
                        <div className="flex items-center gap-2">
                          {/* 进度条 */}
                          <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300 ease-out"
                              style={{ width: `${installProgress.progress}%` }}
                            />
                          </div>
                          {/* 进度文本 */}
                          <span className="text-xs text-muted-foreground min-w-[60px]">
                            {installProgress.stage === 'downloading' && `${installProgress.progress}%`}
                            {installProgress.stage === 'extracting' && `${installProgress.progress}%`}
                            {installProgress.stage === 'verifying' && t('versionManagement.verifying')}
                            {installProgress.stage === 'completed' && t('versionManagement.completed')}
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

          {availableVersions.length === 0 && (
            <div className="bg-card rounded-xl p-8 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('versionManagement.noVersionsAvailable')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Installed Versions */}
      {installedVersions.length > 0 && (
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
                        {expandedVersion === version.id ? '收起依赖项' : t('versionManagement.actions.viewDependencies')}
                      </button>

                      {/* Reinstall button for all installed versions */}
                      {isInstallingFromState && installProgress ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
                          {/* 进度条 */}
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300 ease-out"
                              style={{ width: `${installProgress.progress}%` }}
                            />
                          </div>
                          {/* 进度文本 */}
                          <span className="text-xs text-muted-foreground min-w-[50px]">
                            {installProgress.stage === 'downloading' && `${installProgress.progress}%`}
                            {installProgress.stage === 'extracting' && `${installProgress.progress}%`}
                            {installProgress.stage === 'verifying' && t('versionManagement.verifying')}
                            {installProgress.stage === 'completed' && t('versionManagement.completed')}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleReinstall(version.id)}
                          disabled={isInstallingFromState || switching === version.id}
                          className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          title="重新安装此软件包"
                        >
                          {isInstallingFromState ? (
                            <>
                              <Loader2 className="animate-spin h-3 w-3" />
                              {getInstallProgressText()}
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              重新安装
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
                        <button
                          onClick={() => handleRefreshDependencies(version.id)}
                          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          {t('versionManagement.actions.refresh')}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {dependencies[version.id].map((dep, index) => (
                          <div
                            key={index}
                            className="bg-muted rounded-lg p-3 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{dep.name}</span>
                                {dep.installed && !dep.versionMismatch ? (
                                  <span className="text-xs text-primary">✓ {dep.version}</span>
                                ) : dep.installed && dep.versionMismatch ? (
                                  <span className="text-xs text-accent-foreground">⚠ {dep.version}</span>
                                ) : (
                                  <span className="text-xs text-destructive">✗ {t('versionManagement.notInstalled')}</span>
                                )}
                              </div>
                              {dep.description && (
                                <p className="text-xs text-muted-foreground mt-1">{dep.description}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Always show install/reinstall button for dependencies with install command */}
                              {dep.installCommand && (
                                <button
                                  onClick={() => handleInstallDependency(dep.name)}
                                  disabled={installingDep === dep.name}
                                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ${
                                    !dep.installed || dep.versionMismatch
                                      ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                                      : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                                  }`}
                                >
                                  {installingDep === dep.name ? (
                                    <>
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-foreground"></div>
                                      安装中...
                                    </>
                                  ) : !dep.installed || dep.versionMismatch ? (
                                    <>
                                      <Download className="w-3 h-3" />
                                      安装
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="w-3 h-3" />
                                      重新安装
                                    </>
                                  )}
                                </button>
                              )}
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
