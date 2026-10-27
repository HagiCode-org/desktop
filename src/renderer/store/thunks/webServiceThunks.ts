import { createAsyncThunk } from '@reduxjs/toolkit';
import { toast } from 'sonner';
import i18n from '../../i18n';
import {
  setOperatingForBatch,
  beginStartupBatch,
  advanceStartupBatch,
  setError,
  setErrorForBatch,
  setProcessInfo,
  setProcessInfoForBatch,
  setStatusForBatch,
  setStartupFailureForBatch,
  setVersion,
  setPackageInfo,
  setInstallProgress,
  setInstallingVersionId,
  setAvailableVersions,
  setPlatform,
  setPort,
  setHost,
  setActiveVersion,
  setUrl,
  showInstallConfirm,
  hideInstallConfirm,
  hideStartConfirmDialog,
  setShowDependencyWarning,
  setInstallState,
  InstallState,
  StartupPhase,
  type ProcessInfo,
  type PackageInfo,
  type InstallProgress,
  type InstalledVersion,
  type StartupFailurePayload,
} from '../slices/webServiceSlice';
import type { ProcessStatus } from '../slices/webServiceSlice';
import type { InstallWebServicePackageOptions, InstallWebServicePackageResult } from '../../../types/version-install.js';
import type { VersionDownloadMode } from '../../../types/version-download.js';
import { waitForStartupStoreLicenseVerification } from '../startupStoreLicenseVerification.js';
import { trackEvent } from '../../telemetry';
import {
  TELEMETRY_MISSING_DEPENDENCIES,
  TELEMETRY_STARTUP_PHASES,
  type TelemetryEventProperties,
} from '../../../shared/telemetry-events.js';

type OutcomeStatus = 'success' | 'failure';
type WebServiceStartOutcome = Omit<TelemetryEventProperties<'web_service_start_finished'>, 'duration'>;
type WebServiceStartTrigger = TelemetryEventProperties<'web_service_start_requested'>['trigger'];

export interface StartWebServiceOptions {
  trigger?: WebServiceStartTrigger;
}

// Optional detail the main process attaches to a failed start. Renderer filters it before telemetry.
export interface StartWebServiceTelemetry {
  failedPhase?: string;
  missingDependency?: string;
  missingCount?: number;
}

