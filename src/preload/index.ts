import { contextBridge, ipcRenderer } from 'electron';
import type {
  AcceptLegalDocumentsPayload,
  LegalDocumentType,
  OnboardingDependencyInstallResult,
  OnboardingTriggerResult,
  OnboardingRecoveryResult,
  OnboardingStartServiceResult,
  ResolvedLegalDocumentsPayload,
  StartupFailurePayload,
} from '../types/onboarding.js';
import { clipboardChannels } from '../types/clipboard.js';
import type { PromptGuidanceResponse } from '../types/prompt-guidance.js';
import type { DistributionMode } from '../types/distribution-mode.js';
import type { SharingAccelerationSettings, SharingAccelerationSettingsInput, VersionDownloadProgress } from '../types/sharing-acceleration.js';
import type { SystemDiagnosticBridge } from '../types/system-diagnostic.js';
import { systemDiagnosticChannels } from '../types/system-diagnostic.js';
import type { ManagedNpmPackageId, DependencyManagementBatchSyncRequest, DependencyManagementBridge } from '../types/dependency-management.js';
import type { NpmMirrorSettingsInput } from '../types/dependency-management.js';
import { dependencyManagementChannels } from '../types/dependency-management.js';
import type { OmniRouteBridge, OmniRouteConfigUpdatePayload, OmniRouteLogReadRequest, OmniRoutePathTarget } from '../types/omniroute-management.js';
import { omniRouteChannels } from '../types/omniroute-management.js';
import type { InstallWebServicePackageOptions, InstallWebServicePackageResult } from '../types/version-install.js';
import type {
  LogDirectoryBridge,
  LogDirectoryOpenResult,
  LogDirectoryTarget,
  LogDirectoryTargetStatus,
} from '../types/log-directory.js';
import type {
  DataDirectoryMutationResult,
  DataDirectoryValidationPayload,
  DesktopBootstrapSnapshot,
} from '../types/bootstrap.js';
import { createClipboardBridge } from './clipboard-bridge.js';
import { createSystemDiagnosticBridge } from './system-diagnostic-bridge.js';
export type {
  DataDirectoryMutationResult,
  DataDirectoryValidationPayload,
  DesktopBootstrapSnapshot,
} from '../types/bootstrap.js';

function readInitialBootstrapSnapshot(): DesktopBootstrapSnapshot | null {
  const argPrefix = '--desktop-bootstrap-snapshot=';
  const serialized = process.argv.find((arg) => arg.startsWith(argPrefix))?.slice(argPrefix.length);

  if (!serialized) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(serialized)) as DesktopBootstrapSnapshot;
  } catch (error) {
    console.error('[Preload] Failed to parse initial bootstrap snapshot:', error);
    return null;
  }
}

const initialBootstrapSnapshot = readInitialBootstrapSnapshot();

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  message: string;
  warnings?: string[];
}

// Storage information interface
export interface StorageInfo {
  used: number;
  total: number;
  available: number;
  usedPercentage: number;
}

export interface StartWebServiceResult {
  success: boolean;
  error?: { type: string; details: string };
  warning?: { type: string; missing: any[] };
  startupFailure?: StartupFailurePayload;
}

export interface WebServiceProcessInfo {
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  pid: number | null;
  uptime: number;
  startTime: number | null;
  url: string | null;
  restartCount: number;
  phase: 'idle' | 'spawning' | 'waiting_listening' | 'health_check' | 'running' | 'error';
  phaseMessage?: string;
  host: string;
  port: number;
  recoverySource?: 'none' | 'pid_file' | 'signature_fallback';
  recoveryMessage?: string;
}

export interface SetWebServiceConfigResult {
  success: boolean;
  error: string | null;
  errorCode?: 'invalid-listen-host' | 'invalid-port' | 'unknown';
}

export interface DesktopCompatibilityPayload {
  declared: boolean;
  compatible: boolean;
  requiredVersion?: string;
  currentVersion: string;
  message?: string;
  reason?: string;
}

export interface InstalledVersionValidationPayload {
  startable: boolean;
  message?: string;
  missingFiles?: string[];
  bundledRuntimeVersion?: string;
  desktopCompatibility?: DesktopCompatibilityPayload;
}

export interface InstalledVersionPayload {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  installedPath: string;
  installedAt: string;
  status: 'installed-ready' | 'payload-invalid' | 'runtime-incompatible' | 'desktop-incompatible';
  dependencies: any[];
  isActive: boolean;
  runtimeSource?: 'installed-version' | 'portable-fixed';
  isReadOnly?: boolean;
  validation?: InstalledVersionValidationPayload;
}

