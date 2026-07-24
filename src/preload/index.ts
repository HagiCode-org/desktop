import * as electron from 'electron';
import type {
  AcceptLegalDocumentsPayload,
  LegalDocumentType,
  OnboardingDependencyInstallResult,
  OnboardingShowPayload,
  OnboardingTriggerResult,
  OnboardingRecoveryResult,
  OnboardingStartServiceResult,
  ResolvedLegalDocumentsPayload,
  StartupFailurePayload,
} from '../types/onboarding.js';
import { clipboardChannels } from '../types/clipboard.js';
import type { PromptGuidanceResponse } from '../types/prompt-guidance.js';
import type { DistributionMode, DistributionModeState } from '../types/distribution-mode.js';
import type { DesktopVersionInfoPayload } from '../types/version-info.js';
import type { SharingAccelerationSettings, SharingAccelerationSettingsInput, VersionDownloadProgress } from '../types/sharing-acceleration.js';
import type { SystemDiagnosticBridge } from '../types/system-diagnostic.js';
import { systemDiagnosticChannels } from '../types/system-diagnostic.js';
import type {
  DependencyManagementMode,
  ManagedNpmPackageId,
  DependencyManagementBatchSyncRequest,
  DependencyManagementBridge,
} from '../types/dependency-management.js';
import type { VendoredRuntimeId } from '../types/dependency-management.js';
import type { NpmMirrorSettingsInput } from '../types/dependency-management.js';
import { dependencyManagementChannels } from '../types/dependency-management.js';
import type { HagiNodeRuntimeBridge, HagiNodeRuntimeMetadata } from '../types/node-runtime.js';
import type { InstallWebServicePackageOptions, InstallWebServicePackageResult } from '../types/version-install.js';
import type {
  LogDirectoryBridge,
  LogDirectoryOpenResult,
  LogDirectoryTarget,
  LogDirectoryTargetStatus,
} from '../types/log-directory.js';
import type { RuntimeDataPathBridge, RuntimeDataPathPreset } from '../types/runtime-data-path.js';
import { runtimeDataPathChannels } from '../types/runtime-data-path.js';
import type { DebugOptionsBridge, DebugOptionsSettings } from '../types/debug-options.js';
import { debugOptionsChannels } from '../types/debug-options.js';
import type { SubscriptionBridge } from '../types/subscription.js';
import { subscriptionChannels } from '../types/subscription.js';
import type { TurboEngineLicenseBridge } from '../types/turboengine-license.js';
import { turboEngineChannels } from '../types/turboengine-license.js';
import type { MsstoreDonationItemBridge } from '../types/msstore-donation-item.js';
import { msstoreDonationItemChannels } from '../types/msstore-donation-item.js';
import type {
  DesktopBootstrapSnapshot,
} from '../types/bootstrap.js';
import type {
  HagihubApi,
  NotificationClickedPayload,
  NotificationParams,
  NotificationShownPayload,
} from '../shared/api.js';
import { createClipboardBridge } from './clipboard-bridge.js';
import { createSystemDiagnosticBridge } from './system-diagnostic-bridge.js';

const { contextBridge, ipcRenderer } = electron;
const SUBSCRIPTION_FEATURE_ARG = '--desktop-subscription-enabled=1';
const TURBOENGINE_LICENSE_FEATURE_ARG = '--desktop-turboengine-license-enabled=1';
export type {
  DesktopBootstrapSnapshot,
} from '../types/bootstrap.js';
export type {
  HagihubApi,
  NotificationClickedPayload,
  NotificationParams,
  NotificationShownPayload,
} from '../shared/api.js';

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
const subscriptionFeatureEnabled = process.argv.includes(SUBSCRIPTION_FEATURE_ARG);
const turboEngineLicenseFeatureEnabled = process.argv.includes(TURBOENGINE_LICENSE_FEATURE_ARG);

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  message: string;
  warnings?: string[];
}

export interface StartWebServiceResult {
  success: boolean;
  error?: { type: string; details: string };
  warning?: { type: string; missing: any[] };
  startupFailure?: StartupFailurePayload;
}

export interface WebServiceProcessInfo {
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  uptime: number;
  startTime: number | null;
  url: string | null;
  restartCount: number;
  phase: 'idle' | 'checking_version' | 'checking_dependencies' | 'spawning' | 'waiting_listening' | 'health_check' | 'running' | 'error';
  phaseMessage?: string;
  host: string;
  port: number;
}

