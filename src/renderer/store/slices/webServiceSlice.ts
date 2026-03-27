import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * Enum representing the different states of the version installation process
 */
export enum InstallState {
  /** Initial state, no installation in progress */
  Idle = 'idle',
  /** Waiting for user confirmation (service is running) */
  Confirming = 'confirming',
  /** Stopping the service before installation */
  StoppingService = 'stopping_service',
  /** Installation in progress */
  Installing = 'installing',
  /** Installation completed successfully */
  Completed = 'completed',
  /** Installation failed */
  Error = 'error'
}

// Import InstalledVersion type from main process
export interface InstalledVersion {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  installedPath: string;
  installedAt: string;
  status: 'installed-ready' | 'payload-invalid' | 'runtime-incompatible' | 'desktop-incompatible';
  dependencies: any[];
  isActive: boolean;
  validation?: {
    startable: boolean;
    message?: string;
    desktopCompatibility?: {
      declared: boolean;
      compatible: boolean;
      requiredVersion?: string;
      currentVersion: string;
      message?: string;
      reason?: string;
    };
  };
}

export type ProcessStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping';

export enum StartupPhase {
  Idle = 'idle',
  Spawning = 'spawning',
  WaitingListening = 'waiting_listening',
  HealthCheck = 'health_check',
  Running = 'running',
  Error = 'error'
}

export interface ProcessInfo {
  status: ProcessStatus;
  pid: number | null;
  uptime: number;
  startTime: number | null;
  url: string | null;
  restartCount: number;
  phase: StartupPhase;
  phaseMessage?: string;
  host: string;
  port: number;
  recoverySource?: 'none' | 'pid_file' | 'signature_fallback';
  recoveryMessage?: string;
}

export interface PackageInfo {
  version: string;
  platform: string;
  installedPath: string;
  isInstalled: boolean;
}

export interface InstallProgress {
  stage: 'queued' | 'downloading' | 'backfilling' | 'verifying' | 'extracting' | 'completed' | 'error';
  progress: number;
  message: string;
  mode?: 'http-direct' | 'shared-acceleration' | 'source-fallback';
  peers?: number;
  p2pBytes?: number;
  fallbackBytes?: number;
  verified?: boolean;
}

export interface StartupFailurePayload {
  summary: string;
  log: string;
  port: number;
  timestamp: string;
  truncated: boolean;
}

export interface DependencyItem {
  name: string;
  type: string;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
}

export interface WebServiceState {
  // Process management state
  status: ProcessStatus;
  pid: number | null;
  url: string | null;
  version: string | null;
  lastError: string | null;
  isOperating: boolean; // Start/stop operation in progress
  restartCount: number;
  startTime: number | null;
  uptime: number;
  host: string;
  port: number;
  recoverySource: 'none' | 'pid_file' | 'signature_fallback';
  recoveryMessage: string | null;
  startupFailure: StartupFailurePayload | null;
  showStartupFailureDialog: boolean;
  showStartConfirm: boolean;
  missingDependenciesList: DependencyItem[];
  showDependencyWarning: boolean;

  // Startup phase state
  phase: StartupPhase;
  phaseMessage: string | null;

  // Port availability state
  portAvailable: boolean;
  portStatusChecked: boolean;

  // Package management state
  packageInfo: PackageInfo | null;
  installProgress: InstallProgress | null;
  isInstalling: boolean;
  availableVersions: string[];
  platform: string | null;

  // Version management state
  activeVersion: InstalledVersion | null;

  // Install confirmation dialog state
  showInstallConfirm: boolean;      // Whether to show the install confirmation dialog
  pendingInstallVersion: string | null;  // The version ID waiting to be installed

  // Install state for loading feedback
  installState: InstallState;  // Current installation state for UI feedback
}

const initialState: WebServiceState = {
  status: 'stopped',
  pid: null,
  url: null,
  version: null,
  lastError: null,
  isOperating: false,
  restartCount: 0,
  startTime: null,
  uptime: 0,
  host: 'localhost',
  port: 36556,
  recoverySource: 'none',
  recoveryMessage: null,
  startupFailure: null,
  showStartupFailureDialog: false,
  showStartConfirm: false,
  missingDependenciesList: [],
  showDependencyWarning: false,

  phase: StartupPhase.Idle,
  phaseMessage: null,

  portAvailable: true,
  portStatusChecked: false,

  packageInfo: null,
  installProgress: null,
  isInstalling: false,
  availableVersions: [],
  platform: null,

  activeVersion: null,

  showInstallConfirm: false,
  pendingInstallVersion: null,

  installState: InstallState.Idle,
};

