import { call, put, takeEvery, fork, select, take, delay } from 'redux-saga/effects';
import { toast } from 'sonner';
import { store } from '../index'; // Import store instance
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

// Action types for sagas
export const START_WEB_SERVICE = 'webService/startSaga';
export const STOP_WEB_SERVICE = 'webService/stopSaga';
export const RESTART_WEB_SERVICE = 'webService/restartSaga';
export const FETCH_WEB_SERVICE_STATUS = 'webService/fetchStatusSaga';
export const FETCH_WEB_SERVICE_VERSION = 'webService/fetchVersionSaga';
export const CHECK_PACKAGE_INSTALLATION = 'webService/checkPackageInstallation';
export const INSTALL_WEB_SERVICE_PACKAGE = 'webService/installPackage';
export const CONFIRM_INSTALL_AND_STOP = 'webService/confirmInstallAndStop';
export const FETCH_AVAILABLE_VERSIONS = 'webService/fetchAvailableVersions';
export const FETCH_PLATFORM = 'webService/fetchPlatform';
export const UPDATE_WEB_SERVICE_PORT = 'webService/updatePortSaga';
export const FETCH_ACTIVE_VERSION = 'webService/fetchActiveVersion';
export const CONFIRM_START_WITH_WARNING = 'webService/confirmStartWithWarning';
export const HIDE_START_CONFIRM = 'webService/hideStartConfirm';

// Action creators
export const startWebServiceAction = () => ({ type: START_WEB_SERVICE });
export const stopWebServiceAction = () => ({ type: STOP_WEB_SERVICE });
export const restartWebServiceAction = () => ({ type: RESTART_WEB_SERVICE });
export const fetchWebServiceStatusAction = () => ({ type: FETCH_WEB_SERVICE_STATUS });
export const fetchWebServiceVersionAction = () => ({ type: FETCH_WEB_SERVICE_VERSION });
export const checkPackageInstallationAction = () => ({ type: CHECK_PACKAGE_INSTALLATION });
export const installWebServicePackageAction = (version: string) => ({
  type: INSTALL_WEB_SERVICE_PACKAGE,
  payload: version,
});
export const fetchAvailableVersionsAction = () => ({ type: FETCH_AVAILABLE_VERSIONS });
export const fetchPlatformAction = () => ({ type: FETCH_PLATFORM });
export const updateWebServicePortAction = (port: number) => ({
  type: UPDATE_WEB_SERVICE_PORT,
  payload: port,
});
export const fetchActiveVersionAction = () => ({ type: FETCH_ACTIVE_VERSION });

export const confirmInstallAndStopAction = () => ({ type: CONFIRM_INSTALL_AND_STOP });
export const confirmStartWithWarningAction = () => ({ type: CONFIRM_START_WITH_WARNING });
export const hideStartConfirmAction = () => ({ type: HIDE_START_CONFIRM });

// Helper: Call electron API with error handling
function safeElectronCall<T>(fn: () => Promise<T>, errorMessage: string): Generator<any, T, any> {
  try {
    return call(fn);
  } catch (error) {
    return call(() => {
      console.error(errorMessage, error);
      throw error;
    });
  }
}

// Saga: Start web service
function* startWebServiceSaga() {
  try {
    yield put(setOperating(true));
    yield put(setStatus('starting'));
    yield put(setError(null));

    const result: { success: boolean; error?: { type: string; details: string }; warning?: { type: string; missing: any[] } } = yield call(window.electronAPI.startWebService);

    if (result.success) {
      yield put(setStatus('running'));
      // Fetch updated status
      yield put(fetchWebServiceStatusAction());
    } else if (result.warning) {
      // Show confirmation dialog for missing dependencies
      if (result.warning.type === 'missing-dependencies') {
        const missingDeps: DependencyItem[] = result.warning.missing.map((dep: any) => ({
          name: dep.name,
          type: dep.type,
          installed: dep.installed,
          version: dep.version,
          requiredVersion: dep.requiredVersion,
          versionMismatch: dep.versionMismatch,
        }));
        yield put(showStartConfirmDialog(missingDeps));
      }
    } else {
      // Set error based on error type
      if (result.error) {
        switch (result.error.type) {
          case 'no-active-version':
            yield put(setError('No active version found. Please install and activate a version first.'));
            break;
          case 'version-not-ready':
            yield put(setError('Active version is not ready. Dependencies may be missing.'));
            break;
          default:
            yield put(setError(result.error.details || 'Failed to start web service'));
        }
      } else {
        yield put(setError('Failed to start web service'));
      }
      yield put(setStatus('error'));
    }
  } catch (error) {
    console.error('Start web service saga error:', error);
    yield put(setError(error instanceof Error ? error.message : 'Unknown error occurred'));
    yield put(setStatus('error'));
  } finally {
    yield put(setOperating(false));
  }
}

