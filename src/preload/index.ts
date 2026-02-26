import { contextBridge, ipcRenderer } from 'electron';

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

// ElectronAPI interface combines all individual interfaces defined above
// The electronAPI constant below implements this interface
interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  showWindow: () => Promise<void>;
  hideWindow: () => Promise<void>;
  openHagicodeInApp: (url: string) => Promise<void>;
  onServerStatusChange: (callback: (status: any) => void) => () => void;

  // Server Control APIs
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  getServerStatus: () => Promise<any>;

  // Web Service Management APIs
  getWebServiceStatus: () => Promise<any>;
  startWebService: (force?: boolean) => Promise<void>;
  stopWebService: () => Promise<void>;
  restartWebService: () => Promise<void>;
  getWebServiceVersion: () => Promise<string>;
  getWebServiceUrl: () => Promise<string>;
  setWebServiceConfig: (config: any) => Promise<void>;
  onWebServiceStatusChange: (callback: (status: any) => void) => () => void;

  // Package Management APIs
  checkPackageInstallation: () => Promise<void>;
  installWebServicePackage: (version: string) => Promise<void>;
  getAvailableVersions: () => Promise<string[]>;
  getPlatform: () => Promise<string>;
  onPackageInstallProgress: (callback: (progress: any) => void) => () => void;

  // Package Source Management APIs
  createPackageSource: (config: any) => Promise<void>;
  getAvailableVersionsFromSource: () => Promise<string[]>;
  installPackageFromSource: (versionIdentifier: string) => Promise<void>;
  validateSourceConfig: (config: any) => Promise<ValidationResult>;
  onConfigChange: (callback: (config: any) => void) => () => void;

  // Package Source Configuration APIs
  packageSource: {
    getConfig: () => Promise<any>;
    getAllConfigs: () => Promise<any[]>;
    saveConfig: (config: any) => Promise<boolean>;
    switchSource: (sourceId: string) => Promise<void>;
    removeSource: (sourceId: string) => Promise<boolean>;
    validateConfig: (config: any) => Promise<ValidationResult>;
    scanFolder: (folderPath: string) => Promise<any>;
    fetchGithub: (config: any) => Promise<any>;
    fetchHttpIndex: (config: any) => Promise<any>;
    getCurrentConfig: () => Promise<string | null>;
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
    set: (path: string) => Promise<{ success: boolean; error?: string }>;
    validate: (path: string) => Promise<ValidationResult>;
    getStorageInfo: (path?: string) => Promise<StorageInfo>;
    restoreDefault: () => Promise<{ success: boolean; path: string }>;
    openPicker: () => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  };

  // Dependency Management APIs
  checkDependencies: () => Promise<any>;
  installDependency: (dependencyType: string) => Promise<void>;
  onDependencyStatusChange: (callback: (dependencies: any) => void) => () => void;
}

const electronAPI = {
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  openHagicodeInApp: (url: string) => ipcRenderer.invoke('open-hagicode-in-app', url),
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
  installWebServicePackage: (version) => ipcRenderer.invoke('install-web-service-package', version),
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
    fetchGithub: (config) => ipcRenderer.invoke('package-source:fetch-github', config),
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
  versionInstall: (versionId) => ipcRenderer.invoke('version:install', versionId),
  versionUninstall: (versionId) => ipcRenderer.invoke('version:uninstall', versionId),
  versionSwitch: (versionId) => ipcRenderer.invoke('version:switch', versionId),
  versionReinstall: (versionId) => ipcRenderer.invoke('version:reinstall', versionId),
  versionCheckDependencies: (versionId) => ipcRenderer.invoke('version:checkDependencies', versionId),
  versionOpenLogs: (versionId) => ipcRenderer.invoke('version:openLogs', versionId),
  versionSetChannel: (channel) => ipcRenderer.invoke('version:setChannel', channel),
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
  onVersionDependencyWarning: (callback) => {
    const listener = (_event, warning) => {
      callback(warning);
    };
    ipcRenderer.on('version:dependencyWarning', listener);
    return () => ipcRenderer.removeListener('version:dependencyWarning', listener);
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
  switchView: (view: 'system' | 'web' | 'dependency' | 'version' | 'license') => ipcRenderer.invoke('switch-view', view),
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

  // License Management APIs
  license: {
    get: () => ipcRenderer.invoke('license:get'),
    save: (licenseKey: string) => ipcRenderer.invoke('license:save', licenseKey),
    onSyncStatus: (callback) => {
      const listener = (_event, status) => {
        callback(status);
      };
      ipcRenderer.on('license:syncStatus', listener);
      return () => ipcRenderer.removeListener('license:syncStatus', listener);
    },
  },

  // Onboarding APIs
  checkTriggerCondition: () => ipcRenderer.invoke('onboarding:check-trigger'),
  getOnboardingState: () => ipcRenderer.invoke('onboarding:get-state'),
  skipOnboarding: () => ipcRenderer.invoke('onboarding:skip'),
  downloadPackage: () => ipcRenderer.invoke('onboarding:download-package'),
  checkOnboardingDependencies: (version: string) => ipcRenderer.invoke('onboarding:check-dependencies', version),
  installDependencies: (version: string) => ipcRenderer.invoke('onboarding:install-dependencies', version),
  startService: (version: string) => ipcRenderer.invoke('onboarding:start-service', version),
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

  // Debug Mode APIs
  setDebugMode: (mode: { ignoreDependencyCheck: boolean }) => ipcRenderer.invoke('set-debug-mode', mode),
  getDebugMode: () => ipcRenderer.invoke('get-debug-mode'),
  onDebugModeChanged: (callback) => {
    const listener = (_event, mode: { ignoreDependencyCheck: boolean }) => {
      callback(mode);
    };
    ipcRenderer.on('debug-mode-changed', listener);
    return () => ipcRenderer.removeListener('debug-mode-changed', listener);
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

  // Agent CLI Selection APIs
  agentCliSave: (data: { cliType: string }) => ipcRenderer.invoke('agentCli:save', data),
  agentCliLoad: () => ipcRenderer.invoke('agentCli:load'),
  agentCliSkip: () => ipcRenderer.invoke('agentCli:skip'),
  agentCliDetect: (cliType: string) => ipcRenderer.invoke('agentCli:detect', cliType),
  agentCliGetCommand: (cliType: string) => ipcRenderer.invoke('agentCli:getCommand', cliType),
  agentCliGetSelected: () => ipcRenderer.invoke('agentCli:getSelected'),

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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