export const webServiceSlice = createSlice({
  name: 'webService',
  initialState,
  reducers: {
    // Process management actions
    setStatus: (state, action: PayloadAction<ProcessStatus>) => {
      state.status = action.payload;
    },

    setOperating: (state, action: PayloadAction<boolean>) => {
      state.isOperating = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.lastError = action.payload;
      if (action.payload) {
        state.status = 'error';
      }
    },

    clearError: (state) => {
      state.lastError = null;
    },

    setPid: (state, action: PayloadAction<number | null>) => {
      state.pid = action.payload;
    },

    setUrl: (state, action: PayloadAction<string | null>) => {
      state.url = action.payload;
    },

    setVersion: (state, action: PayloadAction<string | null>) => {
      state.version = action.payload;
    },

    setStartTime: (state, action: PayloadAction<number | null>) => {
      state.startTime = action.payload;
    },

    setUptime: (state, action: PayloadAction<number>) => {
      state.uptime = action.payload;
    },

    incrementRestartCount: (state) => {
      state.restartCount += 1;
    },

    resetRestartCount: (state) => {
      state.restartCount = 0;
    },

    setPort: (state, action: PayloadAction<number>) => {
      state.port = action.payload;
    },

    setHost: (state, action: PayloadAction<string>) => {
      state.host = action.payload;
    },

    // Update entire process info
    setProcessInfo: (state, action: PayloadAction<ProcessInfo>) => {
      state.status = action.payload.status;
      state.pid = action.payload.pid;
      state.url = action.payload.url;
      state.startTime = action.payload.startTime;
      state.uptime = action.payload.uptime;
      state.restartCount = action.payload.restartCount;
      state.phase = action.payload.phase;
      state.phaseMessage = action.payload.phaseMessage || null;
      state.host = action.payload.host;
      state.port = action.payload.port;
      state.recoverySource = action.payload.recoverySource || 'none';
      state.recoveryMessage = action.payload.recoveryMessage || null;
    },

    setStartupFailure: (state, action: PayloadAction<StartupFailurePayload | null>) => {
      state.startupFailure = action.payload;
      state.showStartupFailureDialog = !!action.payload;
    },

    showStartupFailureDialog: (state) => {
      if (state.startupFailure) {
        state.showStartupFailureDialog = true;
      }
    },

    hideStartupFailureDialog: (state) => {
      state.showStartupFailureDialog = false;
    },

    showStartConfirmDialog: (state, action: PayloadAction<DependencyItem[]>) => {
      state.showStartConfirm = true;
      state.missingDependenciesList = action.payload;
    },

    hideStartConfirmDialog: (state) => {
      state.showStartConfirm = false;
    },

    setMissingDependenciesList: (state, action: PayloadAction<DependencyItem[]>) => {
      state.missingDependenciesList = action.payload;
    },

    setShowDependencyWarning: (state, action: PayloadAction<boolean>) => {
      state.showDependencyWarning = action.payload;
    },

    // Port status actions
    setPortAvailable: (state, action: PayloadAction<boolean>) => {
      state.portAvailable = action.payload;
      state.portStatusChecked = true;
    },

    // Startup phase actions
    setStartupPhase: (state, action: PayloadAction<{ phase: StartupPhase; message?: string }>) => {
      state.phase = action.payload.phase;
      state.phaseMessage = action.payload.message || null;
    },

    // Package management actions
    setPackageInfo: (state, action: PayloadAction<PackageInfo | null>) => {
      state.packageInfo = action.payload;
    },

    setInstallProgress: (state, action: PayloadAction<InstallProgress | null>) => {
      state.installProgress = action.payload;
      state.isInstalling = action.payload?.stage !== 'completed' && action.payload?.stage !== 'error';
    },

    setIsInstalling: (state, action: PayloadAction<boolean>) => {
      state.isInstalling = action.payload;
    },

    setAvailableVersions: (state, action: PayloadAction<string[]>) => {
      state.availableVersions = action.payload;
    },

    setPlatform: (state, action: PayloadAction<string | null>) => {
      state.platform = action.payload;
    },

    // Version management actions
    setActiveVersion: (state, action: PayloadAction<InstalledVersion | null>) => {
      state.activeVersion = action.payload;
    },

    // Install confirmation dialog actions
    showInstallConfirm: (state, action: PayloadAction<string>) => {
      state.showInstallConfirm = true;
      state.pendingInstallVersion = action.payload;
    },

    hideInstallConfirm: (state) => {
      state.showInstallConfirm = false;
      state.pendingInstallVersion = null;
    },

    // Install state actions for loading feedback
    setInstallState: (state, action: PayloadAction<InstallState>) => {
      state.installState = action.payload;
    },

    // Reset state
    reset: () => initialState,
  },
});

// Export actions
export const {
  setStatus,
  setOperating,
  setError,
  clearError,
  setPid,
  setUrl,
  setVersion,
  setStartTime,
  setUptime,
  incrementRestartCount,
  resetRestartCount,
  setPort,
  setHost,
  setProcessInfo,
  setPortAvailable,
  setStartupPhase,
  setStartupFailure,
  showStartupFailureDialog,
  hideStartupFailureDialog,
  showStartConfirmDialog,
  hideStartConfirmDialog,
  setMissingDependenciesList,
  setShowDependencyWarning,
  setPackageInfo,
  setInstallProgress,
  setIsInstalling,
  setAvailableVersions,
  setPlatform,
  setActiveVersion,
  showInstallConfirm,
  hideInstallConfirm,
  setInstallState,
  reset,
} = webServiceSlice.actions;

