import { call, put, takeEvery, takeLatest, all } from 'redux-saga/effects';
import {
  fetchDependenciesStart,
  fetchDependenciesSuccess,
  fetchDependenciesFailure,
  installDependencyStart,
  installDependencySuccess,
  installDependencyFailure,
  DependencyType,
} from '../slices/dependencySlice';

// Action types for saga
export const FETCH_DEPENDENCIES = 'dependency/fetchDependencies';
export const INSTALL_DEPENDENCY = 'dependency/installDependency';

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
 * Root saga for dependency management
 */
export function* dependencySaga() {
  yield all([watchFetchDependencies(), watchInstallDependency()]);
}

/**
 * Initialize saga to fetch dependencies on startup
 */
export function* initializeDependencySaga() {
  yield fetchDependenciesStatus();
}