// Saga: Confirm start with warning (user chose to start despite missing dependencies)
function* confirmStartWithWarningSaga() {
  try {
    yield put(setOperating(true));
    yield put(setError(null));
    yield put(hideStartConfirmDialog());

    // Call startWebService with force=true
    const result: { success: boolean; error?: { type: string; details: string } } = yield call(window.electronAPI.startWebService, true);

    if (result.success) {
      yield put(setStatus('running'));
      yield put(setShowDependencyWarning(true));
      // Fetch updated status
      yield put(fetchWebServiceStatusAction());
    } else {
      // Set error based on error type
      if (result.error) {
        yield put(setError(result.error.details || 'Failed to start web service'));
      } else {
        yield put(setError('Failed to start web service'));
      }
      yield put(setStatus('error'));
    }
  } catch (error) {
    console.error('Confirm start with warning saga error:', error);
    yield put(setError(error instanceof Error ? error.message : 'Unknown error occurred'));
    yield put(setStatus('error'));
  } finally {
    yield put(setOperating(false));
  }
}

// Saga: Hide start confirm dialog
function* hideStartConfirmSaga() {
  yield put(hideStartConfirmDialog());
}

// Saga: Stop web service
function* stopWebServiceSaga() {
  try {
    yield put(setOperating(true));
    yield put(setStatus('stopping'));
    yield put(setError(null));

    const success: boolean = yield call(window.electronAPI.stopWebService);

    if (success) {
      yield put(setStatus('stopped'));
      yield put(setUrl(null));
      yield put(setPid(null));
    } else {
      yield put(setError('Failed to stop web service'));
      yield put(setStatus('error'));
    }
  } catch (error) {
    console.error('Stop web service saga error:', error);
    yield put(setError(error instanceof Error ? error.message : 'Unknown error occurred'));
    yield put(setStatus('error'));
  } finally {
    yield put(setOperating(false));
  }
}

// Saga: Restart web service
function* restartWebServiceSaga() {
  try {
    yield put(setOperating(true));
    yield put(setStatus('stopping'));
    yield put(setError(null));

    const success: boolean = yield call(window.electronAPI.restartWebService);

    if (success) {
      yield put(setStatus('running'));
      // Fetch updated status
      yield put(fetchWebServiceStatusAction());
    } else {
      yield put(setError('Failed to restart web service'));
      yield put(setStatus('error'));
    }
  } catch (error) {
    console.error('Restart web service saga error:', error);
    yield put(setError(error instanceof Error ? error.message : 'Unknown error occurred'));
    yield put(setStatus('error'));
  } finally {
    yield put(setOperating(false));
  }
}

// Saga: Fetch web service status
function* fetchWebServiceStatusSaga() {
  try {
    const status: ProcessInfo = yield call(window.electronAPI.getWebServiceStatus);
    yield put(setProcessInfo(status));
    yield put(setError(null));
  } catch (error) {
    console.error('Fetch web service status saga error:', error);
    // Don't set error status on polling failure, just log it
  }
}

// Saga: Fetch web service version
function* fetchWebServiceVersionSaga() {
  try {
    const version: string = yield call(window.electronAPI.getWebServiceVersion);
    yield put(setVersion(version));
  } catch (error) {
    console.error('Fetch web service version saga error:', error);
    yield put(setVersion('unknown'));
  }
}

// Saga: Check package installation
function* checkPackageInstallationSaga() {
  try {
    const packageInfo: PackageInfo = yield call(window.electronAPI.checkPackageInstallation);
    yield put(setPackageInfo(packageInfo));
  } catch (error) {
    console.error('Check package installation saga error:', error);
  }
}

// Saga: Install web service package
function* installWebServicePackageSaga(action: { type: string; payload: string }) {
  const version = action.payload;

  try {
    // Check service status before installing
    const currentStatus: ProcessStatus = yield select((state: any) => state.webService.status);

    // If service is running, show confirmation dialog
    if (currentStatus === 'running') {
      yield put(setInstallState(InstallState.Confirming));
      yield put(showInstallConfirm(version));
      return; // Wait for user confirmation
    }

    // Service is not running, proceed with installation
    yield put(setInstallState(InstallState.Installing));
    yield call(doInstallPackage, version);
  } catch (error) {
    console.error('Install package saga error:', error);
    yield put(setInstallProgress({ stage: 'error', progress: 0, message: 'Installation failed' }));
    yield put(setError(error instanceof Error ? error.message : 'Unknown error occurred'));
    yield put(setInstallState(InstallState.Error));
  }
}

