import { createAsyncThunk } from '@reduxjs/toolkit';
import { toast } from 'sonner';
import {
  setLicense,
  setLoading,
  setError,
  clearErrors,
} from '../slices/licenseSlice';
import type { LicenseData } from '../../../types/license';

/**
 * Fetch current license
 * Replaces licenseSaga/fetchLicense
 */
export const fetchLicense = createAsyncThunk(
  'license/fetch',
  async (_, { dispatch }) => {
    try {
      dispatch(setLoading(true));
      dispatch(clearErrors());

      const license: LicenseData | null = await window.electronAPI.license.get();

      dispatch(setLicense(license));
      return license;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch license';
      dispatch(setError(errorMessage));
      throw error;
    } finally {
      dispatch(setLoading(false));
    }
  }
);

/**
 * Save license
 * Replaces licenseSaga/saveLicense
 */
export const saveLicense = createAsyncThunk(
  'license/save',
  async (licenseKey: string, { dispatch }) => {
    try {
      dispatch(setLoading(true));
      dispatch(clearErrors());

      const result: { success: boolean; error?: string } = await window.electronAPI.license.save(licenseKey);

      if (result.success) {
        // Reload the license
        await dispatch(fetchLicense());

        // Show success message
        toast.success('许可证已更新', {
          description: 'License updated successfully',
        });

        return true;
      } else {
        dispatch(setError(result.error || 'Failed to save license'));

        toast.error('许可证更新失败', {
          description: result.error || 'Failed to save license',
        });

        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save license';
      dispatch(setError(errorMessage));

      toast.error('许可证更新失败', {
        description: errorMessage,
      });

      throw error;
    } finally {
      dispatch(setLoading(false));
    }
  }
);

/**
 * Initialize license on app startup
 * This should be dispatched when the app starts
 */
export const initializeLicense = fetchLicense;
