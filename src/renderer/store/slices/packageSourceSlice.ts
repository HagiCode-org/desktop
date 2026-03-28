import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Version } from '../../../main/version-manager';
import type { StoredPackageSourceConfig } from '../../../main/package-source-config-manager';

export interface PackageSourceState {
  currentConfig: StoredPackageSourceConfig | null;
  allConfigs: StoredPackageSourceConfig[];
  availableVersions: Version[];
  loading: boolean;
  validating: boolean;
  fetchingVersions: boolean;
  error: string | null;
  validationError: string | null;
  selectedSourceType: 'local-folder' | 'http-index';
  folderPath: string;
  httpIndexUrl: string;
  scanResult: {
    versions: Version[];
    count: number;
  } | null;
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
  httpIndexUrl: 'https://index.hagicode.com/server/index.json',
  scanResult: null,
  selectedChannel: null,
};

const packageSourceSlice = createSlice({
  name: 'packageSource',
  initialState,
  reducers: {
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
      state.allConfigs = state.allConfigs.filter(config => config.id !== action.payload);
    },
    setAvailableVersions: (state, action: PayloadAction<Version[]>) => {
      state.availableVersions = action.payload;
    },
    clearAvailableVersions: (state) => {
      state.availableVersions = [];
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setValidating: (state, action: PayloadAction<boolean>) => {
      state.validating = action.payload;
    },
    setFetchingVersions: (state, action: PayloadAction<boolean>) => {
      state.fetchingVersions = action.payload;
    },
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
    setSelectedSourceType: (state, action: PayloadAction<'local-folder' | 'http-index'>) => {
      state.selectedSourceType = action.payload;
      state.validationError = null;
      state.scanResult = null;
    },
    setFolderPath: (state, action: PayloadAction<string>) => {
      state.folderPath = action.payload;
    },
    setHttpIndexUrl: (state, action: PayloadAction<string>) => {
      state.httpIndexUrl = action.payload;
    },
    setScanResult: (state, action: PayloadAction<{ versions: Version[]; count: number } | null>) => {
      state.scanResult = action.payload;
    },
    setSelectedChannel: (state, action: PayloadAction<string | null>) => {
      state.selectedChannel = action.payload;
    },
    resetForm: (state) => {
      state.folderPath = '';
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
  setHttpIndexUrl,
  setScanResult,
  setSelectedChannel,
  resetForm,
} = packageSourceSlice.actions;

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

export const selectScanResult = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.scanResult;

export const selectHttpIndexUrl = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.httpIndexUrl;

export const selectSelectedChannel = (state: { packageSource: PackageSourceState }) =>
  state.packageSource.selectedChannel;

export default packageSourceSlice.reducer;
