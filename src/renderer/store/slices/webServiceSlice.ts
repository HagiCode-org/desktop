import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ProcessStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping';

export enum StartupPhase {
  Idle = 'idle',
  CheckingPort = 'checking_port',
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
  port: number;
}

export interface PackageInfo {
  version: string;
  platform: string;
  installedPath: string;
  isInstalled: boolean;
}

export interface InstallProgress {
  stage: 'downloading' | 'extracting' | 'verifying' | 'completed' | 'error';
  progress: number;
  message: string;
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
  port: number;

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
  port: 36556,

  phase: StartupPhase.Idle,
  phaseMessage: null,

  portAvailable: true,
  portStatusChecked: false,

  packageInfo: null,
  installProgress: null,
  isInstalling: false,
  availableVersions: [],
  platform: null,
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
      state.port = action.payload.port;
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
  setProcessInfo,
  setPortAvailable,
  setStartupPhase,
  setPackageInfo,
  setInstallProgress,
  setIsInstalling,
  setAvailableVersions,
  setPlatform,
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
export const selectWebServicePort = (state: { webService: WebServiceState }) => state.webService.port;
export const selectPackageInfo = (state: { webService: WebServiceState }) => state.webService.packageInfo;
export const selectInstallProgress = (state: { webService: WebServiceState }) => state.webService.installProgress;
export const selectIsInstalling = (state: { webService: WebServiceState }) => state.webService.isInstalling;
export const selectAvailableVersions = (state: { webService: WebServiceState }) => state.webService.availableVersions;
export const selectPlatform = (state: { webService: WebServiceState }) => state.webService.platform;

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
  port: state.webService.port,
});

export const selectPackageManagementInfo = (state: { webService: WebServiceState }) => ({
  packageInfo: state.webService.packageInfo,
  installProgress: state.webService.installProgress,
  isInstalling: state.webService.isInstalling,
  availableVersions: state.webService.availableVersions,
  platform: state.webService.platform,
});

// Export reducer
export default webServiceSlice.reducer;
