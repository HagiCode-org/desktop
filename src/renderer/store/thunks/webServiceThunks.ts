import { createAsyncThunk } from '@reduxjs/toolkit';
import { toast } from 'sonner';
import {
  setStatus,
  setOperating,
  setError,
  setProcessInfo,
  setVersion,
  setPackageInfo,
  setInstallProgress,
  setAvailableVersions,
  setPlatform,
  setPort,
  setActiveVersion,
  setUrl,
  setPid,
  showInstallConfirm,
  hideInstallConfirm,
  showStartConfirmDialog,
  hideStartConfirmDialog,
  setShowDependencyWarning,
  setInstallState,
  InstallState,
  type ProcessInfo,
  type PackageInfo,
  type InstallProgress,
  type DependencyItem,
  type InstalledVersion,
} from '../slices/webServiceSlice';
import type { ProcessStatus } from '../slices/webServiceSlice';

// Types for window electronAPI
declare global {
  interface Window {
    electronAPI: {
      // Web Service Management APIs
      getWebServiceStatus: () => Promise<ProcessInfo>;
      startWebService: (force?: boolean) => Promise<{ success: boolean; error?: { type: string; details: string }; warning?: { type: string; missing: any[] } }>;
      stopWebService: () => Promise<boolean>;
      restartWebService: () => Promise<boolean>;
      getWebServiceVersion: () => Promise<string>;
      getWebServiceUrl: () => Promise<string | null>;
      setWebServiceConfig: (config: { port?: number; host?: string }) => Promise<{ success: boolean; error: string | null }>;
      onWebServiceStatusChange: (callback: (status: ProcessInfo) => void) => (() => void) | void;

      // Package Management APIs
      checkPackageInstallation: () => Promise<PackageInfo>;
      installWebServicePackage: (version: string) => Promise<boolean>;
      getPackageVersion: () => Promise<string>;
      getAvailableVersions: () => Promise<string[]>;
      getPlatform: () => Promise<string>;
      onPackageInstallProgress: (callback: (progress: InstallProgress) => void) => (() => void) | void;

      // Version Management APIs
      versionGetActive: () => Promise<any>;
      onActiveVersionChanged: (callback: (version: any) => void) => (() => void) | void;
      onVersionDependencyWarning: (callback: (warning: { missing: any[] }) => void) => (() => void) | void;
    };
  }
}

/**
 * Start web service
 * Replaces webServiceSaga/startWebServiceSaga
 */
