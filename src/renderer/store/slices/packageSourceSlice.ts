import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Version } from '../../../main/version-manager';
import type { PackageSourceConfig, StoredPackageSourceConfig } from '../../../main/package-source-config-manager';

/**
 * Package source state
 */
export interface PackageSourceState {
  // Current configuration
  currentConfig: StoredPackageSourceConfig | null;
  allConfigs: StoredPackageSourceConfig[];

  // Available versions from current source
  availableVersions: Version[];

  // Loading states
  loading: boolean;
  validating: boolean;
  fetchingVersions: boolean;

  // Error states
  error: string | null;
  validationError: string | null;

  // Source type selection
  selectedSourceType: 'local-folder' | 'github-release' | 'http-index';

  // Form states
  folderPath: string;
  githubOwner: string;
  githubRepo: string;
  githubToken: string;
  httpIndexUrl: string;

  // Scan/Fetch results
  scanResult: {
    versions: Version[];
    count: number;
  } | null;

  // Channel selection
  selectedChannel: string | null;
}

const initialState: PackageSourceState = {
  currentConfig: null,
  allConfigs: [],
  availableVersions: [],
  loading: false,
  validating: false,
  fetchingVersions: false,
  error: null,
  validationError: null,
  selectedSourceType: 'http-index',
  folderPath: process.env.NODE_ENV === 'development'
    ? '/home/newbe36524/repos/newbe36524/hagicode-mono/repos/hagibuild/Release/release-packages'
    : '',
  githubOwner: 'HagiCode-org',
  githubRepo: 'releases',
  githubToken: '',
  httpIndexUrl: 'https://server.dl.hagicode.com/index.json',
  scanResult: null,
  selectedChannel: null,
};

const packageSourceSlice = createSlice({
  name: 'packageSource',
  initialState,
  reducers: {
    // Configuration management
    setCurrentConfig: (state, action: PayloadAction<StoredPackageSourceConfig | null>) => {
      state.currentConfig = action.payload;
    },
    setAllConfigs: (state, action: PayloadAction<StoredPackageSourceConfig[]>) => {
      state.allConfigs = action.payload;
    },
    addConfig: (state, action: PayloadAction<StoredPackageSourceConfig>) => {
      state.allConfigs.push(action.payload);
    },
    removeConfig: (state, action: PayloadAction<string>) => {
      state.allConfigs = state.allConfigs.filter(c => c.id !== action.payload);
    },

    // Available versions
    setAvailableVersions: (state, action: PayloadAction<Version[]>) => {
      state.availableVersions = action.payload;
    },
    clearAvailableVersions: (state) => {
      state.availableVersions = [];
    },

    // Loading states
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setValidating: (state, action: PayloadAction<boolean>) => {
      state.validating = action.payload;
    },
    setFetchingVersions: (state, action: PayloadAction<boolean>) => {
      state.fetchingVersions = action.payload;
    },

    // Error states
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setValidationError: (state, action: PayloadAction<string | null>) => {
      state.validationError = action.payload;
    },
    clearErrors: (state) => {
      state.error = null;
      state.validationError = null;
    },

    // Source type selection
    setSelectedSourceType: (state, action: PayloadAction<'local-folder' | 'github-release' | 'http-index'>) => {
      state.selectedSourceType = action.payload;
      // Clear errors when switching source type
      state.validationError = null;
      state.scanResult = null;
    },

    // Form states
    setFolderPath: (state, action: PayloadAction<string>) => {
      state.folderPath = action.payload;
    },
    setGithubOwner: (state, action: PayloadAction<string>) => {
      state.githubOwner = action.payload;
    },
    setGithubRepo: (state, action: PayloadAction<string>) => {
      state.githubRepo = action.payload;
    },
    setGithubToken: (state, action: PayloadAction<string>) => {
      state.githubToken = action.payload;
    },
    setHttpIndexUrl: (state, action: PayloadAction<string>) => {
      state.httpIndexUrl = action.payload;
    },

    // Scan/Fetch results
    setScanResult: (state, action: PayloadAction<{ versions: Version[]; count: number } | null>) => {
      state.scanResult = action.payload;
    },

    // Channel selection
    setSelectedChannel: (state, action: PayloadAction<string | null>) => {
      state.selectedChannel = action.payload;
    },

    // Reset form
    resetForm: (state) => {
      state.folderPath = '';
      state.githubOwner = '';
      state.githubRepo = '';
      state.githubToken = '';
      state.httpIndexUrl = '';
      state.validationError = null;
      state.scanResult = null;
    },
  },
});

export const {
  setCurrentConfig,
  setAllConfigs,
  addConfig,
  removeConfig,
  setAvailableVersions,
  clearAvailableVersions,
  setLoading,
  setValidating,
  setFetchingVersions,
  setError,
  setValidationError,
  clearErrors,
  setSelectedSourceType,
  setFolderPath,
  setGithubOwner,
  setGithubRepo,
  setGithubToken,
  setHttpIndexUrl,
  setScanResult,
  setSelectedChannel,
  resetForm,
} = packageSourceSlice.actions;

// Selectors
export const selectCurrentConfig = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.currentConfig;

export const selectAllConfigs = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.allConfigs;

export const selectAvailableVersions = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.availableVersions;

export const selectPackageSourceLoading = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.loading;

export const selectPackageSourceValidating = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.validating;

export const selectPackageSourceFetchingVersions = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.fetchingVersions;

export const selectPackageSourceError = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.error;

export const selectPackageSourceValidationError = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.validationError;

export const selectSelectedSourceType = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.selectedSourceType;

export const selectFolderPath = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.folderPath;

export const selectGithubOwner = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.githubOwner;

export const selectGithubRepo = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.githubRepo;

export const selectGithubToken = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.githubToken;

export const selectScanResult = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.scanResult;

export const selectHttpIndexUrl = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.httpIndexUrl;

export const selectSelectedChannel = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.selectedChannel;

export default packageSourceSlice.reducer;