export interface WebServiceStartupPhaseEvent {
  phase: WebServiceProcessInfo['phase'];
  message?: string;
  timestamp: number;
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
  disabledReason: 'settings-disabled' | 'portable-mode' | 'steam-mode' | 'no-package-source' | null;
  cachedArchives: VersionUpdateCachedArchivePayload[];
  failure: { message: string; at: string } | null;
}

export type VersionInstallProgressPayload = VersionDownloadProgress;

export interface AboutWindowOpenResult {
  success: boolean;
  status: 'created' | 'focused' | 'suppressed';
  error?: string;
}

// ElectronAPI interface combines all individual interfaces defined above
// The electronAPI constant below implements this interface
interface ElectronAPI {
  bootstrap: {
    getCachedSnapshot: () => DesktopBootstrapSnapshot | null;
    getSnapshot: () => Promise<DesktopBootstrapSnapshot>;
    refresh: () => Promise<DesktopBootstrapSnapshot>;
    openDesktopLogs: () => Promise<LogDirectoryOpenResult>;
  };
  getAppVersion: () => Promise<string>;
  getVersionInfo: () => Promise<DesktopVersionInfoPayload>;
  getDistributionMode: () => Promise<DistributionMode>;
  getDistributionModeState: () => Promise<DistributionModeState>;
  getMsstoreRatingPromptState: () => Promise<{ installDate?: string }>;
  msstoreDonationItem: MsstoreDonationItemBridge;
  showWindow: () => Promise<void>;
  hideWindow: () => Promise<void>;
  openHagicodeInApp: (url: string) => Promise<void>;
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
  onWebServiceStartupPhaseChange: (callback: (payload: WebServiceStartupPhaseEvent) => void) => () => void;

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
  hagiNode: HagiNodeRuntimeBridge;
  /** @deprecated Use dependencyManagement. */
  npmManagement: DependencyManagementBridge;
  dependencyManagement: DependencyManagementBridge;
  runtimeDataPath: RuntimeDataPathBridge;
  debugOptions: DebugOptionsBridge;
  subscription?: SubscriptionBridge;
  turboEngineLicense?: TurboEngineLicenseBridge;
  msstoreDonationItem?: MsstoreDonationItemBridge;

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

  // Prompt Guidance APIs
  llmGetPromptGuidance: (
    resourceKey: 'smartConfig',
    customPromptPath?: string
  ) => Promise<PromptGuidanceResponse>;
  llmGetVersionPromptGuidance: (
    versionId: string,
    region?: 'cn' | 'international'
  ) => Promise<PromptGuidanceResponse>;

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
  onOnboardingShow: (callback: (payload?: OnboardingShowPayload) => void) => () => void;
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
  getModeSettings: () => ipcRenderer.invoke(dependencyManagementChannels.getModeSettings),
  setMode: (mode: DependencyManagementMode) => ipcRenderer.invoke(dependencyManagementChannels.setMode, mode),
  getMirrorSettings: () => ipcRenderer.invoke(dependencyManagementChannels.getMirrorSettings),
  setMirrorSettings: (settings: NpmMirrorSettingsInput) => ipcRenderer.invoke(dependencyManagementChannels.setMirrorSettings, settings),
  install: (packageId: ManagedNpmPackageId) => ipcRenderer.invoke(dependencyManagementChannels.install, packageId),
  uninstall: (packageId: ManagedNpmPackageId) => ipcRenderer.invoke(dependencyManagementChannels.uninstall, packageId),
  syncPackages: (request: DependencyManagementBatchSyncRequest) => ipcRenderer.invoke(dependencyManagementChannels.syncPackages, request),
  enableVendoredRuntime: (runtimeId: VendoredRuntimeId) => ipcRenderer.invoke(dependencyManagementChannels.enableVendoredRuntime, runtimeId),
  startVendoredRuntime: (runtimeId: VendoredRuntimeId) => ipcRenderer.invoke(dependencyManagementChannels.startVendoredRuntime, runtimeId),
  stopVendoredRuntime: (runtimeId: VendoredRuntimeId) => ipcRenderer.invoke(dependencyManagementChannels.stopVendoredRuntime, runtimeId),
  restartVendoredRuntime: (runtimeId: VendoredRuntimeId) => ipcRenderer.invoke(dependencyManagementChannels.restartVendoredRuntime, runtimeId),
  repairVendoredRuntime: (runtimeId: VendoredRuntimeId) => ipcRenderer.invoke(dependencyManagementChannels.repairVendoredRuntime, runtimeId),
  openVendoredRuntimePath: (runtimeId: VendoredRuntimeId, target: 'logs' | 'runtime-root') => ipcRenderer.invoke(dependencyManagementChannels.openVendoredRuntimePath, runtimeId, target),
  onProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on(dependencyManagementChannels.progress, listener);
    return () => ipcRenderer.removeListener(dependencyManagementChannels.progress, listener);
  },
  onVendoredRuntimeActivationProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on(dependencyManagementChannels.vendoredRuntimeActivationProgress, listener);
    return () => ipcRenderer.removeListener(dependencyManagementChannels.vendoredRuntimeActivationProgress, listener);
  },
};

