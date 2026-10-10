import { createAsyncThunk } from '@reduxjs/toolkit';
import { toast } from 'sonner';
import {
  setCurrentConfig,
  setAllConfigs,
  setAvailableVersions,
  setLoading,
  setValidating,
  setFetchingVersions,
  setError,
  setValidationError,
  clearErrors,
  setScanResult,
  setSelectedChannel,
} from '../slices/packageSourceSlice.js';
import i18n from 'i18next';
import type { Version } from '../../../main/version-manager';
import type { StoredPackageSourceConfig } from '../../../main/package-source-config-manager';

const tPackageSource = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(`components:packageSource.${key}`, options) as string;

// Types for window electronAPI
declare global {
  interface Window {
    electronAPI: {
      version: {
        setChannel: (channel: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

/**
 * Load current package source configuration
 * Replaces packageSourceSaga/loadSourceConfig
 */
export const loadSourceConfig = createAsyncThunk(
  'packageSource/loadConfig',
  async (_, { dispatch }) => {
    try {
      dispatch(setLoading(true));

      const config: StoredPackageSourceConfig | null = await window.electronAPI.packageSource.getConfig();

      dispatch(setCurrentConfig(config));
      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tPackageSource('error.loadFailed');
      dispatch(setError(errorMessage));
      throw error;
    } finally {
      dispatch(setLoading(false));
    }
  }
);

/**
 * Load all package source configurations
 * Replaces packageSourceSaga/loadAllSourceConfigs
 */
export const loadAllSourceConfigs = createAsyncThunk(
  'packageSource/loadAllConfigs',
  async (_, { dispatch }) => {
    try {
      dispatch(setLoading(true));

      const configs: StoredPackageSourceConfig[] = await window.electronAPI.packageSource.getAllConfigs();

      dispatch(setAllConfigs(configs));
      return configs;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tPackageSource('error.loadFailed');
      dispatch(setError(errorMessage));
      throw error;
    } finally {
      dispatch(setLoading(false));
    }
  }
);

/**
 * Set a new package source configuration
 * Replaces packageSourceSaga/setSourceConfig
 */
export const setSourceConfig = createAsyncThunk(
  'packageSource/setConfig',
  async (config: { type: string; [key: string]: any }, { dispatch }) => {
    try {
      dispatch(setValidating(true));
      dispatch(clearErrors());

      const result: { success: boolean; error?: string } = await window.electronAPI.packageSource.setConfig(config);

      if (result.success) {
        await Promise.all([
          dispatch(loadSourceConfig()),
          dispatch(loadAllSourceConfigs()),
        ]);

        // Clear available versions
        dispatch(setAvailableVersions([]));
        dispatch(setValidationError(null));

        // Show success message
        toast.success(tPackageSource('saveSuccess'));

        return true;
      } else {
        const errorMessage = result.error || tPackageSource('error.saveFailed');
        dispatch(setError(errorMessage));
        dispatch(setValidationError(errorMessage));

        toast.error(tPackageSource('error.saveFailed'), {
          description: errorMessage,
        });

        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tPackageSource('error.saveFailed');
      dispatch(setError(errorMessage));
      dispatch(setValidationError(errorMessage));

      toast.error(tPackageSource('error.saveFailed'), {
        description: errorMessage,
      });

      throw error;
    } finally {
      dispatch(setValidating(false));
    }
  }
);

/**
 * Switch to an existing package source
 * Replaces packageSourceSaga/switchSource
 */
export const switchSource = createAsyncThunk(
  'packageSource/switchSource',
  async (sourceId: string, { dispatch }) => {
    try {
      dispatch(setLoading(true));
      dispatch(clearErrors());

      const result: { success: boolean; error?: string } = await window.electronAPI.packageSource.switchSource(sourceId);

      if (result.success) {
        await Promise.all([
          dispatch(loadSourceConfig()),
          dispatch(loadAllSourceConfigs()),
        ]);

        // Clear available versions when switching sources
        dispatch(setAvailableVersions([]));

        // Show success message
        toast.success(tPackageSource('switchSuccess'));

        return true;
      } else {
        dispatch(setError(result.error || tPackageSource('error.switchFailed')));

        toast.error(tPackageSource('error.switchFailed'), {
          description: result.error,
        });

        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tPackageSource('error.switchFailed');
      dispatch(setError(errorMessage));

      toast.error(tPackageSource('error.switchFailed'), {
        description: errorMessage,
      });

      throw error;
    } finally {
      dispatch(setLoading(false));
    }
  }
);

/**
 * Validate a package source configuration
 * Replaces packageSourceSaga/validateConfig
 */
export const validateConfig = createAsyncThunk(
  'packageSource/validateConfig',
  async (config: { type: string; [key: string]: any }, { dispatch }) => {
    try {
      dispatch(setValidating(true));
      dispatch(setValidationError(null));

      const result: { valid: boolean; error?: string } = await window.electronAPI.packageSource.validateConfig(config);

      if (result.valid) {
        dispatch(setValidationError(null));
      } else {
        dispatch(setValidationError(result.error || tPackageSource('error.invalidConfig')));
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tPackageSource('error.validateFailed');
      dispatch(setValidationError(errorMessage));

      return { valid: false, error: errorMessage };
    } finally {
      dispatch(setValidating(false));
    }
  }
);

/**
 * Scan folder for available versions
 * Replaces packageSourceSaga/scanFolder
 */
export const scanFolder = createAsyncThunk(
  'packageSource/scanFolder',
  async (folderPath: string, { dispatch }) => {
    try {
      dispatch(setFetchingVersions(true));
      dispatch(clearErrors());

      const result: { success: boolean; versions?: Version[]; count?: number; error?: string } =
        await window.electronAPI.packageSource.scanFolder(folderPath);

      if (result.success && result.versions) {
        dispatch(setScanResult({
          versions: result.versions,
          count: result.count || result.versions.length,
        }));

        // Show success message
        toast.success(tPackageSource('scanSuccess', { count: result.count || result.versions.length }));

        return result.versions;
      } else {
        dispatch(setError(result.error || tPackageSource('error.scanFailed')));

        toast.error(tPackageSource('error.scanFailed'), {
          description: result.error,
        });

        return [];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tPackageSource('error.scanFailed');
      dispatch(setError(errorMessage));

      toast.error(tPackageSource('error.scanFailed'), {
        description: errorMessage,
      });

      throw error;
    } finally {
      dispatch(setFetchingVersions(false));
    }
  }
);

/**
 * Fetch versions from HTTP index
 * Replaces packageSourceSaga/fetchHttpIndex
 */
export const fetchHttpIndex = createAsyncThunk(
  'packageSource/fetchHttpIndex',
  async (params: { indexUrl: string; baseUrl?: string; authToken?: string }, { dispatch }) => {
    try {
      dispatch(setFetchingVersions(true));
      dispatch(clearErrors());

      const result: { success: boolean; versions?: Version[]; count?: number; error?: string } =
        await window.electronAPI.packageSource.fetchHttpIndex(params);

      if (result.success && result.versions) {
        dispatch(setScanResult({
          versions: result.versions,
          count: result.count || result.versions.length,
        }));

        // Show success message
        toast.success(tPackageSource('fetchSuccess', { count: result.count || result.versions.length }));

        return result.versions;
      } else {
        dispatch(setError(result.error || tPackageSource('error.fetchIndexFailed')));

        toast.error(tPackageSource('error.fetchIndexFailed'), {
          description: result.error,
        });

        return [];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tPackageSource('error.fetchIndexFailed');
      dispatch(setError(errorMessage));

      toast.error(tPackageSource('error.fetchIndexFailed'), {
        description: errorMessage,
      });

      throw error;
    } finally {
      dispatch(setFetchingVersions(false));
    }
  }
);

/**
 * Initialize package source on app startup
 * Replaces packageSourceSaga/initializePackageSourceSaga
 */
export const initializePackageSource = createAsyncThunk(
  'packageSource/initialize',
  async (_, { dispatch }) => {
    await Promise.all([
      dispatch(loadSourceConfig()),
      dispatch(loadAllSourceConfigs()),
    ]);
  }
);

/**
 * Set channel preference
 */
export const setChannelPreference = createAsyncThunk(
  'packageSource/setChannel',
  async (channel: string, { dispatch }) => {
    try {
      const result: { success: boolean; error?: string } =
        await window.electronAPI.version.setChannel(channel);

      if (result.success) {
        dispatch(setSelectedChannel(channel));
        toast.success(tPackageSource('channelSetSuccess', { channel }));
        return true;
      } else {
        toast.error(tPackageSource('error.channelFailed'), {
          description: result.error,
        });
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tPackageSource('error.channelFailed');
      toast.error(tPackageSource('error.channelFailed'), {
        description: errorMessage,
      });
      return false;
    }
  }
);