export const startWebService = createAsyncThunk(
  'webService/start',
  async (_, { dispatch }) => {
    try {
      dispatch(setOperating(true));
      dispatch(setStatus('starting'));
      dispatch(setError(null));

      const result: { success: boolean; error?: { type: string; details: string } } =
        await window.electronAPI.startWebService();

      if (result.success) {
        dispatch(setStatus('running'));
        // Fetch updated status
        await dispatch(fetchWebServiceStatus());
      } else {
        // Set error based on error type
        if (result.error) {
          switch (result.error.type) {
            case 'no-active-version':
              dispatch(setError('No active version found. Please install and activate a version first.'));
              break;
            case 'version-not-ready':
              dispatch(setError('Active version is not ready. Dependencies may be missing.'));
              break;
            default:
              dispatch(setError(result.error.details || 'Failed to start web service'));
          }
        } else {
          dispatch(setError('Failed to start web service'));
        }
        dispatch(setStatus('error'));
      }

      return result.success;
    } catch (error) {
      console.error('Start web service error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setError(errorMessage));
      dispatch(setStatus('error'));
      throw error;
    } finally {
      dispatch(setOperating(false));
    }
  }
);

/**
 * Confirm start with warning (user chose to start despite missing dependencies)
 * Replaces webServiceSaga/confirmStartWithWarningSaga
 */
export const confirmStartWithWarning = createAsyncThunk(
  'webService/confirmStartWithWarning',
  async (_, { dispatch }) => {
    try {
      dispatch(setOperating(true));
      dispatch(setError(null));
      dispatch(hideStartConfirmDialog());

      // Call startWebService with force=true
      const result: { success: boolean; error?: { type: string; details: string } } =
        await window.electronAPI.startWebService(true);

      if (result.success) {
        dispatch(setStatus('running'));
        dispatch(setShowDependencyWarning(true));
        // Fetch updated status
        await dispatch(fetchWebServiceStatus());
      } else {
        // Set error based on error type
        if (result.error) {
          dispatch(setError(result.error.details || 'Failed to start web service'));
        } else {
          dispatch(setError('Failed to start web service'));
        }
        dispatch(setStatus('error'));
      }

      return result.success;
    } catch (error) {
      console.error('Confirm start with warning error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setError(errorMessage));
      dispatch(setStatus('error'));
      throw error;
    } finally {
      dispatch(setOperating(false));
    }
  }
);

/**
 * Stop web service
 * Replaces webServiceSaga/stopWebServiceSaga
 */
export const stopWebService = createAsyncThunk(
  'webService/stop',
  async (_, { dispatch }) => {
    try {
      dispatch(setOperating(true));
      dispatch(setStatus('stopping'));
      dispatch(setError(null));

      const success: boolean = await window.electronAPI.stopWebService();

      if (success) {
        dispatch(setStatus('stopped'));
        dispatch(setUrl(null));
        dispatch(setPid(null));
      } else {
        dispatch(setError('Failed to stop web service'));
        dispatch(setStatus('error'));
      }

      return success;
    } catch (error) {
      console.error('Stop web service error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setError(errorMessage));
      dispatch(setStatus('error'));
      throw error;
    } finally {
      dispatch(setOperating(false));
    }
  }
);

/**
 * Restart web service
 * Replaces webServiceSaga/restartWebServiceSaga
 */
export const restartWebService = createAsyncThunk(
  'webService/restart',
  async (_, { dispatch }) => {
    try {
      dispatch(setOperating(true));
      dispatch(setStatus('stopping'));
      dispatch(setError(null));

      const success: boolean = await window.electronAPI.restartWebService();

      if (success) {
        dispatch(setStatus('running'));
        // Fetch updated status
        await dispatch(fetchWebServiceStatus());
      } else {
        dispatch(setError('Failed to restart web service'));
        dispatch(setStatus('error'));
      }

      return success;
    } catch (error) {
      console.error('Restart web service error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setError(errorMessage));
      dispatch(setStatus('error'));
      throw error;
    } finally {
      dispatch(setOperating(false));
    }
  }
);

/**
 * Fetch web service status
 * Replaces webServiceSaga/fetchWebServiceStatusSaga
 */
export const fetchWebServiceStatus = createAsyncThunk(
  'webService/fetchStatus',
  async (_, { dispatch }) => {
    try {
      const status: ProcessInfo = await window.electronAPI.getWebServiceStatus();
      dispatch(setProcessInfo(status));
      dispatch(setError(null));
      return status;
    } catch (error) {
      console.error('Fetch web service status error:', error);
      // Don't set error status on polling failure, just log it
      throw error;
    }
  }
);

/**
 * Fetch web service version
 * Replaces webServiceSaga/fetchWebServiceVersionSaga
 */
export const fetchWebServiceVersion = createAsyncThunk(
  'webService/fetchVersion',
  async (_, { dispatch }) => {
    try {
      const version: string = await window.electronAPI.getWebServiceVersion();
      dispatch(setVersion(version));
      return version;
    } catch (error) {
      console.error('Fetch web service version error:', error);
      dispatch(setVersion('unknown'));
      return 'unknown';
    }
  }
);

/**
 * Check package installation
 * Replaces webServiceSaga/checkPackageInstallationSaga
 */
export const checkPackageInstallation = createAsyncThunk(
  'webService/checkPackageInstallation',
  async (_, { dispatch }) => {
    try {
      const packageInfo: PackageInfo = await window.electronAPI.checkPackageInstallation();
      dispatch(setPackageInfo(packageInfo));
      return packageInfo;
    } catch (error) {
      console.error('Check package installation error:', error);
      throw error;
    }
  }
);

/**
 * Install web service package
 * Replaces webServiceSaga/installWebServicePackageSaga
 */
export const installWebServicePackage = createAsyncThunk(
  'webService/installPackage',
  async (version: string, { dispatch, getState }) => {
    try {
      // Check service status before installing
      const state = getState() as { webService: { status: ProcessStatus } };
      const currentStatus = state.webService.status;

      // If service is running, show confirmation dialog
      if (currentStatus === 'running') {
        dispatch(setInstallState(InstallState.Confirming));
        dispatch(showInstallConfirm(version));
        return { confirmed: false };
      }

      // Service is not running, proceed with installation
      dispatch(setInstallState(InstallState.Installing));
      return await doInstallPackage(version, dispatch);
    } catch (error) {
      console.error('Install package error:', error);
      dispatch(setInstallProgress({ stage: 'error', progress: 0, message: 'Installation failed' }));
      dispatch(setError(error instanceof Error ? error.message : 'Unknown error occurred'));
      dispatch(setInstallState(InstallState.Error));
      throw error;
    }
  }
);

/**
 * Confirm install and stop service
 * Replaces webServiceSaga/confirmInstallAndStopSaga
 */
export const confirmInstallAndStop = createAsyncThunk(
  'webService/confirmInstallAndStop',
  async (_, { dispatch, getState }) => {
    try {
      const state = getState() as { webService: { pendingInstallVersion: string | null } };
      const pendingVersion = state.webService.pendingInstallVersion;

      if (!pendingVersion) {
        dispatch(hideInstallConfirm());
        dispatch(setInstallState(InstallState.Idle));
        return { success: false };
      }

      // Transition to StoppingService state
      dispatch(setInstallState(InstallState.StoppingService));

      // Stop the service
      const stopResult = await dispatch(stopWebService());

      // Wait a bit for service to stop
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if service stopped successfully
      const stateAfterStop = getState() as { webService: { status: ProcessStatus } };

      if (stateAfterStop.webService.status === 'error') {
        // Failed to stop service
        dispatch(setError('Failed to stop service. Installation cancelled.'));
        dispatch(hideInstallConfirm());
        dispatch(setInstallState(InstallState.Error));
        return { success: false };
      }

      // Service stopped successfully, proceed with installation
      dispatch(setInstallState(InstallState.Installing));
      const result = await doInstallPackage(pendingVersion, dispatch);

      // Hide confirmation dialog after installation completes
      dispatch(hideInstallConfirm());

      return result;
    } catch (error) {
      console.error('Confirm install and stop error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setError(errorMessage));
      dispatch(hideInstallConfirm());
      dispatch(setInstallState(InstallState.Error));
      throw error;
    }
  }
);

/**
 * Helper function: Execute installation
 */
async function doInstallPackage(version: string, dispatch: any) {
  dispatch(setInstallProgress({ stage: 'verifying', progress: 0, message: 'Starting installation...' }));
  dispatch(setError(null));

  const success: boolean = await window.electronAPI.installWebServicePackage(version);

  if (success) {
    dispatch(setInstallState(InstallState.Completed));
    dispatch(setInstallProgress({ stage: 'completed', progress: 100, message: 'Installation completed successfully' }));
    // Refresh package info
    await dispatch(checkPackageInstallation());
    // Refresh version
    await dispatch(fetchWebServiceVersion());
    // Refresh active version
    await dispatch(fetchActiveVersion());

    // Show success toast
    toast.success('安装成功', {
      description: '版本已成功安装，请手动启动服务。'
    });

    // Check dependencies after installation
    await dispatch(checkDependenciesAfterInstall({ versionId: version }));

    // Reset to idle state after 3 seconds
    setTimeout(() => {
      dispatch(setInstallState(InstallState.Idle));
    }, 3000);

    return { success: true };
  } else {
    dispatch(setInstallState(InstallState.Error));
    dispatch(setInstallProgress({ stage: 'error', progress: 0, message: 'Installation failed' }));
    dispatch(setError('Failed to install package'));

    // Show error toast
    toast.error('安装失败', {
      description: '安装过程中出现错误，请重试。'
    });

    // Reset to idle state immediately after error
    dispatch(setInstallState(InstallState.Idle));

    return { success: false };
  }
}

/**
 * Fetch available versions
 * Replaces webServiceSaga/fetchAvailableVersionsSaga
 */
export const fetchAvailableVersions = createAsyncThunk(
  'webService/fetchAvailableVersions',
  async (_, { dispatch }) => {
    try {
      const versions: string[] = await window.electronAPI.getAvailableVersions();
      dispatch(setAvailableVersions(versions));
      return versions;
    } catch (error) {
      console.error('Fetch available versions error:', error);
      throw error;
    }
  }
);

/**
 * Fetch platform
 * Replaces webServiceSaga/fetchPlatformSaga
 */
export const fetchPlatform = createAsyncThunk(
  'webService/fetchPlatform',
  async (_, { dispatch }) => {
    try {
      const platform: string = await window.electronAPI.getPlatform();
      dispatch(setPlatform(platform));
      return platform;
    } catch (error) {
      console.error('Fetch platform error:', error);
      throw error;
    }
  }
);

/**
 * Update web service port
 * Replaces webServiceSaga/updateWebServicePortSaga
 */
export const updateWebServicePort = createAsyncThunk(
  'webService/updatePort',
  async (port: number, { dispatch }) => {
    try {
      // Validate port range
      if (port < 1024 || port > 65535) {
        dispatch(setError('Port must be between 1024 and 65535'));
        return { success: false };
      }

      // Call main process to update config
      const result: { success: boolean; error: string | null } = await window.electronAPI.setWebServiceConfig({ port });

      if (result.success) {
        // Update local state
        dispatch(setPort(port));
        dispatch(setError(null));
        return { success: true };
      } else {
        dispatch(setError(result.error || 'Failed to update port'));
        return { success: false };
      }
    } catch (error) {
      console.error('Update port error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update port';
      dispatch(setError(errorMessage));
      return { success: false };
    }
  }
);

/**
 * Fetch active version
 * Replaces webServiceSaga/fetchActiveVersionSaga
 */
export const fetchActiveVersion = createAsyncThunk(
  'webService/fetchActiveVersion',
  async (_, { dispatch }) => {
    try {
      const activeVersion: InstalledVersion | null = await window.electronAPI.versionGetActive();
      dispatch(setActiveVersion(activeVersion));
      return activeVersion;
    } catch (error) {
      console.error('Fetch active version error:', error);
      // Don't set error on active version fetch failure
      return null;
    }
  }
);

/**
 * Check dependencies after installation
 * Helper thunk to check dependencies after package installation
 */
export const checkDependenciesAfterInstall = createAsyncThunk(
  'webService/checkDependenciesAfterInstall',
  async (params: { versionId: string }, { dispatch }) => {
    try {
      // This will trigger the dependency saga to check for missing dependencies
      // We dispatch an action that the listener middleware can pick up
      dispatch({ type: 'dependency/checkAfterInstall', payload: { versionId: params.versionId } });
    } catch (error) {
      console.error('Failed to check dependencies after install:', error);
    }
  }
);

/**
 * Initialize web service on app startup
 * Replaces webServiceSaga/initializeWebServiceSaga
 */
export const initializeWebService = createAsyncThunk(
  'webService/initialize',
  async (_, { dispatch }) => {
    // Set initial state
    dispatch(setProcessInfo({
      status: 'stopped',
      pid: null,
      uptime: 0,
      startTime: null,
      url: null,
      restartCount: 0,
      phase: 'idle' as any,
      port: 36556,
    }));
    dispatch(setPlatform('linux-x64'));
    dispatch(setAvailableVersions([]));
    dispatch(setPackageInfo({
      version: 'none',
      platform: 'linux-x64',
      installedPath: '',
      isInstalled: false,
    }));
    dispatch(setVersion('unknown'));

    // Try to fetch initial data
    try {
      const platform: string = await window.electronAPI.getPlatform();
      dispatch(setPlatform(platform));
    } catch (e) {
      console.log('Platform not available yet');
    }

    // Fetch active version on initialization
    try {
      const activeVersion: InstalledVersion | null = await window.electronAPI.versionGetActive();
      dispatch(setActiveVersion(activeVersion));
    } catch (e) {
      console.log('Active version not available yet');
    }
  }
);