// Types for window electronAPI
declare global {
  interface Window {
    electronAPI: {
      // Web Service Management APIs
      getWebServiceStatus: () => Promise<ProcessInfo>;
      startWebService: (force?: boolean) => Promise<{
        success: boolean;
        error?: { type: string; details: string };
        warning?: { type: string; missing: any[] };
        startupFailure?: StartupFailurePayload;
        telemetry?: StartWebServiceTelemetry;
      }>;
      stopWebService: () => Promise<boolean>;
      restartWebService: () => Promise<boolean>;
      getWebServiceVersion: () => Promise<string>;
      getWebServiceUrl: () => Promise<string | null>;
      setWebServiceConfig: (config: { port?: number; host?: string }) => Promise<{
        success: boolean;
        error: string | null;
        errorCode?: 'invalid-listen-host' | 'invalid-port' | 'unknown';
      }>;
      onWebServiceStatusChange: (callback: (status: ProcessInfo) => void) => (() => void) | void;

      // Package Management APIs
      checkPackageInstallation: () => Promise<PackageInfo>;
      installWebServicePackage: (
        version: string,
        options?: InstallWebServicePackageOptions,
      ) => Promise<InstallWebServicePackageResult>;
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

export interface InstallWebServicePackageRequestObject {
  version: string;
  options?: InstallWebServicePackageOptions;
}

export type InstallWebServicePackageRequest = string | InstallWebServicePackageRequestObject;

function normalizeInstallWebServicePackageRequest(
  request: InstallWebServicePackageRequest,
): InstallWebServicePackageRequestObject {
  return typeof request === 'string' ? { version: request } : request;
}

function getInstallSuccessDescription(
  result: InstallWebServicePackageResult,
  options?: InstallWebServicePackageOptions,
): string {
  if (result.autoSwitched) {
    return i18n.t('pages:versionManagement.toast.installSuccessAutoSwitchedDescription');
  }

  if (options?.autoSwitchWhenIdle) {
    return i18n.t('pages:versionManagement.toast.installSuccessNoAutoSwitchDescription');
  }

  return i18n.t('pages:versionManagement.toast.installSuccessDescription');
}

function toStartErrorKind(type: string | undefined): NonNullable<WebServiceStartOutcome['errorKind']> {
  switch (type) {
    case 'no-active-version':
      return 'no_active_version';
    case 'version-not-ready':
      return 'version_not_ready';
    case 'dependency-requirements-not-met':
      return 'dependencies_missing';
    default:
      return 'other';
  }
}

function trackStartRequested(trigger: WebServiceStartTrigger): void {
  trackEvent('web_service_start_requested', { trigger });
}

function trackStartFinished(outcome: WebServiceStartOutcome, startedAt: number): void {
  trackEvent('web_service_start_finished', { ...outcome, duration: Date.now() - startedAt });
}

function isOneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/**
 * Failure detail for web_service_start_finished. Values outside the catalog are dropped;
 * missingDependency and missingCount are only forwarded for dependencies_missing.
 */
function toStartFailureDetail(
  errorKind: WebServiceStartOutcome['errorKind'],
  telemetry: StartWebServiceTelemetry | undefined,
): Pick<WebServiceStartOutcome, 'failedPhase' | 'missingDependency' | 'missingCount'> {
  const detail: Pick<WebServiceStartOutcome, 'failedPhase' | 'missingDependency' | 'missingCount'> = {};
  if (isOneOf(TELEMETRY_STARTUP_PHASES, telemetry?.failedPhase)) {
    detail.failedPhase = telemetry.failedPhase;
  }
  if (errorKind === 'dependencies_missing') {
    if (isOneOf(TELEMETRY_MISSING_DEPENDENCIES, telemetry?.missingDependency)) {
      detail.missingDependency = telemetry.missingDependency;
    }
    const missingCount = telemetry?.missingCount;
    if (typeof missingCount === 'number' && Number.isFinite(missingCount) && missingCount >= 0 && missingCount <= 100) {
      detail.missingCount = missingCount;
    }
  }
  return detail;
}

function trackVersionInstallFinished(status: OutcomeStatus, startedAt: number, mode: VersionDownloadMode): void {
  trackEvent('version_install_finished', { status, mode, duration: Date.now() - startedAt });
}

/**
 * Start web service
 * Replaces webServiceSaga/startWebServiceSaga
 *
 * Start request paths and their `web_service_start_requested` trigger (audit, telemetry):
 *
 * | Path                                              | Trigger        | Emitted from                                   |
 * | ------------------------------------------------- | -------------- | ---------------------------------------------- |
 * | Home start button (WebServiceStatusCard)          | home_button    | this thunk (default trigger)                   |
 * | Start confirmed despite warning                   | home_button    | confirmStartWithWarning (calls IPC directly)   |
 * | Tray start (store/index.ts)                       | home_button    | this thunk (default trigger)                   |
 * | Restart (WebServiceStatusCard)                    | restart        | restartWebService thunk                        |
 * | Data path change restarts a running service       | restart        | main runtimeDataPathHandlers                   |
 * | Onboarding start (onboarding:start-service)       | onboarding     | main runOnboardingStartService                 |
 * | Automatic restart after an unexpected exit        | auto           | main, web service manager listener             |
 *
 * `onboardingHandlers.ts` and `webServiceHandlers.ts` are not registered, so they are not paths.
 */
export const startWebService = createAsyncThunk(
  'webService/start',
  async (options: StartWebServiceOptions | undefined, { dispatch, getState }) => {
    trackStartRequested(options?.trigger ?? 'home_button');
    const startedAt = Date.now();
    let startOutcome: WebServiceStartOutcome = { status: 'failure', errorKind: 'other' };
    dispatch(beginStartupBatch());
    const batch = (getState() as { webService: { startupBatch: number } }).webService.startupBatch;
    try {
      dispatch(setErrorForBatch({ batch, error: null }));
      dispatch(setStartupFailureForBatch({ batch, failure: null }));
      await waitForStartupStoreLicenseVerification();

      const result: {
        success: boolean;
        error?: { type: string; details: string };
        startupFailure?: StartupFailurePayload;
        telemetry?: StartWebServiceTelemetry;
      } =
        await window.electronAPI.startWebService();

      if (result.success) {
        startOutcome = { status: 'success' };
        dispatch(setStartupFailureForBatch({ batch, failure: null }));
        // Keep the card in checking state until the current batch is confirmed healthy.
        await dispatch(fetchWebServiceStatus(batch));
      } else {
        const errorKind = toStartErrorKind(result.error?.type);
        startOutcome = { status: 'failure', errorKind, ...toStartFailureDetail(errorKind, result.telemetry) };
        if (result.startupFailure) {
          dispatch(setStartupFailureForBatch({ batch, failure: result.startupFailure }));
        }

        // Set error based on error type
        if (result.error) {
          switch (result.error.type) {
            case 'no-active-version':
              dispatch(setErrorForBatch({ batch, error: 'No active version found. Please install and activate a version first.' }));
              break;
            case 'version-not-ready':
              dispatch(setErrorForBatch({ batch, error: 'Active version is not ready. Dependencies may be missing.' }));
              break;
            case 'dependency-requirements-not-met':
              dispatch(setErrorForBatch({ batch, error: result.error.details || 'Required managed dependencies must be repaired before starting the web service.' }));
              break;
            default:
              dispatch(setErrorForBatch({ batch, error: result.error.details || 'Failed to start web service' }));
          }
        } else {
          dispatch(setErrorForBatch({ batch, error: 'Failed to start web service' }));
        }
        dispatch(setStatusForBatch({ batch, status: 'error' }));
      }

      return result.success;
    } catch (error) {
      console.error('Start web service error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setErrorForBatch({ batch, error: errorMessage }));
      throw error;
    } finally {
      dispatch(setOperatingForBatch({ batch, operating: false }));
      trackStartFinished(startOutcome, startedAt);
    }
  }
);

/**
 * Confirm start with warning (user chose to start despite missing dependencies)
 * Replaces webServiceSaga/confirmStartWithWarningSaga
 */
export const confirmStartWithWarning = createAsyncThunk(
  'webService/confirmStartWithWarning',
  async (_, { dispatch, getState }) => {
    // Calls the IPC directly (not the startWebService thunk), so this is the only requested event for this request.
    trackStartRequested('home_button');
    const startedAt = Date.now();
    let startOutcome: WebServiceStartOutcome = { status: 'failure', errorKind: 'other' };
    dispatch(beginStartupBatch());
    const batch = (getState() as { webService: { startupBatch: number } }).webService.startupBatch;
    try {
      dispatch(setErrorForBatch({ batch, error: null }));
      dispatch(setStartupFailureForBatch({ batch, failure: null }));
      dispatch(hideStartConfirmDialog());
      await waitForStartupStoreLicenseVerification();

      // Call startWebService with force=true
      const result: {
        success: boolean;
        error?: { type: string; details: string };
        startupFailure?: StartupFailurePayload;
        telemetry?: StartWebServiceTelemetry;
      } =
        await window.electronAPI.startWebService(true);

      if (result.success) {
        startOutcome = { status: 'success' };
        dispatch(setStartupFailureForBatch({ batch, failure: null }));
        dispatch(setShowDependencyWarning(true));
        await dispatch(fetchWebServiceStatus(batch));
      } else {
        const errorKind = toStartErrorKind(result.error?.type);
        startOutcome = { status: 'failure', errorKind, ...toStartFailureDetail(errorKind, result.telemetry) };
        if (result.startupFailure) {
          dispatch(setStartupFailureForBatch({ batch, failure: result.startupFailure }));
        }
        // Set error based on error type
        if (result.error) {
          dispatch(setErrorForBatch({ batch, error: result.error.details || 'Failed to start web service' }));
        } else {
          dispatch(setErrorForBatch({ batch, error: 'Failed to start web service' }));
        }
        dispatch(setStatusForBatch({ batch, status: 'error' }));
      }

      return result.success;
    } catch (error) {
      console.error('Confirm start with warning error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setErrorForBatch({ batch, error: errorMessage }));
      throw error;
    } finally {
      dispatch(setOperatingForBatch({ batch, operating: false }));
      trackStartFinished(startOutcome, startedAt);
    }
  }
);

/**
 * Stop web service
 * Replaces webServiceSaga/stopWebServiceSaga
 */
export const stopWebService = createAsyncThunk(
  'webService/stop',
  async (_, { dispatch, getState }) => {
    const startedAt = Date.now();
    let succeeded = false;
    dispatch(beginStartupBatch({ status: 'stopping', checking: false }));
    const batch = (getState() as { webService: { startupBatch: number } }).webService.startupBatch;
    try {
      dispatch(setErrorForBatch({ batch, error: null }));

      const success: boolean = await window.electronAPI.stopWebService();
      succeeded = success;

      if (success) {
        dispatch(setStatusForBatch({ batch, status: 'stopped' }));
        dispatch(setUrl(null));
      } else {
        dispatch(setErrorForBatch({ batch, error: 'Failed to stop web service' }));
      }

      return success;
    } catch (error) {
      console.error('Stop web service error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setErrorForBatch({ batch, error: errorMessage }));
      throw error;
    } finally {
      dispatch(setOperatingForBatch({ batch, operating: false }));
      trackEvent('web_service_stop_finished', {
        status: succeeded ? 'success' : 'failure',
        duration: Date.now() - startedAt,
      });
    }
  }
);

/**
 * Restart web service
 * Replaces webServiceSaga/restartWebServiceSaga
 */
export const restartWebService = createAsyncThunk(
  'webService/restart',
  async (_, { dispatch, getState }) => {
    trackStartRequested('restart');
    const startedAt = Date.now();
    let succeeded = false;
    dispatch(beginStartupBatch({ status: 'stopping', checking: false }));
    const batch = (getState() as { webService: { startupBatch: number } }).webService.startupBatch;
    try {
      dispatch(setErrorForBatch({ batch, error: null }));

      const success: boolean = await window.electronAPI.restartWebService();
      succeeded = success;

      if (success) {
        dispatch(setStatusForBatch({ batch, status: 'starting' }));
        await dispatch(fetchWebServiceStatus(batch));
      } else {
        dispatch(setErrorForBatch({ batch, error: 'Failed to restart web service' }));
      }

      return success;
    } catch (error) {
      console.error('Restart web service error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setErrorForBatch({ batch, error: errorMessage }));
      throw error;
    } finally {
      dispatch(setOperatingForBatch({ batch, operating: false }));
      trackEvent('web_service_restart_finished', {
        status: succeeded ? 'success' : 'failure',
        duration: Date.now() - startedAt,
      });
    }
  }
);

/**
 * Fetch web service status
 * Replaces webServiceSaga/fetchWebServiceStatusSaga
 */
export const fetchWebServiceStatus = createAsyncThunk(
  'webService/fetchStatus',
  async (batch: number | undefined, { dispatch }) => {
    try {
      const status: ProcessInfo = await window.electronAPI.getWebServiceStatus();
      if (batch === undefined) {
        dispatch(setProcessInfo(status));
      } else {
        dispatch(setProcessInfoForBatch({ batch, info: status }));
      }
      if (batch === undefined) {
        dispatch(setError(null));
      }
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
  async (request: InstallWebServicePackageRequest, { dispatch, getState }) => {
    try {
      const { version, options } = normalizeInstallWebServicePackageRequest(request);

      // Check service status before installing
      const state = getState() as { webService: { status: ProcessStatus } };
      const currentStatus = state.webService.status;

      // If service is running, show confirmation dialog
      if (currentStatus === 'running') {
        dispatch(setInstallState(InstallState.Confirming));
        dispatch(showInstallConfirm({ version, options }));
        return { confirmed: false };
      }

      // Service is not running, proceed with installation
      dispatch(setInstallState(InstallState.Installing));
      dispatch(setInstallingVersionId(version));
      return await doInstallPackage(version, options, dispatch, getState);
    } catch (error) {
      console.error('Install package error:', error);
      dispatch(setInstallProgress({
        stage: 'error',
        mode: 'http-direct',
        current: 0,
        total: 0,
        percentage: 0,
        message: i18n.t('pages:versionManagement.toast.installFailedDescription'),
      }));
      dispatch(setInstallingVersionId(null));
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
      const state = getState() as {
        webService: {
          pendingInstallVersion: string | null;
          pendingInstallOptions: InstallWebServicePackageOptions | null;
        };
      };
      const pendingVersion = state.webService.pendingInstallVersion;
      const pendingInstallOptions = state.webService.pendingInstallOptions ?? undefined;

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
      dispatch(setInstallingVersionId(pendingVersion));
      const result = await doInstallPackage(pendingVersion, pendingInstallOptions, dispatch, getState);

      // Hide confirmation dialog after installation completes
      dispatch(hideInstallConfirm());

      return result;
    } catch (error) {
      console.error('Confirm install and stop error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch(setError(errorMessage));
      dispatch(hideInstallConfirm());
      dispatch(setInstallingVersionId(null));
      dispatch(setInstallState(InstallState.Error));
      throw error;
    }
  }
);

/**
 * Helper function: Execute installation
 */
async function doInstallPackage(
  version: string,
  options: InstallWebServicePackageOptions | undefined,
  dispatch: any,
  getState: () => unknown,
) {
  const startedAt = Date.now();
  // The download path is only known from progress events. A source-fallback download stays reported
  // even if a later event (for example the switching step) carries http-direct.
  let mode: VersionDownloadMode = 'http-direct';
  const unsubscribeProgress = window.electronAPI.onPackageInstallProgress?.((progress) => {
    if (progress.mode === 'source-fallback') {
      mode = 'source-fallback';
    }
  });
  dispatch(setInstallProgress({
    stage: 'queued',
    mode: 'http-direct',
    current: 0,
    total: 0,
    percentage: 0,
    message: 'queued',
  }));
  dispatch(setError(null));

  let result: InstallWebServicePackageResult;
  try {
    result = await window.electronAPI.installWebServicePackage(version, options);
  } catch (error) {
    trackVersionInstallFinished('failure', startedAt, mode);
    throw error;
  } finally {
    if (typeof unsubscribeProgress === 'function') {
      unsubscribeProgress();
    }
  }
  trackVersionInstallFinished(result.success ? 'success' : 'failure', startedAt, mode);

  if (result.success) {
    dispatch(setInstallState(InstallState.Completed));
    dispatch(setInstallProgress({
      stage: 'completed',
      mode: 'http-direct',
      current: 1,
      total: 1,
      percentage: 100,
      message: 'installation-complete',
    }));
    // Refresh package info
    await dispatch(checkPackageInstallation());
    // Refresh version
    await dispatch(fetchWebServiceVersion());
    // Refresh active version
    await dispatch(fetchActiveVersion());

    // Show success toast
    toast.success(i18n.t('pages:versionManagement.toast.installSuccess'), {
      description: getInstallSuccessDescription(result, options)
    });

    // Check dependencies after installation
    await dispatch(checkDependenciesAfterInstall({ versionId: version }));

    // Reset to idle state after 3 seconds
    setTimeout(() => {
      dispatch(setInstallingVersionId(null));
      dispatch(setInstallState(InstallState.Idle));
    }, 3000);

    return result;
  } else {
    dispatch(setInstallState(InstallState.Error));
    dispatch(setInstallProgress({
      stage: 'error',
      mode: 'http-direct',
      current: 0,
      total: 0,
      percentage: 0,
      message: i18n.t('pages:versionManagement.toast.installFailedDescription'),
    }));
    dispatch(setError('Failed to install package'));

    // Show error toast
    toast.error(i18n.t('pages:versionManagement.toast.installFailed'), {
      description: i18n.t('pages:versionManagement.toast.installFailedDescription')
    });

    // Reset to idle state immediately after error
    dispatch(setInstallingVersionId(null));
    dispatch(setInstallState(InstallState.Idle));

    return result;
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
    return await dispatch(updateWebServiceConfig({ port })).unwrap();
  }
);

export const updateWebServiceConfig = createAsyncThunk(
  'webService/updateConfig',
  async (config: { host?: string; port?: number }, { dispatch }) => {
    try {
      if (config.port !== undefined && (config.port < 1024 || config.port > 65535)) {
        dispatch(setError('Port must be between 1024 and 65535'));
        return { success: false };
      }

      const result = await window.electronAPI.setWebServiceConfig(config);

      if (result.success) {
        if (config.host !== undefined) {
          dispatch(setHost(config.host));
        }
        if (config.port !== undefined) {
          dispatch(setPort(config.port));
        }
        dispatch(setError(null));
        return { success: true };
      } else {
        dispatch(setError(result.error || 'Failed to update web service configuration'));
        return { success: false };
      }
    } catch (error) {
      console.error('Update web service config error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update web service configuration';
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
  async (_, { dispatch, getState }) => {
    dispatch(advanceStartupBatch());

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

    // Hydrate from main-process recovered status to avoid startup false negatives.
    try {
      const status: ProcessInfo = await window.electronAPI.getWebServiceStatus();
      const currentState = (getState() as {
        webService: {
          status: ProcessStatus;
          isOperating: boolean;
          phase: StartupPhase;
        };
      }).webService;
      const shouldSkipStaleHydration = currentState.isOperating
        || currentState.status === 'starting'
        || currentState.status === 'running'
        || currentState.phase === StartupPhase.CheckingVersion
        || currentState.phase === StartupPhase.CheckingDependencies
        || currentState.phase === StartupPhase.Spawning
        || currentState.phase === StartupPhase.WaitingListening
        || currentState.phase === StartupPhase.HealthCheck;

      if (!shouldSkipStaleHydration) {
        dispatch(setProcessInfo(status));
      }
    } catch (error) {
      console.error('Initialize web service status error:', error);
    }
  }
);
