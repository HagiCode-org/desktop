import { call, put, takeEvery, takeLatest, all, select, fork } from 'redux-saga/effects';
import { toast } from 'sonner';
import {
  fetchDependenciesStart,
  fetchDependenciesSuccess,
  fetchDependenciesFailure,
  installDependencyStart,
  installDependencySuccess,
  installDependencyFailure,
  showInstallConfirm,
  hideInstallConfirm,
  startInstall,
  updateInstallProgress,
  completeInstall,
  DependencyType,
} from '../slices/dependencySlice';
import type { DependencyItem } from '../slices/dependencySlice';

// Action types for saga
export const FETCH_DEPENDENCIES = 'dependency/fetchDependencies';
export const INSTALL_DEPENDENCY = 'dependency/installDependency';
export const INSTALL_FROM_MANIFEST = 'dependency/installFromManifest';
export const INSTALL_SINGLE_DEPENDENCY = 'dependency/installSingleDependency';
export const CHECK_DEPENDENCIES_AFTER_INSTALL = 'dependency/checkAfterInstall';

/**
 * Worker saga: Fetch dependencies status
 */
function* fetchDependenciesStatus() {
  try {
    yield put(fetchDependenciesStart());

    const dependencies: DependencyItem[] = yield call(
      window.electronAPI.checkDependencies
    );

    yield put(fetchDependenciesSuccess(dependencies));
  } catch (error) {
    yield put(
      fetchDependenciesFailure(
        error instanceof Error ? error.message : 'Failed to fetch dependencies'
      )
    );
  }
}

/**
 * Worker saga: Install dependency
 */
function* installDependency(action: { type: string; payload: DependencyType }) {
  try {
    const dependencyType = action.payload;
    yield put(installDependencyStart(dependencyType));

    const success: boolean = yield call(
      window.electronAPI.installDependency,
      dependencyType
    );

    if (success) {
      yield put(installDependencySuccess());
      // Refresh dependencies after installation
      yield call(fetchDependenciesStatus);
    } else {
      yield put(installDependencyFailure('Installation failed'));
    }
  } catch (error) {
    yield put(
      installDependencyFailure(
        error instanceof Error ? error.message : 'Failed to install dependency'
      )
    );
  }
}

/**
 * Worker saga: Check dependencies after package installation
 */
function* checkDependenciesAfterInstall(action: { type: string; payload: string }) {
  try {
    const versionId = action.payload;

    // Get missing dependencies
    const missingDeps: DependencyItem[] = yield call(
      window.electronAPI.getMissingDependencies,
      versionId
    );

    if (missingDeps.length > 0) {
      // Show install confirmation dialog
      yield put(showInstallConfirm({
        dependencies: missingDeps,
        versionId,
      }));
    }
  } catch (error) {
    console.error('Failed to check dependencies after install:', error);
  }
}

/**
 * Worker saga: Install dependencies from manifest
 */
function* installFromManifest(action: { type: string; payload: string }) {
  try {
    const versionId = action.payload;

    // Get pending dependencies
    const { dependencies } = yield select((state: any) => state.dependency.installConfirm);

    // Start installation
    yield put(startInstall(dependencies.length));

    // Set up progress listener
    const progressChannel = yield call(setupProgressListener);

    // Execute installation
    const result: { success: boolean; result?: { success: string[]; failed: Array<{ dependency: string; error: string }> } } =
      yield call(window.electronAPI.installFromManifest, versionId);

    if (result.success) {
      yield put(completeInstall({
        status: result.result?.failed && result.result.failed.length > 0 ? 'error' : 'success',
        errors: result.result?.failed,
      }));

      // Hide confirm dialog
      yield put(hideInstallConfirm());

      // Refresh dependencies
      yield call(fetchDependenciesStatus);

      // Show result toast notification
      if (result.result?.failed && result.result.failed.length > 0) {
        const failed = result.result.failed.length;
        const success = result.result.success.length;

        if (success > 0) {
          toast.success('依赖安装完成', {
            description: `${success} 个依赖安装成功，${failed} 个失败`,
          });
        } else {
          toast.error('依赖安装失败', {
            description: `${failed} 个依赖安装失败`,
          });
        }
      } else {
        toast.success('依赖安装成功', {
          description: '所有依赖已成功安装',
        });
      }
    } else {
      yield put(completeInstall({
        status: 'error',
        errors: [{ dependency: 'unknown', error: 'Installation failed' }],
      }));

      toast.error('依赖安装失败', {
        description: '安装过程中出现错误',
      });
    }

    // Clean up progress listener
    if (progressChannel) {
      progressChannel.close();
    }
  } catch (error) {
    yield put(completeInstall({
      status: 'error',
      errors: [{ dependency: 'unknown', error: error instanceof Error ? error.message : String(error) }],
    }));

    toast.error('依赖安装失败', {
      description: error instanceof Error ? error.message : '未知错误',
    });

    console.error('Failed to install from manifest:', error);
  }
}

/**
 * Worker saga: Install single dependency
 */
function* installSingleDependency(action: { type: string; payload: { dependencyKey: string; versionId: string } }) {
  try {
    const { dependencyKey, versionId } = action.payload;

    const result: { success: boolean } = yield call(
      window.electronAPI.installSingleDependency,
      dependencyKey,
      versionId
    );

    if (result.success) {
      // Refresh dependencies
      yield call(fetchDependenciesStatus);

      toast.success('依赖安装成功', {
        description: `${dependencyKey} 已成功安装`,
      });
    } else {
      toast.error('依赖安装失败', {
        description: `${dependencyKey} 安装失败`,
      });
    }
  } catch (error) {
    console.error('Failed to install single dependency:', error);

    toast.error('依赖安装失败', {
      description: error instanceof Error ? error.message : '未知错误',
    });
  }
}

/**
 * Set up progress listener for installation progress
 */
function setupProgressListener() {
  return eventChannel((emit) => {
    const unsubscribe = window.electronAPI.onDependencyInstallProgress((progress) => {
      emit(progress);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  });
}

/**
 * Watcher saga: Watch for fetch dependencies action
 */
function* watchFetchDependencies() {
  yield takeLatest(FETCH_DEPENDENCIES, fetchDependenciesStatus);
}

/**
 * Watcher saga: Watch for install dependency action
 */
function* watchInstallDependency() {
  yield takeEvery(INSTALL_DEPENDENCY, installDependency);
}

/**
 * Watcher saga: Watch for install from manifest action
 */
function* watchInstallFromManifest() {
  yield takeEvery(INSTALL_FROM_MANIFEST, installFromManifest);
}

/**
 * Watcher saga: Watch for install single dependency action
 */
function* watchInstallSingleDependency() {
  yield takeEvery(INSTALL_SINGLE_DEPENDENCY, installSingleDependency);
}

/**
 * Watcher saga: Watch for check dependencies after install action
 */
function* watchCheckDependenciesAfterInstall() {
  yield takeEvery(CHECK_DEPENDENCIES_AFTER_INSTALL, checkDependenciesAfterInstall);
}

/**
 * Root saga for dependency management
 */
export function* dependencySaga() {
  yield all([
    watchFetchDependencies(),
    watchInstallDependency(),
    watchInstallFromManifest(),
    watchInstallSingleDependency(),
    watchCheckDependenciesAfterInstall(),
  ]);
}

/**
 * Initialize saga to fetch dependencies on startup
 */
export function* initializeDependencySaga() {
  yield fetchDependenciesStatus();
}

// Helper: Create event channel for progress updates
function eventChannel(subscribe: (emit: (input: any) => void) => () => void) {
  return {
    close: () => {},
  };
}
