import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * Dependency type enumeration
 */
export enum DependencyType {
  DotNetRuntime = 'dotnet-runtime',
  NodeJs = 'nodejs',
  JavaRuntime = 'java-runtime',
}

/**
 * Single dependency item
 */
export interface DependencyItem {
  key: string;  // Manifest dependency key (e.g., "dotnet", "claudeCode")
  name: string;
  type: DependencyType;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
  installCommand?: string;
  downloadUrl?: string;
  description?: string;
}

/**
 * Install progress information
 */
export interface InstallProgress {
  installing: boolean;
  current: number;
  total: number;
  currentDependency: string;
  status: 'pending' | 'installing' | 'success' | 'error';
  errors: Array<{ dependency: string; error: string }>;
}

/**
 * Dependency state
 */
export interface DependencyState {
  dependencies: DependencyItem[];
  loading: boolean;
  installing: boolean;
  installingType: DependencyType | null;
  error: string | null;

  // New: Install confirmation dialog state
  installConfirm: {
    show: boolean;
    dependencies: DependencyItem[];
    versionId: string;
    context?: 'version-management' | 'onboarding';  // Context identifier
  };

  // New: Install progress
  installProgress: InstallProgress;
}

const initialState: DependencyState = {
  dependencies: [],
  loading: false,
  installing: false,
  installingType: null,
  error: null,
  installConfirm: {
    show: false,
    dependencies: [],
    versionId: '',
  },
  installProgress: {
    installing: false,
    current: 0,
    total: 0,
    currentDependency: '',
    status: 'pending',
    errors: [],
  },
};

const dependencySlice = createSlice({
  name: 'dependency',
  initialState,
  reducers: {
    fetchDependenciesStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    fetchDependenciesSuccess: (state, action: PayloadAction<DependencyItem[]>) => {
      state.dependencies = action.payload;
      state.loading = false;
      state.error = null;
    },
    fetchDependenciesFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },
    installDependencyStart: (state, action: PayloadAction<DependencyType>) => {
      state.installing = true;
      state.installingType = action.payload;
      state.error = null;
    },
    installDependencySuccess: (state) => {
      state.installing = false;
      state.installingType = null;
      state.error = null;
    },
    installDependencyFailure: (state, action: PayloadAction<string>) => {
      state.installing = false;
      state.installingType = null;
      state.error = action.payload;
    },
    // New: Install confirmation dialog actions
    showInstallConfirm: (state, action: PayloadAction<{ dependencies: DependencyItem[]; versionId: string; context?: 'version-management' | 'onboarding' }>) => {
      state.installConfirm.show = true;
      state.installConfirm.dependencies = action.payload.dependencies;
      state.installConfirm.versionId = action.payload.versionId;
      state.installConfirm.context = action.payload.context || 'version-management';
    },
    hideInstallConfirm: (state) => {
      state.installConfirm.show = false;
      state.installConfirm.dependencies = [];
      state.installConfirm.versionId = '';
      state.installConfirm.context = 'version-management';
    },
    // New: Install progress actions
    startInstall: (state, action: PayloadAction<number>) => {
      state.installProgress.installing = true;
      state.installProgress.total = action.payload;
      state.installProgress.current = 0;
      state.installProgress.status = 'installing';
      state.installProgress.errors = [];
    },
    updateInstallProgress: (state, action: PayloadAction<{ current: number; dependency: string }>) => {
      state.installProgress.current = action.payload.current;
      state.installProgress.currentDependency = action.payload.dependency;
    },
    completeInstall: (state, action: PayloadAction<{ status: 'success' | 'error'; errors?: Array<{ dependency: string; error: string }> }>) => {
      state.installProgress.installing = false;
      state.installProgress.status = action.payload.status;
      if (action.payload.errors) {
        state.installProgress.errors = action.payload.errors;
      }
    },
  },
});

export const {
  fetchDependenciesStart,
  fetchDependenciesSuccess,
  fetchDependenciesFailure,
  installDependencyStart,
  installDependencySuccess,
  installDependencyFailure,
  showInstallConfirm,
  hideInstallConfirm,
  startInstall,
  updateInstallProgress,
  completeInstall,
} = dependencySlice.actions;

// Selectors
export const selectDependencies = (state: { dependency: DependencyState }) =>
  state.dependency.dependencies;

export const selectDependenciesLoading = (state: { dependency: DependencyState }) =>
  state.dependency.loading;

export const selectDependencyInstalling = (state: { dependency: DependencyState }) =>
  state.dependency.installing;

export const selectDependencyError = (state: { dependency: DependencyState }) =>
  state.dependency.error;

// New selectors for install confirmation dialog
export const selectShowInstallConfirm = (state: { dependency: DependencyState }) =>
  state.dependency.installConfirm.show;

export const selectPendingDependencies = (state: { dependency: DependencyState }) =>
  state.dependency.installConfirm.dependencies;

export const selectInstallConfirmVersionId = (state: { dependency: DependencyState }) =>
  state.dependency.installConfirm.versionId;

export const selectInstallConfirmContext = (state: { dependency: DependencyState }) =>
  state.dependency.installConfirm.context || 'version-management';

// New selectors for install progress
export const selectInstallProgress = (state: { dependency: DependencyState }) =>
  state.dependency.installProgress;

export default dependencySlice.reducer;