// Saga: Confirm install and stop service
function* confirmInstallAndStopSaga() {
  try {
    const pendingVersion: string | null = yield select((state: any) => state.webService.pendingInstallVersion);

    if (!pendingVersion) {
      yield put(hideInstallConfirm());
      yield put(setInstallState(InstallState.Idle));
      return;
    }

    // Transition to StoppingService state
    yield put(setInstallState(InstallState.StoppingService));

    // Stop the service
    yield put(stopWebServiceAction());

    // Wait for service to stop completely
    yield take((action: any) =>
      action.type === 'webService/setStatus' &&
      (action.payload === 'stopped' || action.payload === 'error')
    );

    // Check if service stopped successfully
    const statusAfterStop: ProcessStatus = yield select((state: any) => state.webService.status);

    if (statusAfterStop === 'error') {
      // Failed to stop service
      yield put(setError('Failed to stop service. Installation cancelled.'));
      yield put(hideInstallConfirm());
      yield put(setInstallState(InstallState.Error));
      return;
    }

    // Service stopped successfully, proceed with installation
    yield put(setInstallState(InstallState.Installing));
    yield call(doInstallPackage, pendingVersion);

    // Hide confirmation dialog after installation completes
    yield put(hideInstallConfirm());
  } catch (error) {
    console.error('Confirm install and stop saga error:', error);
    yield put(setError(error instanceof Error ? error.message : 'Unknown error occurred'));
    yield put(hideInstallConfirm());
    yield put(setInstallState(InstallState.Error));
  }
}

// Helper function: Execute installation
function* doInstallPackage(version: string) {
  yield put(setInstallProgress({ stage: 'verifying', progress: 0, message: 'Starting installation...' }));
  yield put(setError(null));

  const success: boolean = yield call(window.electronAPI.installWebServicePackage, version);

  if (success) {
    yield put(setInstallState(InstallState.Completed));
    yield put(setInstallProgress({ stage: 'completed', progress: 100, message: 'Installation completed successfully' }));
    // Refresh package info
    yield put(checkPackageInstallationAction());
    // Refresh version
    yield put(fetchWebServiceVersionAction());
    // Refresh active version
    yield put(fetchActiveVersionAction());

    // Show success toast
    toast.success('安装成功', {
      description: '版本已成功安装，请手动启动服务。'
    });

    // Check dependencies after installation and show confirmation dialog if needed
    yield put({ type: 'dependency/checkAfterInstall', payload: version });

    // Reset to idle state after 3 seconds
    yield delay(3000);
    yield put(setInstallState(InstallState.Idle));
  } else {
    yield put(setInstallState(InstallState.Error));
    yield put(setInstallProgress({ stage: 'error', progress: 0, message: 'Installation failed' }));
    yield put(setError('Failed to install package'));

    // Show error toast
    toast.error('安装失败', {
      description: '安装过程中出现错误，请重试。'
    });

    // Reset to idle state immediately after error
    yield put(setInstallState(InstallState.Idle));
  }
}

// Saga: Fetch available versions
function* fetchAvailableVersionsSaga() {
  try {
    const versions: string[] = yield call(window.electronAPI.getAvailableVersions);
    yield put(setAvailableVersions(versions));
  } catch (error) {
    console.error('Fetch available versions saga error:', error);
  }
}

// Saga: Fetch platform
function* fetchPlatformSaga() {
  try {
    const platform: string = yield call(window.electronAPI.getPlatform);
    yield put(setPlatform(platform));
  } catch (error) {
    console.error('Fetch platform saga error:', error);
  }
}

// Saga: Update web service port
function* updateWebServicePortSaga(action: { type: string; payload: number }) {
  try {
    const port = action.payload;

    // Validate port range
    if (port < 1024 || port > 65535) {
      yield put(setError('Port must be between 1024 and 65535'));
      return;
    }

    // Call main process to update config
    const result: { success: boolean; error: string | null } = yield call(
      window.electronAPI.setWebServiceConfig,
      { port }
    );

    if (result.success) {
      // Update local state
      yield put(setPort(port));
      yield put(setError(null));
    } else {
      yield put(setError(result.error || 'Failed to update port'));
    }
  } catch (error) {
    console.error('Update port saga error:', error);
    yield put(setError(error instanceof Error ? error.message : 'Failed to update port'));
  }
}

