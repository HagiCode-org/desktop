import { call, put, takeEvery, takeLatest, all } from 'redux-saga/effects';
import { toast } from 'sonner';
import {
  setLicense,
  setLoading,
  setError,
  clearErrors,
} from '../slices/licenseSlice';
import type { LicenseData } from '../../../types/license';

// Action types for saga
export const FETCH_LICENSE = 'license/fetch';
export const SAVE_LICENSE = 'license/save';

/**
 * Worker saga: Fetch current license
 */
function* fetchLicense() {
  try {
    yield put(setLoading(true));
    yield put(clearErrors());

    const license: LicenseData | null = yield call(
      window.electronAPI.license.get
    );

    yield put(setLicense(license));
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to fetch license')
    );
  } finally {
    yield put(setLoading(false));
  }
}

/**
 * Worker saga: Save license
 */
function* saveLicense(action: { type: string; payload: string }) {
  try {
    yield put(setLoading(true));
    yield put(clearErrors());

    const result: { success: boolean; error?: string } = yield call(
      window.electronAPI.license.save,
      action.payload
    );

    if (result.success) {
      // Reload the license
      yield call(fetchLicense);

      // Show success message
      toast.success('许可证已更新', {
        description: 'License updated successfully',
      });
    } else {
      yield put(setError(result.error || 'Failed to save license'));

      toast.error('许可证更新失败', {
        description: result.error || 'Failed to save license',
      });
    }
  } catch (error) {
    yield put(
      setError(error instanceof Error ? error.message : 'Failed to save license')
    );

    toast.error('许可证更新失败', {
      description: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    yield put(setLoading(false));
  }
}

/**
 * Watcher saga: Watch for fetch license action
 */
function* watchFetchLicense() {
  yield takeLatest(FETCH_LICENSE, fetchLicense);
}

/**
 * Watcher saga: Watch for save license action
 */
function* watchSaveLicense() {
  yield takeEvery(SAVE_LICENSE, saveLicense);
}

/**
 * Root saga for license management
 */
export function* licenseSaga() {
  yield all([
    watchFetchLicense(),
    watchSaveLicense(),
  ]);
}

/**
 * Initialize saga to load license on startup
 */
export function* initializeLicenseSaga() {
  yield call(fetchLicense);
}
