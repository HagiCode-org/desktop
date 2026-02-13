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
  checkCommand?: string; // New: command to verify installation
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

  // Install progress (used by Onboarding flow)
  installProgress: InstallProgress;
}

const initialState: DependencyState = {
  dependencies: [],
  loading: false,
  installing: false,
  installingType: null,
  error: null,
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
    // Install progress actions
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

// Selector for install progress
export const selectInstallProgress = (state: { dependency: DependencyState }) =>
  state.dependency.installProgress;

export default dependencySlice.reducer;