// Saga: Fetch active version
function* fetchActiveVersionSaga() {
  try {
    const activeVersion: any = yield call(window.electronAPI.versionGetActive);
    yield put(setActiveVersion(activeVersion));
  } catch (error) {
    console.error('Fetch active version saga error:', error);
    // Don't set error on active version fetch failure
  }
}

// Saga: Watch for web service status changes from main process
function* watchWebServiceStatusChanges() {
  // Set up polling using regular setInterval
  if (typeof window !== 'undefined') {
    // Listen for active version changes
    window.electronAPI.onActiveVersionChanged((version: any) => {
      // Dispatch to store
      store.dispatch(setActiveVersion(version));
      console.log('Active version changed:', version);
    });

    // Listen for web service status changes
    window.electronAPI.onWebServiceStatusChange((status: any) => {
      // Dispatch to store
      store.dispatch(setProcessInfo(status));
      console.log('Web service status changed:', status);
    });

    // Set up polling as backup
    setInterval(async () => {
      try {
        const status = await window.electronAPI.getWebServiceStatus();
        // Dispatch directly to store
        store.dispatch(setProcessInfo(status));
      } catch (error) {
        console.error('Watch web service status error:', error);
      }
    }, 5000); // Poll every 5 seconds
  }
}

// Saga: Watch for package install progress
function* watchPackageInstallProgress() {
  // Set up listener for package install progress
  if (typeof window !== 'undefined') {
    window.electronAPI.onPackageInstallProgress((progress: InstallProgress) => {
      // Store this in a global variable or use a different approach
      console.log('Package install progress:', progress);
    });
  }
}

// Saga: Watch for version dependency warnings
function* watchVersionDependencyWarnings() {
  if (typeof window !== 'undefined') {
    window.electronAPI.onVersionDependencyWarning((warning: { missing: any[] }) => {
      // Handle version dependency warning
      console.log('Version dependency warning:', warning);
    });
  }
}

// Root saga for web service
export function* webServiceSaga() {
  // Watch for actions
  yield takeEvery(START_WEB_SERVICE, startWebServiceSaga);
  yield takeEvery(STOP_WEB_SERVICE, stopWebServiceSaga);
  yield takeEvery(RESTART_WEB_SERVICE, restartWebServiceSaga);
  yield takeEvery(FETCH_WEB_SERVICE_STATUS, fetchWebServiceStatusSaga);
  yield takeEvery(FETCH_WEB_SERVICE_VERSION, fetchWebServiceVersionSaga);
  yield takeEvery(CHECK_PACKAGE_INSTALLATION, checkPackageInstallationSaga);
  yield takeEvery(INSTALL_WEB_SERVICE_PACKAGE, installWebServicePackageSaga);
  yield takeEvery(CONFIRM_INSTALL_AND_STOP, confirmInstallAndStopSaga);
  yield takeEvery(FETCH_AVAILABLE_VERSIONS, fetchAvailableVersionsSaga);
  yield takeEvery(FETCH_PLATFORM, fetchPlatformSaga);
  yield takeEvery(UPDATE_WEB_SERVICE_PORT, updateWebServicePortSaga);
  yield takeEvery(FETCH_ACTIVE_VERSION, fetchActiveVersionSaga);
  yield takeEvery(CONFIRM_START_WITH_WARNING, confirmStartWithWarningSaga);
  yield takeEvery(HIDE_START_CONFIRM, hideStartConfirmSaga);

  // Fork watcher sagas (non-blocking)
  yield fork(watchWebServiceStatusChanges);
  yield fork(watchPackageInstallProgress);
  yield fork(watchVersionDependencyWarnings);
}

// Initial data fetching saga
export function* initializeWebServiceSaga() {
  yield put(setProcessInfo({
    status: 'stopped',
    pid: null,
    uptime: 0,
    startTime: null,
    url: null,
    restartCount: 0,
  }));
  yield put(setPlatform('linux-x64'));
  yield put(setAvailableVersions([]));
  yield put(setPackageInfo({
    version: 'none',
    platform: 'linux-x64',
    installedPath: '',
    isInstalled: false,
  }));
  yield put(setVersion('unknown'));

  // Try to fetch initial data
  try {
    const platform: string = yield call(window.electronAPI.getPlatform);
    yield put(setPlatform(platform));
  } catch (e) {
    console.log('Platform not available yet');
  }

  // Fetch active version on initialization
  try {
    const activeVersion: any = yield call(window.electronAPI.versionGetActive);
    yield put(setActiveVersion(activeVersion));
  } catch (e) {
    console.log('Active version not available yet');
  }
}
