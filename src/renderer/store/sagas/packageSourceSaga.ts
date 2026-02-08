import { call, put, takeEvery, takeLatest, all, select } from 'redux-saga/effects';
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
} from '../slices/packageSourceSlice';
import type { Version } from '../../../main/version-manager';
import type { StoredPackageSourceConfig } from '../../../main/package-source-config-manager';

// Action types for saga
export const LOAD_SOURCE_CONFIG = 'packageSource/loadConfig';
export const LOAD_ALL_SOURCE_CONFIGS = 'packageSource/loadAllConfigs';
export const SET_SOURCE_CONFIG = 'packageSource/setConfig';
export const SWITCH_SOURCE = 'packageSource/switchSource';
export const VALIDATE_CONFIG = 'packageSource/validateConfig';
export const SCAN_FOLDER = 'packageSource/scanFolder';
export const FETCH_GITHUB = 'packageSource/fetchGithub';
export const FETCH_HTTP_INDEX = 'packageSource/fetchHttpIndex';
export const CLEAR_VERSIONS = 'packageSource/clearVersions';

/**
 * Worker saga: Load current package source configuration
 */
function* loadSourceConfig() {
  try {
    yield put(setLoading(true));

    const config: StoredPackageSourceConfig | null = yield call(
      window.electronAPI.packageSource.getConfig
    );

    yield put(setCurrentConfig(config));
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to load package source configuration')
    );
  } finally {
    yield put(setLoading(false));
  }
}

/**
 * Worker saga: Load all package source configurations
 */
function* loadAllSourceConfigs() {
  try {
    yield put(setLoading(true));

    const configs: StoredPackageSourceConfig[] = yield call(
      window.electronAPI.packageSource.getAllConfigs
    );

    yield put(setAllConfigs(configs));
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to load package source configurations')
    );
  } finally {
    yield put(setLoading(false));
  }
}

/**
 * Worker saga: Set a new package source configuration
 */