const runtimeDataPathBridge: RuntimeDataPathBridge = {
  getSettings: () => ipcRenderer.invoke(runtimeDataPathChannels.get),
  setPreset: (preset: RuntimeDataPathPreset) => ipcRenderer.invoke(runtimeDataPathChannels.set, preset),
};

const debugOptionsBridge: DebugOptionsBridge = {
  getSettings: () => ipcRenderer.invoke(debugOptionsChannels.get),
  setSettings: (settings: DebugOptionsSettings) => ipcRenderer.invoke(debugOptionsChannels.set, settings),
};

const subscriptionBridge: SubscriptionBridge = {
  getSnapshot: (options) => ipcRenderer.invoke(subscriptionChannels.getSnapshot, options),
  verifyStartup: () => ipcRenderer.invoke(subscriptionChannels.verifyStartup),
  refresh: () => ipcRenderer.invoke(subscriptionChannels.refresh),
  purchase: () => ipcRenderer.invoke(subscriptionChannels.purchase),
  onDidChange: (callback) => {
    const listener = (_event, snapshot) => {
      callback(snapshot);
    };
    ipcRenderer.on(subscriptionChannels.changed, listener);
    return () => ipcRenderer.removeListener(subscriptionChannels.changed, listener);
  },
};

const turboEngineLicenseBridge: TurboEngineLicenseBridge = {
  getSnapshot: () => ipcRenderer.invoke(turboEngineChannels.getSnapshot),
  verifyStartup: () => ipcRenderer.invoke(turboEngineChannels.verifyStartup),
  refresh: () => ipcRenderer.invoke(turboEngineChannels.refresh),
  purchase: () => ipcRenderer.invoke(turboEngineChannels.purchase),
  onDidChange: (callback) => {
    const listener = (_event, snapshot) => {
      callback(snapshot);
    };
    ipcRenderer.on(turboEngineChannels.changed, listener);
    return () => ipcRenderer.removeListener(turboEngineChannels.changed, listener);
  },
};

const hagihubApi: HagihubApi = {
  sendNotification: (params: NotificationParams) => ipcRenderer.invoke('hagihub:send-notification', params),
  onNotificationClicked: (callback) => {
    const listener = (_event, payload: NotificationClickedPayload) => {
      callback(payload);
    };
    ipcRenderer.on('hagihub:notification-clicked', listener);
    return () => ipcRenderer.removeListener('hagihub:notification-clicked', listener);
  },
  onNotificationShown: (callback) => {
    const listener = (_event, payload: NotificationShownPayload) => {
      callback(payload);
    };
    ipcRenderer.on('hagihub:notification-shown', listener);
    return () => ipcRenderer.removeListener('hagihub:notification-shown', listener);
  },
};

const hagiNodeBridge: HagiNodeRuntimeBridge = Object.freeze({
  getMetadata: async (): Promise<HagiNodeRuntimeMetadata> => {
    const snapshot = await ipcRenderer.invoke(dependencyManagementChannels.snapshot);
    return Object.freeze({
      nodeVersion: snapshot.environment.nodeVersion,
      nodeMajorVersion: snapshot.environment.nodeMajorVersion,
      npmGlobalPath: snapshot.environment.npmGlobalPrefix,
      npmGlobalBinPath: snapshot.environment.npmGlobalBinRoot,
      npmGlobalModulesPath: snapshot.environment.npmGlobalModulesRoot,
    });
  },
});

