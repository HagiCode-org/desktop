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
} from '../slices/packageSourceSlice';
import type { Version } from '../../../main/version-manager';
import type { StoredPackageSourceConfig } from '../../../main/package-source-config-manager';

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
      const errorMessage = error instanceof Error ? error.message : 'Failed to load package source configuration';
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to load package source configurations';
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
        // Reload the current configuration
        await dispatch(loadSourceConfig());

        // Clear available versions
        dispatch(setAvailableVersions([]));

        // Show success message
        toast.success('包源配置已保存', {
          description: 'Package source configuration saved successfully',
        });

        return true;
      } else {
        dispatch(setError(result.error || 'Failed to set package source configuration'));

        toast.error('配置保存失败', {
          description: result.error || 'Failed to save package source configuration',
        });

        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set package source configuration';
      dispatch(setError(errorMessage));

      toast.error('配置保存失败', {
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
        // Reload the current configuration
        await dispatch(loadSourceConfig());

        // Clear available versions when switching sources
        dispatch(setAvailableVersions([]));

        // Show success message
        toast.success('已切换包源', {
          description: 'Package source switched successfully',
        });

        return true;
      } else {
        dispatch(setError(result.error || 'Failed to switch package source'));

        toast.error('切换失败', {
          description: result.error || 'Failed to switch package source',
        });

        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch package source';
      dispatch(setError(errorMessage));

      toast.error('切换失败', {
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
        dispatch(setValidationError(result.error || 'Invalid configuration'));
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to validate configuration';
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
        toast.success('文件夹扫描完成', {
          description: `Found ${result.count || result.versions.length} versions`,
        });

        return result.versions;
      } else {
        dispatch(setError(result.error || 'Failed to scan folder'));

        toast.error('扫描失败', {
          description: result.error || 'Failed to scan folder for versions',
        });

        return [];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to scan folder';
      dispatch(setError(errorMessage));

      toast.error('扫描失败', {
        description: errorMessage,
      });

      throw error;
    } finally {
      dispatch(setFetchingVersions(false));
    }
  }
);

/**
 * Fetch releases from GitHub
 * Replaces packageSourceSaga/fetchGithub
 */
export const fetchGithub = createAsyncThunk(
  'packageSource/fetchGithub',
  async (params: { owner: string; repo: string; token?: string }, { dispatch }) => {
    try {
      dispatch(setFetchingVersions(true));
      dispatch(clearErrors());

      const result: { success: boolean; versions?: Version[]; count?: number; error?: string } =
        await window.electronAPI.packageSource.fetchGithub(params);

      if (result.success && result.versions) {
        dispatch(setScanResult({
          versions: result.versions,
          count: result.count || result.versions.length,
        }));

        // Show success message
        toast.success('GitHub 版本获取完成', {
          description: `Found ${result.count || result.versions.length} versions`,
        });

        return result.versions;
      } else {
        dispatch(setError(result.error || 'Failed to fetch GitHub releases'));

        toast.error('获取失败', {
          description: result.error || 'Failed to fetch releases from GitHub',
        });

        return [];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch GitHub releases';
      dispatch(setError(errorMessage));

      toast.error('获取失败', {
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
        toast.success('HTTP 索引版本获取完成', {
          description: `Found ${result.count || result.versions.length} versions`,
        });

        return result.versions;
      } else {
        dispatch(setError(result.error || 'Failed to fetch HTTP index'));

        toast.error('获取失败', {
          description: result.error || 'Failed to fetch versions from HTTP index',
        });

        return [];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch HTTP index';
      dispatch(setError(errorMessage));

      toast.error('获取失败', {
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
        toast.success('渠道已设置', {
          description: `Channel preference set to: ${channel}`,
        });
        return true;
      } else {
        toast.error('设置失败', {
          description: result.error || 'Failed to set channel preference',
        });
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set channel';
      toast.error('设置失败', {
        description: errorMessage,
      });
      return false;
    }
  }
);