function* setSourceConfig(action: { type: string; payload: { type: string; [key: string]: any } }) {
  try {
    yield put(setValidating(true));
    yield put(clearErrors());

    const result: { success: boolean; error?: string } = yield call(
      window.electronAPI.packageSource.setConfig,
      action.payload
    );

    if (result.success) {
      // Reload the current configuration
      yield call(loadSourceConfig);

      // Clear available versions
      yield put(setAvailableVersions([]));

      // Show success message
      toast.success('包源配置已保存', {
        description: 'Package source configuration saved successfully',
      });
    } else {
      yield put(setError(result.error || 'Failed to set package source configuration'));

      toast.error('配置保存失败', {
        description: result.error || 'Failed to save package source configuration',
      });
    }
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to set package source configuration')
    );

    toast.error('配置保存失败', {
      description: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    yield put(setValidating(false));
  }
}

/**
 * Worker saga: Switch to an existing package source
 */
function* switchSource(action: { type: string; payload: string }) {
  try {
    yield put(setLoading(true));
    yield put(clearErrors());

    const result: { success: boolean; error?: string } = yield call(
      window.electronAPI.packageSource.switchSource,
      action.payload
    );

    if (result.success) {
      // Reload the current configuration
      yield call(loadSourceConfig);

      // Clear available versions when switching sources
      yield put(setAvailableVersions([]));

      // Show success message
      toast.success('已切换包源', {
        description: 'Package source switched successfully',
      });
    } else {
      yield put(setError(result.error || 'Failed to switch package source'));

      toast.error('切换失败', {
        description: result.error || 'Failed to switch package source',
      });
    }
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to switch package source')
    );

    toast.error('切换失败', {
      description: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    yield put(setLoading(false));
  }
}

/**
 * Worker saga: Validate a package source configuration
 */
function* validateConfig(action: { type: string; payload: { type: string; [key: string]: any } }) {
  try {
    yield put(setValidating(true));
    yield put(setValidationError(null));

    const result: { valid: boolean; error?: string } = yield call(
      window.electronAPI.packageSource.validateConfig,
      action.payload
    );

    if (result.valid) {
      yield put(setValidationError(null));
    } else {
      yield put(setValidationError(result.error || 'Invalid configuration'));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate configuration';
    yield put(setValidationError(errorMessage));

    return { valid: false, error: errorMessage };
  } finally {
    yield put(setValidating(false));
  }
}

/**
 * Worker saga: Scan folder for available versions
 */
function* scanFolder(action: { type: string; payload: string }) {
  try {
    yield put(setFetchingVersions(true));
    yield put(clearErrors());

    const result: { success: boolean; versions?: Version[]; count?: number; error?: string } =
      yield call(window.electronAPI.packageSource.scanFolder, action.payload);

    if (result.success && result.versions) {
      yield put(setScanResult({
        versions: result.versions,
        count: result.count || result.versions.length,
      }));

      // Show success message
      toast.success('文件夹扫描完成', {
        description: `Found ${result.count || result.versions.length} versions`,
      });
    } else {
      yield put(setError(result.error || 'Failed to scan folder'));

      toast.error('扫描失败', {
        description: result.error || 'Failed to scan folder for versions',
      });
    }
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to scan folder')
    );

    toast.error('扫描失败', {
      description: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    yield put(setFetchingVersions(false));
  }
}

/**
 * Worker saga: Fetch releases from GitHub
 */
function* fetchGithub(action: {
  type: string;
  payload: { owner: string; repo: string; token?: string };
}) {
  try {
    yield put(setFetchingVersions(true));
    yield put(clearErrors());

    const result: { success: boolean; versions?: Version[]; count?: number; error?: string } =
      yield call(window.electronAPI.packageSource.fetchGithub, action.payload);

    if (result.success && result.versions) {
      yield put(setScanResult({
        versions: result.versions,
        count: result.count || result.versions.length,
      }));

      // Show success message
      toast.success('GitHub 版本获取完成', {
        description: `Found ${result.count || result.versions.length} versions`,
      });
    } else {
      yield put(setError(result.error || 'Failed to fetch GitHub releases'));

      toast.error('获取失败', {
        description: result.error || 'Failed to fetch releases from GitHub',
      });
    }
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to fetch GitHub releases')
    );

    toast.error('获取失败', {
      description: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    yield put(setFetchingVersions(false));
  }
}

/**
 * Worker saga: Fetch versions from HTTP index
 */
function* fetchHttpIndex(action: {
  type: string;
  payload: { indexUrl: string; baseUrl?: string; authToken?: string };
}) {
  try {
    yield put(setFetchingVersions(true));
    yield put(clearErrors());

    const result: { success: boolean; versions?: Version[]; count?: number; error?: string } =
      yield call(window.electronAPI.packageSource.fetchHttpIndex, action.payload);

    if (result.success && result.versions) {
      yield put(setScanResult({
        versions: result.versions,
        count: result.count || result.versions.length,
      }));

      // Show success message
      toast.success('HTTP 索引版本获取完成', {
        description: `Found ${result.count || result.versions.length} versions`,
      });
    } else {
      yield put(setError(result.error || 'Failed to fetch HTTP index'));

      toast.error('获取失败', {
        description: result.error || 'Failed to fetch versions from HTTP index',
      });
    }
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to fetch HTTP index')
    );

    toast.error('获取失败', {
      description: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    yield put(setFetchingVersions(false));
  }
}

/**
 * Watcher saga: Watch for load config action
 */
function* watchLoadSourceConfig() {
  yield takeLatest(LOAD_SOURCE_CONFIG, loadSourceConfig);
}

/**
 * Watcher saga: Watch for load all configs action
 */
function* watchLoadAllSourceConfigs() {
  yield takeLatest(LOAD_ALL_SOURCE_CONFIGS, loadAllSourceConfigs);
}

/**
 * Watcher saga: Watch for set config action
 */
function* watchSetSourceConfig() {
  yield takeEvery(SET_SOURCE_CONFIG, setSourceConfig);
}

/**
 * Watcher saga: Watch for switch source action
 */
function* watchSwitchSource() {
  yield takeEvery(SWITCH_SOURCE, switchSource);
}

/**
 * Watcher saga: Watch for validate config action
 */
function* watchValidateConfig() {
  yield takeEvery(VALIDATE_CONFIG, validateConfig);
}

/**
 * Watcher saga: Watch for scan folder action
 */
function* watchScanFolder() {
  yield takeEvery(SCAN_FOLDER, scanFolder);
}

/**
 * Watcher saga: Watch for fetch GitHub action
 */
function* watchFetchGithub() {
  yield takeEvery(FETCH_GITHUB, fetchGithub);
}

/**
 * Watcher saga: Watch for fetch HTTP index action
 */
function* watchFetchHttpIndex() {
  yield takeEvery(FETCH_HTTP_INDEX, fetchHttpIndex);
}

/**
 * Root saga for package source management
 */
export function* packageSourceSaga() {
  yield all([
    watchLoadSourceConfig(),
    watchLoadAllSourceConfigs(),
    watchSetSourceConfig(),
    watchSwitchSource(),
    watchValidateConfig(),
    watchScanFolder(),
    watchFetchGithub(),
    watchFetchHttpIndex(),
  ]);
}

/**
 * Initialize saga to load package source config on startup
 */
export function* initializePackageSourceSaga() {
  yield all([
    call(loadSourceConfig),
    call(loadAllSourceConfigs),
  ]);
}