const msstoreDonationItemBridge: MsstoreDonationItemBridge = {
  getState: () => ipcRenderer.invoke(msstoreDonationItemChannels.getState),
  dismiss: () => ipcRenderer.invoke(msstoreDonationItemChannels.dismiss),
  purchase: (input) => ipcRenderer.invoke(msstoreDonationItemChannels.purchase, input),
  reconcilePending: () => ipcRenderer.invoke(msstoreDonationItemChannels.reconcilePending),
  onDidChange: (callback) => {
    const listener = (_event, snapshot) => {
      callback(snapshot);
    };
    ipcRenderer.on(msstoreDonationItemChannels.changed, listener);
    return () => ipcRenderer.removeListener(msstoreDonationItemChannels.changed, listener);
  },
};

const electronAPI: ElectronAPI = {
  bootstrap: {
    getCachedSnapshot: () => initialBootstrapSnapshot,
    getSnapshot: () => ipcRenderer.invoke('bootstrap:get-snapshot'),
    refresh: () => ipcRenderer.invoke('bootstrap:refresh'),
    openDesktopLogs: () => ipcRenderer.invoke('log-directory:open', 'desktop'),
  },
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  getVersionInfo: () => ipcRenderer.invoke('version-info'),
  getDistributionMode: () => ipcRenderer.invoke('get-distribution-mode'),
  getDistributionModeState: () => ipcRenderer.invoke('get-distribution-mode-state'),
  getMsstoreRatingPromptState: () => ipcRenderer.invoke('get-msstore-rating-prompt-state'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  openHagicodeInApp: (url: string) => ipcRenderer.invoke('open-hagicode-in-app', url),
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
  onWebServiceStartupPhaseChange: (callback) => {
    const listener = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on('web-service-startup-phase', listener);
    return () => ipcRenderer.removeListener('web-service-startup-phase', listener);
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
  runtimeDataPath: runtimeDataPathBridge,
  debugOptions: debugOptionsBridge,
  ...(subscriptionFeatureEnabled ? { subscription: subscriptionBridge } : {}),
  ...(turboEngineLicenseFeatureEnabled ? { turboEngineLicense: turboEngineLicenseBridge } : {}),
  ...(turboEngineLicenseFeatureEnabled ? { msstoreDonationItem: msstoreDonationItemBridge } : {}),
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
  switchView: (view: 'system' | 'web' | 'version' | 'diagnostic' | 'dependency-management' | 'settings' | 'subscription' | 'turboengine') => ipcRenderer.invoke('switch-view', view),
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

  // Prompt Guidance APIs
  llmGetPromptGuidance: (resourceKey: 'smartConfig', customPromptPath?: string) =>
    ipcRenderer.invoke('llm:get-prompt-guidance', resourceKey, customPromptPath),
  llmGetVersionPromptGuidance: (versionId: string, region?: 'cn' | 'international') =>
    ipcRenderer.invoke('llm:get-version-prompt-guidance', versionId, region),

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
    const listener = (_event, payload) => {
      callback(payload);
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

  sharingAcceleration: {
    get: () => ipcRenderer.invoke('sharing-acceleration:get'),
    set: (settings) => ipcRenderer.invoke('sharing-acceleration:set', settings),
    recordOnboardingChoice: (enabled) => ipcRenderer.invoke('sharing-acceleration:record-onboarding-choice', enabled),
  },
  clipboard: clipboardBridge,
  systemDiagnostic: systemDiagnosticBridge,
  hagiNode: hagiNodeBridge,
  npmManagement: dependencyManagementBridge,
  dependencyManagement: dependencyManagementBridge,
};

ipcRenderer.on('webview-navigate', (_event, direction: 'back' | 'forward' | 'refresh') => {
  rendererEventTarget.dispatchEvent(
    new rendererEventTarget.CustomEvent('webview-navigate', { detail: direction }),
  );
});

ipcRenderer.on('webview-devtools', () => {
  rendererEventTarget.dispatchEvent(new rendererEventTarget.CustomEvent('webview-devtools'));
});

ipcRenderer.on('hagihub:notification-clicked', (_event, payload: NotificationClickedPayload) => {
  rendererEventTarget.dispatchEvent(
    new rendererEventTarget.CustomEvent('hagihub:notification-clicked', { detail: payload }),
  );
});

ipcRenderer.on('hagihub:notification-shown', (_event, payload: NotificationShownPayload) => {
  rendererEventTarget.dispatchEvent(
    new rendererEventTarget.CustomEvent('hagihub:notification-shown', { detail: payload }),
  );
});

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('hagiNode', hagiNodeBridge);
contextBridge.exposeInMainWorld('hagihub', hagihubApi);
