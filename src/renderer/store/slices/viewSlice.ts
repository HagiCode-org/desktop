import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ManagedNpmPackageId, VendoredRuntimeId } from '../../../types/dependency-management.js';

export type ViewType = 'system' | 'web' | 'version' | 'diagnostic' | 'dependency-management' | 'settings';

export interface DependencyManagementRepairIntent {
  sourceView: ViewType;
  returnView: ViewType;
  failureKind: string;
  targetRuntimeIds: VendoredRuntimeId[];
  targetPackageIds: ManagedNpmPackageId[];
}

export interface ViewState {
  currentView: ViewType;
  isViewSwitching: boolean;
  webServiceUrl: string | null;
  previousView: ViewType | null;
  dependencyManagementIntent: DependencyManagementRepairIntent | null;
}

const initialState: ViewState = {
  currentView: 'system',
  isViewSwitching: false,
  webServiceUrl: null,
  previousView: null,
  dependencyManagementIntent: null,
};

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    switchView: (state, action: PayloadAction<ViewType>) => {
      // Store current view as previous before switching
      if (state.currentView !== action.payload) {
        if (state.currentView === 'dependency-management' && action.payload !== 'dependency-management') {
          state.dependencyManagementIntent = null;
        }
        state.previousView = state.currentView;
        state.currentView = action.payload;
      }
    },
    setDependencyManagementIntent: (state, action: PayloadAction<DependencyManagementRepairIntent | null>) => {
      state.dependencyManagementIntent = action.payload;
    },
    updateWebServiceUrl: (state, action: PayloadAction<string>) => {
      state.webServiceUrl = action.payload;
    },
    setViewSwitching: (state, action: PayloadAction<boolean>) => {
      state.isViewSwitching = action.payload;
    },
    resetView: (state) => {
      state.currentView = 'system';
      state.previousView = null;
      state.isViewSwitching = false;
      state.webServiceUrl = null;
      state.dependencyManagementIntent = null;
    },
  },
});

export const {
  switchView,
  setDependencyManagementIntent,
  updateWebServiceUrl,
  setViewSwitching,
  resetView,
} = viewSlice.actions;
export default viewSlice.reducer;
