import { call, put, takeEvery, fork } from 'redux-saga/effects';
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
  type ProcessInfo,
  type PackageInfo,
  type InstallProgress,
} from '../slices/webServiceSlice';

// Types for window electronAPI
declare global {
  interface Window {
    electronAPI: {
      // Web Service Management APIs
      getWebServiceStatus: () => Promise<ProcessInfo>;
      startWebService: () => Promise<boolean>;
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
export const FETCH_AVAILABLE_VERSIONS = 'webService/fetchAvailableVersions';
export const FETCH_PLATFORM = 'webService/fetchPlatform';
export const UPDATE_WEB_SERVICE_PORT = 'webService/updatePortSaga';

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
    yield put(setError(null));

    const success: boolean = yield call(window.electronAPI.startWebService);

    if (success) {
      yield put(setStatus('running'));
      // Fetch updated status
      yield put(fetchWebServiceStatusAction());
    } else {
      yield put(setError('Failed to start web service'));
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

// Saga: Stop web service
function* stopWebServiceSaga() {
  try {
    yield put(setOperating(true));
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
    yield put(setInstallProgress({ stage: 'verifying', progress: 0, message: 'Starting installation...' }));
    yield put(setError(null));

    const success: boolean = yield call(window.electronAPI.installWebServicePackage, version);

    if (success) {
      yield put(setInstallProgress({ stage: 'completed', progress: 100, message: 'Installation completed successfully' }));
      // Refresh package info
      yield put(checkPackageInstallationAction());
      // Refresh version
      yield put(fetchWebServiceVersionAction());
    } else {
      yield put(setInstallProgress({ stage: 'error', progress: 0, message: 'Installation failed' }));
      yield put(setError('Failed to install package'));
    }
  } catch (error) {
    console.error('Install package saga error:', error);
    yield put(setInstallProgress({ stage: 'error', progress: 0, message: 'Installation failed' }));
    yield put(setError(error instanceof Error ? error.message : 'Unknown error occurred'));
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

// Saga: Watch for web service status changes from main process
function* watchWebServiceStatusChanges() {
  // Set up polling using regular setInterval
  if (typeof window !== 'undefined') {
    setInterval(async () => {
      try {
        const status = await window.electronAPI.getWebServiceStatus();
        // We need to dispatch this through the store, but we can't use 'put' here
        // So we'll rely on the polling from the main process instead
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
  yield takeEvery(FETCH_AVAILABLE_VERSIONS, fetchAvailableVersionsSaga);
  yield takeEvery(FETCH_PLATFORM, fetchPlatformSaga);
  yield takeEvery(UPDATE_WEB_SERVICE_PORT, updateWebServicePortSaga);

  // Fork watcher sagas (non-blocking)
  yield fork(watchWebServiceStatusChanges);
  yield fork(watchPackageInstallProgress);
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
}