export interface VersionSwitchResultPayload {
  success: boolean;
  error?: string;
  errorCode?: 'not-installed' | 'desktop-incompatible' | 'portable-version-mode' | 'unknown';
  desktopCompatibility?: DesktopCompatibilityPayload;
}

export interface VersionAutoUpdateSettingsPayload {
  enabled: boolean;
  retainedArchiveCount: number;
}

export interface VersionUpdateVersionPayload {
  id: string;
  version: string;
  packageFilename: string;
  platform: string;
  sourceType?: string;
}

export interface VersionUpdateCachedArchivePayload {
  versionId: string;
  version: string;
  packageFilename: string;
  cachePath: string;
  retainedAt: string;
  verifiedAt: string;
  fileSize: number;
  sourceType?: string;
}

export interface VersionUpdateSnapshotPayload {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'failed' | 'disabled';
  currentVersion: VersionUpdateVersionPayload | null;
  latestVersion: VersionUpdateVersionPayload | null;
  downloadedVersionId: string | null;
  lastCheckedAt: string | null;
  lastUpdatedAt: string | null;
  disabledReason: 'settings-disabled' | 'portable-mode' | 'no-package-source' | null;
  cachedArchives: VersionUpdateCachedArchivePayload[];
  failure: { message: string; at: string } | null;
}

export type VersionInstallProgressPayload = VersionDownloadProgress;

export interface AboutWindowOpenResult {
  success: boolean;
  status: 'created' | 'focused' | 'suppressed';
  error?: string;
}

export type CodeServerWindowFailureStage =
  | 'invalid-url'
  | 'load-url'
  | 'did-fail-load'
  | 'render-timeout'
  | 'probe-error'
  | 'render-process-gone'
  | 'unresponsive';

export interface CodeServerWindowDiagnostics {
  failureStage?: CodeServerWindowFailureStage;
  lastUrl?: string;
  lastConsoleErrors: string[];
  failedLoads: string[];
  rendererExit?: string;
  unresponsive: boolean;
}

export type CodeServerWindowOpenResult =
  | {
    success: true;
    state: 'render-ready';
    lastUrl: string;
    canOpenExternal: true;
    diagnostics: CodeServerWindowDiagnostics;
  }
  | {
    success: false;
    state: 'render-failed';
    error: string;
    failureStage: CodeServerWindowFailureStage;
    diagnosticsSummary: string;
    diagnostics: CodeServerWindowDiagnostics;
    canOpenExternal: boolean;
    lastUrl?: string;
  };

// ElectronAPI interface combines all individual interfaces defined above
// The electronAPI constant below implements this interface
interface ElectronAPI {
  bootstrap: {
    getCachedSnapshot: () => DesktopBootstrapSnapshot | null;
    getSnapshot: () => Promise<DesktopBootstrapSnapshot>;
    refresh: () => Promise<DesktopBootstrapSnapshot>;
    restoreDefaultDataDirectory: () => Promise<DataDirectoryMutationResult>;
    openDesktopLogs: () => Promise<LogDirectoryOpenResult>;
  };
  getAppVersion: () => Promise<string>;
  getDistributionMode: () => Promise<DistributionMode>;
  showWindow: () => Promise<void>;
  hideWindow: () => Promise<void>;
  openHagicodeInApp: (url: string) => Promise<void>;
  // Renderer requests a desktop-managed BrowserWindow for Code Server launch URLs.
  openCodeServerWindow: (url: string) => Promise<CodeServerWindowOpenResult>;
  openAboutWindow: (url: string) => Promise<AboutWindowOpenResult>;
  languageChanged: (language: string) => Promise<{ success: boolean; error?: string }>;
  onServerStatusChange: (callback: (status: any) => void) => () => void;

  // Server Control APIs
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  getServerStatus: () => Promise<any>;

  // Web Service Management APIs
  getWebServiceStatus: () => Promise<WebServiceProcessInfo>;
  startWebService: (force?: boolean) => Promise<StartWebServiceResult>;
  stopWebService: () => Promise<void>;
  restartWebService: () => Promise<void>;
  getWebServiceVersion: () => Promise<string>;
  getWebServiceUrl: () => Promise<string | null>;
  setWebServiceConfig: (config: { host?: string; port?: number }) => Promise<SetWebServiceConfigResult>;
  onWebServiceStatusChange: (callback: (status: WebServiceProcessInfo) => void) => () => void;