// Selectors
export const selectWebServiceStatus = (state: { webService: WebServiceState }) => state.webService.status;
export const selectWebServicePid = (state: { webService: WebServiceState }) => state.webService.pid;
export const selectWebServiceUrl = (state: { webService: WebServiceState }) => state.webService.url;
export const selectWebServiceVersion = (state: { webService: WebServiceState }) => state.webService.version;
export const selectWebServiceOperating = (state: { webService: WebServiceState }) => state.webService.isOperating;
export const selectWebServiceError = (state: { webService: WebServiceState }) => state.webService.lastError;
export const selectWebServiceStartTime = (state: { webService: WebServiceState }) => state.webService.startTime;
export const selectWebServiceUptime = (state: { webService: WebServiceState }) => state.webService.uptime;
export const selectRestartCount = (state: { webService: WebServiceState }) => state.webService.restartCount;
export const selectStartupPhase = (state: { webService: WebServiceState }) => state.webService.phase;
export const selectPhaseMessage = (state: { webService: WebServiceState }) => state.webService.phaseMessage;
export const selectPortAvailable = (state: { webService: WebServiceState }) => state.webService.portAvailable;
export const selectPortStatusChecked = (state: { webService: WebServiceState }) => state.webService.portStatusChecked;
export const selectWebServiceHost = (state: { webService: WebServiceState }) => state.webService.host;
export const selectWebServicePort = (state: { webService: WebServiceState }) => state.webService.port;
export const selectStartupFailure = (state: { webService: WebServiceState }) => state.webService.startupFailure;
export const selectShowStartupFailureDialog = (state: { webService: WebServiceState }) => state.webService.showStartupFailureDialog;
export const selectShowStartConfirm = (state: { webService: WebServiceState }) => state.webService.showStartConfirm;
export const selectMissingDependenciesList = (state: { webService: WebServiceState }) => state.webService.missingDependenciesList;
export const selectShowDependencyWarning = (state: { webService: WebServiceState }) => state.webService.showDependencyWarning;
export const selectPackageInfo = (state: { webService: WebServiceState }) => state.webService.packageInfo;
export const selectInstallProgress = (state: { webService: WebServiceState }) => state.webService.installProgress;
export const selectIsInstalling = (state: { webService: WebServiceState }) => state.webService.isInstalling;
export const selectAvailableVersions = (state: { webService: WebServiceState }) => state.webService.availableVersions;
export const selectPlatform = (state: { webService: WebServiceState }) => state.webService.platform;

// Version management selectors
export const selectActiveVersion = (state: { webService: WebServiceState }) => state.webService.activeVersion;

// Install confirmation dialog selectors
export const selectShowInstallConfirm = (state: { webService: WebServiceState }) => state.webService.showInstallConfirm;
export const selectPendingInstallVersion = (state: { webService: WebServiceState }) => state.webService.pendingInstallVersion;

// Install state selectors for loading feedback
export const selectInstallState = (state: { webService: WebServiceState }) => state.webService.installState;
export const selectIsInstallingFromState = (state: { webService: WebServiceState }) =>
  state.webService.installState === InstallState.Installing ||
  state.webService.installState === InstallState.StoppingService;
export const selectCanInstall = (state: { webService: WebServiceState }) =>
  state.webService.installState === InstallState.Idle ||
  state.webService.installState === InstallState.Completed ||
  state.webService.installState === InstallState.Error;

// Composite selectors
export const selectWebServiceInfo = (state: { webService: WebServiceState }) => ({
  status: state.webService.status,
  pid: state.webService.pid,
  url: state.webService.url,
  version: state.webService.version,
  uptime: state.webService.uptime,
  startTime: state.webService.startTime,
  restartCount: state.webService.restartCount,
  isOperating: state.webService.isOperating,
  lastError: state.webService.lastError,
  host: state.webService.host,
  port: state.webService.port,
  recoverySource: state.webService.recoverySource,
  recoveryMessage: state.webService.recoveryMessage,
});

export const selectPackageManagementInfo = (state: { webService: WebServiceState }) => ({
  packageInfo: state.webService.packageInfo,
  installProgress: state.webService.installProgress,
  isInstalling: state.webService.isInstalling,
  availableVersions: state.webService.availableVersions,
  platform: state.webService.platform,
});

// Version management composite selectors
export const selectCanLaunchService = (state: { webService: WebServiceState }) => {
  const version = state.webService.activeVersion;
  // Allow launch if there's any active version
  return !!version;
};

export const selectLaunchBlockingReason = (state: { webService: WebServiceState }) => {
  const version = state.webService.activeVersion;
  if (!version) return 'no-version';
  // In relaxed mode, version-not-ready is not a blocking reason anymore
  // It will trigger a confirmation dialog instead
  return null;
};

// Export reducer
export default webServiceSlice.reducer;
