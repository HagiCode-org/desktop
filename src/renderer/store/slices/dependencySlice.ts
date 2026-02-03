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
 * Dependency state
 */
export interface DependencyState {
  dependencies: DependencyItem[];
  loading: boolean;
  installing: boolean;
  installingType: DependencyType | null;
  error: string | null;
}

const initialState: DependencyState = {
  dependencies: [],
  loading: false,
  installing: false,
  installingType: null,
  error: null,
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
  },
});

export const {
  fetchDependenciesStart,
  fetchDependenciesSuccess,
  fetchDependenciesFailure,
  installDependencyStart,
  installDependencySuccess,
  installDependencyFailure,
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

export default dependencySlice.reducer;