  // Package Management APIs
  checkPackageInstallation: () => Promise<void>;
  installWebServicePackage: (
    version: string,
    options?: InstallWebServicePackageOptions,
  ) => Promise<InstallWebServicePackageResult>;
  getAvailableVersions: () => Promise<string[]>;
  getPlatform: () => Promise<string>;
  onPackageInstallProgress: (callback: (progress: VersionInstallProgressPayload) => void) => () => void;

  // Package Source Management APIs
  createPackageSource: (config: any) => Promise<void>;
  getAvailableVersionsFromSource: () => Promise<string[]>;
  installPackageFromSource: (versionIdentifier: string) => Promise<void>;
  validateSourceConfig: (config: any) => Promise<ValidationResult>;

  // Package Source Configuration APIs
  packageSource: {
    getConfig: () => Promise<any>;
    getAllConfigs: () => Promise<any[]>;
    setConfig: (config: any) => Promise<any>;
    switchSource: (sourceId: string) => Promise<any>;
    validateConfig: (config: any) => Promise<ValidationResult>;
    scanFolder: (folderPath: string) => Promise<any>;
    fetchHttpIndex: (config: any) => Promise<any>;
    onConfigChange: (callback: (config: any) => void) => () => void;
  };

  // Preset Management APIs
  presetFetch: () => Promise<void>;
  presetRefresh: () => Promise<void>;
  presetClearCache: () => Promise<void>;
  presetGetProvider: (providerId: string) => Promise<any>;
  presetGetAllProviders: () => Promise<any[]>;
  presetGetCacheStats: () => Promise<any>;

  // Data Directory Configuration APIs
  dataDirectory: {
    get: () => Promise<string>;
    set: (path: string) => Promise<DataDirectoryMutationResult>;
    validate: (path: string) => Promise<DataDirectoryValidationPayload>;
    getStorageInfo: (path?: string) => Promise<StorageInfo>;
    restoreDefault: () => Promise<DataDirectoryMutationResult>;
    openPicker: () => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  };

  sharingAcceleration: {
    get: () => Promise<SharingAccelerationSettings | null>;
    set: (settings: SharingAccelerationSettingsInput & { enabled: boolean }) => Promise<SharingAccelerationSettings | null>;
    recordOnboardingChoice: (enabled: boolean) => Promise<SharingAccelerationSettings | null>;
  };
  clipboard: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<void>;
  };
  systemDiagnostic: SystemDiagnosticBridge;
  /** @deprecated Use dependencyManagement. */
  npmManagement: DependencyManagementBridge;
  dependencyManagement: DependencyManagementBridge;
  omniroute: OmniRouteBridge;

  // Dependency Management APIs
  checkDependencies: () => Promise<any>;
  getBundledToolchainStatus: () => Promise<any>;
  refreshBundledToolchainStatus: () => Promise<any>;
  installDependency: (dependencyType: string) => Promise<void>;
  onDependencyStatusChange: (callback: (dependencies: any) => void) => () => void;

  // Version Management APIs
  versionList: () => Promise<any[]>;
  versionGetInstalled: () => Promise<InstalledVersionPayload[]>;
  versionGetActive: () => Promise<InstalledVersionPayload | null>;
  versionGetUpdateSnapshot: () => Promise<VersionUpdateSnapshotPayload>;
  versionGetAutoUpdateSettings: () => Promise<VersionAutoUpdateSettingsPayload>;
  versionSetAutoUpdateSettings: (settings: VersionAutoUpdateSettingsPayload) => Promise<VersionAutoUpdateSettingsPayload>;
  versionInstall: (versionId: string) => Promise<{ success: boolean; error?: string }>;
  versionUninstall: (versionId: string) => Promise<boolean>;
  versionSwitch: (versionId: string) => Promise<VersionSwitchResultPayload>;
  versionReinstall: (versionId: string) => Promise<boolean>;
  versionOpenLogs: (versionId: string) => Promise<{ success: boolean; error?: string }>;
  versionSetChannel: (channel: string) => Promise<{ success: boolean; error?: string }>;
  logDirectory: LogDirectoryBridge;
  onVersionInstallProgress: (callback: (progress: VersionInstallProgressPayload) => void) => () => void;
  onInstalledVersionsChanged: (callback: (versions: InstalledVersionPayload[]) => void) => () => void;
  onActiveVersionChanged: (callback: (version: InstalledVersionPayload | null) => void) => () => void;
  onVersionListChanged: (callback: () => void) => () => void;
  onVersionUpdateChanged: (callback: (snapshot: VersionUpdateSnapshotPayload) => void) => () => void;

  // LLM Installation APIs
  llmLoadPrompt: (manifestPath: string, region?: 'cn' | 'international') => Promise<any>;
  llmCallApi: (
    manifestPath: string,
    region?: 'cn' | 'international'
  ) => Promise<{ success: boolean; error?: string; errorCode?: string; messageId?: string; providerId?: string }>;
  llmDetectConfig: () => Promise<any>;
  llmGetRegion: () => Promise<any>;
  llmGetManifestPath: (versionId: string) => Promise<any>;
  llmGetPromptGuidance: (
    resourceKey: 'smartConfig',
    customPromptPath?: string
  ) => Promise<PromptGuidanceResponse>;
  llmGetVersionPromptGuidance: (
    versionId: string,
    region?: 'cn' | 'international'
  ) => Promise<PromptGuidanceResponse>;
  llmOpenAICliWithResource: (
    resourceKey: 'smartConfig',
    customPromptPath?: string
  ) => Promise<PromptGuidanceResponse>;
  llmOpenAICliWithPrompt: (promptPath: string) => Promise<PromptGuidanceResponse>;

  // Onboarding APIs
  checkTriggerCondition: () => Promise<OnboardingTriggerResult>;
  getOnboardingState: () => Promise<any>;
  getLegalDocuments: (locale: string, refresh?: boolean) => Promise<ResolvedLegalDocumentsPayload>;
  openLegalDocument: (documentType: LegalDocumentType, locale: string) => Promise<{ success: boolean; error?: string }>;
  acceptLegalDocuments: (payload: AcceptLegalDocumentsPayload) => Promise<{ success: boolean; error?: string }>;
  declineLegalDocuments: () => Promise<{ success: boolean; error?: string }>;
  skipOnboarding: () => Promise<{ success: boolean; error?: string }>;
  downloadPackage: () => Promise<any>;
  checkOnboardingDependencies: (version: string) => Promise<any>;
  installDependencies: (version: string) => Promise<OnboardingDependencyInstallResult>;
  startService: (version: string) => Promise<OnboardingStartServiceResult>;
  recoverServiceStartup: (version: string) => Promise<OnboardingRecoveryResult>;
  completeOnboarding: (version: string) => Promise<{ success: boolean; error?: string }>;
  resetOnboarding: () => Promise<{ success: boolean; error?: string }>;
  onDownloadProgress: (callback: (progress: any) => void) => () => void;
  onDependencyProgress: (callback: (status: any) => void) => () => void;
  onServiceProgress: (callback: (progress: any) => void) => () => void;
  onScriptOutput: (callback: (output: any) => void) => () => void;
  onOnboardingShow: (callback: () => void) => () => void;
}

