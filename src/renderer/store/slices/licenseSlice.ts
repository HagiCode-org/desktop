import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { LicenseData } from '../../../types/license';

/**
 * License state
 */
export interface LicenseState {
  license: LicenseData | null;
  loading: boolean;
  error: string | null;
}

const initialState: LicenseState = {
  license: null,
  loading: false,
  error: null,
};

const licenseSlice = createSlice({
  name: 'license',
  initialState,
  reducers: {
    setLicense: (state, action: PayloadAction<LicenseData | null>) => {
      state.license = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearErrors: (state) => {
      state.error = null;
    },
  },
});

export const {
  setLicense,
  setLoading,
  setError,
  clearErrors,
} = licenseSlice.actions;

// Selectors
export const selectLicense = (state: { license: LicenseState }) =>
  state.license.license;

export const selectLicenseLoading = (state: { license: LicenseState }) =>
  state.license.loading;

export const selectLicenseError = (state: { license: LicenseState }) =>
  state.license.error;

export const selectLicenseIsConfigured = (state: { license: LicenseState }) =>
  state.license.license?.isConfigured ?? false;

export default licenseSlice.reducer;
