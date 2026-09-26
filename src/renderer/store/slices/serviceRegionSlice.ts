import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ServiceRegionState } from '../../../types/service-region.js';

export interface ServiceRegionRendererState extends ServiceRegionState {
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

const initialState: ServiceRegionRendererState = {
  region: 'CN',
  isExplicit: false,
  isLoading: true,
  isSaving: false,
  error: null,
};

const serviceRegionSlice = createSlice({
  name: 'serviceRegion',
  initialState,
  reducers: {
    setServiceRegionState: (state, action: PayloadAction<ServiceRegionState>) => {
      state.region = action.payload.region;
      state.isExplicit = action.payload.isExplicit;
      state.isLoading = false;
      state.isSaving = false;
      state.error = null;
    },
    setServiceRegionLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setServiceRegionSaving: (state, action: PayloadAction<boolean>) => {
      state.isSaving = action.payload;
    },
    setServiceRegionError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setServiceRegionState,
  setServiceRegionLoading,
  setServiceRegionSaving,
  setServiceRegionError,
} = serviceRegionSlice.actions;

export const selectServiceRegion = (state: { serviceRegion: ServiceRegionRendererState }) => state.serviceRegion.region;
export const selectServiceRegionLoading = (state: { serviceRegion: ServiceRegionRendererState }) => state.serviceRegion.isLoading;
export const selectServiceRegionSaving = (state: { serviceRegion: ServiceRegionRendererState }) => state.serviceRegion.isSaving;
export const selectServiceRegionError = (state: { serviceRegion: ServiceRegionRendererState }) => state.serviceRegion.error;

export default serviceRegionSlice.reducer;