const clipboardBridge = createClipboardBridge(ipcRenderer, clipboardChannels);
const systemDiagnosticBridge = createSystemDiagnosticBridge(ipcRenderer, systemDiagnosticChannels);
const logDirectoryBridge: LogDirectoryBridge = {
  listTargets: () => ipcRenderer.invoke('log-directory:list-targets'),
  open: (target) => ipcRenderer.invoke('log-directory:open', target),
};
const rendererEventTarget = globalThis as unknown as {
  dispatchEvent: (event: unknown) => void;
  CustomEvent: new <T>(type: string, init?: { detail?: T }) => unknown;
};

const dependencyManagementBridge: DependencyManagementBridge = {
  getSnapshot: () => ipcRenderer.invoke(dependencyManagementChannels.snapshot),
  refresh: () => ipcRenderer.invoke(dependencyManagementChannels.refresh),
  getMirrorSettings: () => ipcRenderer.invoke(dependencyManagementChannels.getMirrorSettings),
  setMirrorSettings: (settings: NpmMirrorSettingsInput) => ipcRenderer.invoke(dependencyManagementChannels.setMirrorSettings, settings),
  install: (packageId: ManagedNpmPackageId) => ipcRenderer.invoke(dependencyManagementChannels.install, packageId),
  uninstall: (packageId: ManagedNpmPackageId) => ipcRenderer.invoke(dependencyManagementChannels.uninstall, packageId),
  syncPackages: (request: DependencyManagementBatchSyncRequest) => ipcRenderer.invoke(dependencyManagementChannels.syncPackages, request),
  onProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on(dependencyManagementChannels.progress, listener);
    return () => ipcRenderer.removeListener(dependencyManagementChannels.progress, listener);
  },
};

