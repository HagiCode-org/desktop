import { put, takeEvery, call } from 'redux-saga/effects';
import { setCurrentLanguage } from '../slices/i18nSlice';
import i18n from '@/i18n';

/**
 * Action types for language change
 */
export const CHANGE_LANGUAGE_REQUEST = 'i18n/changeLanguageRequest';
export const LOAD_INITIAL_LANGUAGE = 'i18n/loadInitialLanguage';

/**
 * Change language action creator
 */
export const changeLanguageRequest = (language: string) => ({
  type: CHANGE_LANGUAGE_REQUEST,
  payload: language,
});

/**
 * Saga to handle language change
 */
function* changeLanguageSaga(action: { payload: string }) {
  const language = action.payload;

  try {
    // Call i18next to change language
    yield call([i18n, 'changeLanguage'], language);

    // Update Redux state
    yield put(setCurrentLanguage(language));

    // Persist to localStorage (simplified approach)
    try {
      localStorage.setItem('appSettings.language', language);
    } catch (error) {
      console.warn('Failed to save language preference:', error);
    }
  } catch (error) {
    console.error('Failed to change language:', error);
  }
}

/**
 * Saga to load initial language preference
 */
function* loadInitialLanguageSaga() {
  try {
    // Read from localStorage (simplified approach)
    const savedLanguage = localStorage.getItem('appSettings.language');

    if (savedLanguage) {
      yield call([i18n, 'changeLanguage'], savedLanguage);
      yield put(setCurrentLanguage(savedLanguage));
    }
  } catch (error) {
    console.error('Failed to load initial language:', error);
  }
}

/**
 * Root i18n saga
 */
export function* i18nSaga() {
  yield takeEvery(CHANGE_LANGUAGE_REQUEST, changeLanguageSaga);
  yield takeEvery(LOAD_INITIAL_LANGUAGE, loadInitialLanguageSaga);
}

/**
 * Initialize i18n saga action
 */
export const initializeI18nSaga = () => ({
  type: LOAD_INITIAL_LANGUAGE,
});