const electronAPI: ElectronAPI = {
  bootstrap: {
    getCachedSnapshot: () => initialBootstrapSnapshot,
    getSnapshot: () => ipcRenderer.invoke('bootstrap:get-snapshot'),
    refresh: () => ipcRenderer.invoke('bootstrap:refresh'),
    restoreDefaultDataDirectory: () => ipcRenderer.invoke('data-directory:restore-default'),
    openDesktopLogs: () => ipcRenderer.invoke('log-directory:open', 'desktop'),
  },
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  getDistributionMode: () => ipcRenderer.invoke('get-distribution-mode'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  openHagicodeInApp: (url: string) => ipcRenderer.invoke('open-hagicode-in-app', url),
  openCodeServerWindow: (url: string) => ipcRenderer.invoke('open-code-server-window', url),
  openAboutWindow: (url: string) => ipcRenderer.invoke('open-about-window', url),
  languageChanged: (language: string) => ipcRenderer.invoke('language-changed', language),
  onServerStatusChange: (callback) => {
    const listener = (_event, status) => {
      callback(status);
    };
    ipcRenderer.on('server-status-changed', listener);
    return () => ipcRenderer.removeListener('server-status-changed', listener);
  },
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),

  // Web Service Management APIs
  getWebServiceStatus: () => ipcRenderer.invoke('get-web-service-status'),
  startWebService: (force?: boolean) => ipcRenderer.invoke('start-web-service', force),
  stopWebService: () => ipcRenderer.invoke('stop-web-service'),
  restartWebService: () => ipcRenderer.invoke('restart-web-service'),
  getWebServiceVersion: () => ipcRenderer.invoke('get-web-service-version'),
  getWebServiceUrl: () => ipcRenderer.invoke('get-web-service-url'),
  setWebServiceConfig: (config) => ipcRenderer.invoke('set-web-service-config', config),
  onWebServiceStatusChange: (callback) => {
    const listener = (_event, status) => {
      callback(status);
    };
    ipcRenderer.on('web-service-status-changed', listener);
    return () => ipcRenderer.removeListener('web-service-status-changed', listener);
  },

  // Package Management APIs
  checkPackageInstallation: () => ipcRenderer.invoke('check-package-installation'),
  installWebServicePackage: (version, options) => ipcRenderer.invoke('install-web-service-package', version, options),
  getAvailableVersions: () => ipcRenderer.invoke('get-available-versions'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  onPackageInstallProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on('package-install-progress', listener);
    return () => ipcRenderer.removeListener('package-install-progress', listener);
  },

  // Package Source Management APIs
  createPackageSource: (config) => ipcRenderer.invoke('package:create-source', config),
  getAvailableVersionsFromSource: () => ipcRenderer.invoke('package:get-versions'),
  installPackageFromSource: (versionIdentifier) => ipcRenderer.invoke('package:install-from-source', versionIdentifier),
  validateSourceConfig: (config) => ipcRenderer.invoke('package:validate-source-config', config),

  // Package Source Configuration APIs (new)
  packageSource: {
    getConfig: () => ipcRenderer.invoke('package-source:get-config'),
    getAllConfigs: () => ipcRenderer.invoke('package-source:get-all-configs'),
    setConfig: (config) => ipcRenderer.invoke('package-source:set-config', config),
    switchSource: (sourceId) => ipcRenderer.invoke('package-source:switch-source', sourceId),
    validateConfig: (config) => ipcRenderer.invoke('package-source:validate-config', config),
    scanFolder: (folderPath) => ipcRenderer.invoke('package-source:scan-folder', folderPath),
    fetchHttpIndex: (config) => ipcRenderer.invoke('package-source:fetch-http-index', config),
    onConfigChange: (callback) => {
      const listener = (_event, config) => {
        callback(config);
      };
      ipcRenderer.on('package-source:configChanged', listener);
      return () => ipcRenderer.removeListener('package-source:configChanged', listener);
    },
  },

  // Dependency Management APIs
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
  getBundledToolchainStatus: () => ipcRenderer.invoke('dependency:get-bundled-toolchain-status'),
  refreshBundledToolchainStatus: () => ipcRenderer.invoke('dependency:refresh-bundled-toolchain-status'),
  installDependency: (dependencyType) => ipcRenderer.invoke('install-dependency', dependencyType),
  onDependencyStatusChange: (callback) => {
    const listener = (_event, dependencies) => {
      callback(dependencies);
    };
    ipcRenderer.on('dependency-status-changed', listener);
    return () => ipcRenderer.removeListener('dependency-status-changed', listener);
  },

  // Manifest-based dependency installation APIs
  installFromManifest: (versionId) => ipcRenderer.invoke('dependency:install-from-manifest', versionId),
  installSingleDependency: (dependencyKey, versionId) => ipcRenderer.invoke('dependency:install-single', dependencyKey, versionId),
  getMissingDependencies: (versionId) => ipcRenderer.invoke('dependency:get-missing', versionId),
  getAllDependencies: (versionId) => ipcRenderer.invoke('dependency:get-all', versionId),
  getDependencyList: (versionId) => ipcRenderer.invoke('dependency:get-list', versionId),
  onDependencyInstallProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on('dependency:install-progress', listener);
    return () => ipcRenderer.removeListener('dependency:install-progress', listener);
  },

  // Install commands execution with real-time progress
  executeInstallCommands: (commands: string[], workingDirectory?: string) => ipcRenderer.invoke('dependency:execute-commands', commands, workingDirectory),
  onInstallCommandProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on('dependency:command-progress', listener);
    return () => ipcRenderer.removeListener('dependency:command-progress', listener);
  },

  // Package Dependencies APIs
  getPackageDependencies: () => ipcRenderer.invoke('get-package-dependencies'),
  refreshPackageDependencies: () => ipcRenderer.invoke('refresh-package-dependencies'),
  installPackageDependency: (dependencyType) => ipcRenderer.invoke('install-package-dependency', dependencyType),
  onPackageDependenciesUpdated: (callback) => {
    const listener = (_event, dependencies) => {
      callback(dependencies);
    };
    ipcRenderer.on('package-dependencies-updated', listener);
    return () => ipcRenderer.removeListener('package-dependencies-updated', listener);
  },

  // Version Management APIs
  versionList: () => ipcRenderer.invoke('version:list'),
  versionGetInstalled: () => ipcRenderer.invoke('version:getInstalled'),
  versionGetActive: () => ipcRenderer.invoke('version:getActive'),
  versionGetUpdateSnapshot: () => ipcRenderer.invoke('version:getUpdateSnapshot'),
  versionGetAutoUpdateSettings: () => ipcRenderer.invoke('version:getAutoUpdateSettings'),
  versionSetAutoUpdateSettings: (settings) => ipcRenderer.invoke('version:setAutoUpdateSettings', settings),
  versionInstall: (versionId) => ipcRenderer.invoke('version:install', versionId),
  versionUninstall: (versionId) => ipcRenderer.invoke('version:uninstall', versionId),
  versionSwitch: (versionId) => ipcRenderer.invoke('version:switch', versionId),
  versionReinstall: (versionId) => ipcRenderer.invoke('version:reinstall', versionId),
  versionOpenLogs: (versionId) => ipcRenderer.invoke('version:openLogs', versionId),
  versionSetChannel: (channel) => ipcRenderer.invoke('version:setChannel', channel),
  logDirectory: logDirectoryBridge,
  onVersionInstallProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on('version:install-progress', listener);
    return () => ipcRenderer.removeListener('version:install-progress', listener);
  },
  onInstalledVersionsChanged: (callback) => {
    const listener = (_event, versions) => {
      callback(versions);
    };
    ipcRenderer.on('version:installedVersionsChanged', listener);
    return () => ipcRenderer.removeListener('version:installedVersionsChanged', listener);
  },
  onActiveVersionChanged: (callback) => {
    const listener = (_event, version) => {
      callback(version);
    };
    ipcRenderer.on('version:activeVersionChanged', listener);
    return () => ipcRenderer.removeListener('version:activeVersionChanged', listener);
  },
  onVersionListChanged: (callback) => {
    const listener = (_event) => {
      callback();
    };
    ipcRenderer.on('version:list:changed', listener);
    return () => ipcRenderer.removeListener('version:list:changed', listener);
  },
  onVersionUpdateChanged: (callback) => {
    const listener = (_event, snapshot) => {
      callback(snapshot);
    };
    ipcRenderer.on('version:update-state-changed', listener);
    return () => ipcRenderer.removeListener('version:update-state-changed', listener);
  },
  onOnboardingSwitchToWeb: (callback) => {
    const listener = (_event, data) => {
      callback(data);
    };
    ipcRenderer.on('onboarding:switch-to-web', listener);
    return () => ipcRenderer.removeListener('onboarding:switch-to-web', listener);
  },
  onOnboardingOpenHagicode: (callback) => {
    const listener = (_event, data) => {
      callback(data);
    };
    ipcRenderer.on('onboarding:open-hagicode', listener);
    return () => ipcRenderer.removeListener('onboarding:open-hagicode', listener);
  },

  // View Management APIs
  switchView: (view: 'system' | 'web' | 'version' | 'diagnostic' | 'dependency-management' | 'omniroute' | 'settings') => ipcRenderer.invoke('switch-view', view),
  getCurrentView: () => ipcRenderer.invoke('get-current-view'),
  onViewChange: (callback) => {
    const listener = (_event, view) => {
      callback(view);
    };
    ipcRenderer.on('view-changed', listener);
    return () => ipcRenderer.removeListener('view-changed', listener);
  },

  // Region Detection APIs
  getRegionStatus: () => ipcRenderer.invoke('region:get-status'),
  redetectRegion: () => ipcRenderer.invoke('region:redetect'),

  // LLM Installation APIs
  llmLoadPrompt: (manifestPath: string, region?: 'cn' | 'international') => ipcRenderer.invoke('llm:load-prompt', manifestPath, region),
  llmCallApi: (manifestPath: string, region?: 'cn' | 'international') => ipcRenderer.invoke('llm:call-api', manifestPath, region),
  llmDetectConfig: () => ipcRenderer.invoke('llm:detect-config'),
  llmGetRegion: () => ipcRenderer.invoke('llm:get-region'),
  llmGetManifestPath: (versionId: string) => ipcRenderer.invoke('llm:get-manifest-path', versionId),
  llmGetPromptGuidance: (resourceKey: 'smartConfig', customPromptPath?: string) =>
    ipcRenderer.invoke('llm:get-prompt-guidance', resourceKey, customPromptPath),
  llmGetVersionPromptGuidance: (versionId: string, region?: 'cn' | 'international') =>
    ipcRenderer.invoke('llm:get-version-prompt-guidance', versionId, region),
  llmOpenAICliWithResource: (resourceKey: 'smartConfig', customPromptPath?: string) =>
    ipcRenderer.invoke('llm:open-ai-cli-with-resource', resourceKey, customPromptPath),
  llmOpenAICliWithPrompt: (promptPath: string) => ipcRenderer.invoke('llm:open-ai-cli-with-prompt', promptPath),

  // Tray service control
  onTrayStartService: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('tray-start-service', listener);
    return () => ipcRenderer.removeListener('tray-start-service', listener);
  },
  onTrayStopService: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('tray-stop-service', listener);
    return () => ipcRenderer.removeListener('tray-stop-service', listener);
  },

  // Open external link API
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Onboarding APIs
  checkTriggerCondition: () => ipcRenderer.invoke('onboarding:check-trigger'),
  getOnboardingState: () => ipcRenderer.invoke('onboarding:get-state'),
  getLegalDocuments: (locale: string, refresh = false) => ipcRenderer.invoke('onboarding:get-legal-documents', locale, refresh),
  openLegalDocument: (documentType: LegalDocumentType, locale: string) =>
    ipcRenderer.invoke('onboarding:open-legal-document', documentType, locale),
  acceptLegalDocuments: (payload: AcceptLegalDocumentsPayload) =>
    ipcRenderer.invoke('onboarding:accept-legal-documents', payload),
  declineLegalDocuments: () => ipcRenderer.invoke('onboarding:decline-legal-documents'),
  skipOnboarding: () => ipcRenderer.invoke('onboarding:skip'),
  downloadPackage: () => ipcRenderer.invoke('onboarding:download-package'),
  checkOnboardingDependencies: (version: string) => ipcRenderer.invoke('onboarding:check-dependencies', version),
  installDependencies: (version: string) => ipcRenderer.invoke('onboarding:install-dependencies', version),
  startService: (version: string) => ipcRenderer.invoke('onboarding:start-service', version),
  recoverServiceStartup: (version: string) => ipcRenderer.invoke('onboarding:recover-service-startup', version),
  completeOnboarding: (version: string) => ipcRenderer.invoke('onboarding:complete', version),
  resetOnboarding: () => ipcRenderer.invoke('onboarding:reset'),
  onDownloadProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on('onboarding:download-progress', listener);
    return () => ipcRenderer.removeListener('onboarding:download-progress', listener);
  },
  onDependencyProgress: (callback) => {
    const listener = (_event, status) => {
      callback(status);
    };
    ipcRenderer.on('onboarding:dependency-progress', listener);
    return () => ipcRenderer.removeListener('onboarding:dependency-progress', listener);
  },
  onServiceProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on('onboarding:service-progress', listener);
    return () => ipcRenderer.removeListener('onboarding:service-progress', listener);
  },
  // Real-time script output during dependency check/install
  onScriptOutput: (callback) => {
    const listener = (_event, output) => {
      callback(output);
    };
    ipcRenderer.on('onboarding:script-output', listener);
    return () => ipcRenderer.removeListener('onboarding:script-output', listener);
  },
  onOnboardingShow: (callback) => {
    const listener = (_event) => {
      callback();
    };
    ipcRenderer.on('onboarding:show', listener);
    return () => ipcRenderer.removeListener('onboarding:show', listener);
  },

  // RSS Feed APIs
  rss: {
    getFeedItems: () => ipcRenderer.invoke('rss-get-feed-items'),
    refreshFeed: () => ipcRenderer.invoke('rss-refresh-feed'),
    getLastUpdate: () => ipcRenderer.invoke('rss-get-last-update'),
  },

  // Claude Config APIs
  claudeDetect: () => ipcRenderer.invoke('claude:detect'),
  claudeValidate: (provider: string, apiKey: string, endpoint?: string) => ipcRenderer.invoke('claude:validate', provider, apiKey, endpoint),
  claudeVerifyCli: () => ipcRenderer.invoke('claude:verify-cli'),
  claudeSave: (config: any) => ipcRenderer.invoke('claude:save', config),
  claudeGetStored: () => ipcRenderer.invoke('claude:get-stored'),
  claudeDelete: () => ipcRenderer.invoke('claude:delete'),
  claudeTest: () => ipcRenderer.invoke('claude:test'),
  claudeListBackups: () => ipcRenderer.invoke('claude:list-backups'),
  claudeRestoreFromBackup: (backupPath: string) => ipcRenderer.invoke('claude:restore-backup', backupPath),

  // Preset Management APIs
  presetFetch: () => ipcRenderer.invoke('preset:fetch'),
  presetRefresh: () => ipcRenderer.invoke('preset:refresh'),
  presetClearCache: () => ipcRenderer.invoke('preset:clear-cache'),
  presetGetProvider: (providerId: string) => ipcRenderer.invoke('preset:get-provider', providerId),
  presetGetAllProviders: () => ipcRenderer.invoke('preset:get-all-providers'),
  presetGetCacheStats: () => ipcRenderer.invoke('preset:get-cache-stats'),

  // Data Directory Configuration APIs
  dataDirectory: {
    get: () => ipcRenderer.invoke('data-directory:get'),
    set: (path: string) => ipcRenderer.invoke('data-directory:set', path),
    validate: (path: string) => ipcRenderer.invoke('data-directory:validate', path),
    getStorageInfo: (path?: string) => ipcRenderer.invoke('data-directory:get-storage-info', path),
    restoreDefault: () => ipcRenderer.invoke('data-directory:restore-default'),
    openPicker: () => ipcRenderer.invoke('data-directory:open-picker'),
  },

  sharingAcceleration: {
    get: () => ipcRenderer.invoke('sharing-acceleration:get'),
    set: (settings) => ipcRenderer.invoke('sharing-acceleration:set', settings),
    recordOnboardingChoice: (enabled) => ipcRenderer.invoke('sharing-acceleration:record-onboarding-choice', enabled),
  },
  clipboard: clipboardBridge,
  systemDiagnostic: systemDiagnosticBridge,
  npmManagement: dependencyManagementBridge,
  dependencyManagement: dependencyManagementBridge,
  omniroute: {
    getStatus: () => ipcRenderer.invoke(omniRouteChannels.status),
    start: () => ipcRenderer.invoke(omniRouteChannels.start),
    stop: () => ipcRenderer.invoke(omniRouteChannels.stop),
    restart: () => ipcRenderer.invoke(omniRouteChannels.restart),
    getConfig: () => ipcRenderer.invoke(omniRouteChannels.getConfig),
    setConfig: (payload: OmniRouteConfigUpdatePayload) => ipcRenderer.invoke(omniRouteChannels.setConfig, payload),
    readLog: (request: OmniRouteLogReadRequest) => ipcRenderer.invoke(omniRouteChannels.readLog, request),
    openPath: (target: OmniRoutePathTarget) => ipcRenderer.invoke(omniRouteChannels.openPath, target),
    onStatusChange: (callback) => {
      const listener = (_event, status) => {
        callback(status);
      };
      ipcRenderer.on(omniRouteChannels.statusChanged, listener);
      return () => ipcRenderer.removeListener(omniRouteChannels.statusChanged, listener);
    },
  },
};

ipcRenderer.on('webview-navigate', (_event, direction: 'back' | 'forward' | 'refresh') => {
  rendererEventTarget.dispatchEvent(
    new rendererEventTarget.CustomEvent('webview-navigate', { detail: direction }),
  );
});

ipcRenderer.on('webview-devtools', () => {
  rendererEventTarget.dispatchEvent(new rendererEventTarget.CustomEvent('webview-devtools'));
});

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
