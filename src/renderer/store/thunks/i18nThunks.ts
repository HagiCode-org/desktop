import { createAsyncThunk } from '@reduxjs/toolkit';
import { setCurrentLanguage } from '../slices/i18nSlice';
import i18n from '@/i18n';
import { resolveDesktopLanguageCode } from '../../../shared/desktop-languages';

async function syncMainProcessLanguage(language: string): Promise<void> {
  const result = await (window.electronAPI as typeof window.electronAPI & {
    languageChanged: (nextLanguage: string) => Promise<{ success: boolean; error?: string }>;
  }).languageChanged(language);
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to synchronize language with main process');
  }
}

function updateDocumentLanguage(language: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
}

/**
 * Change language thunk
 * Replaces i18nSaga/changeLanguageSaga
 */
export const changeLanguage = createAsyncThunk(
  'i18n/changeLanguage',
  async (language: string, { dispatch }) => {
    try {
      const nextLanguage = resolveDesktopLanguageCode(language);
      // Call i18next to change language
      await i18n.changeLanguage(nextLanguage);
      await syncMainProcessLanguage(nextLanguage);
      updateDocumentLanguage(nextLanguage);

      // Update Redux state
      dispatch(setCurrentLanguage(nextLanguage));

      // Persist to localStorage
      try {
        localStorage.setItem('appSettings.language', nextLanguage);
      } catch (error) {
        console.warn('Failed to save language preference:', error);
      }

      return nextLanguage;
    } catch (error) {
      console.error('Failed to change language:', error);
      throw error;
    }
  }
);

/**
 * Load initial language preference thunk
 * Replaces i18nSaga/loadInitialLanguageSaga
 */
export const loadInitialLanguage = createAsyncThunk(
  'i18n/loadInitialLanguage',
  async (_, { dispatch }) => {
    try {
      // Read from localStorage
      const savedLanguage = localStorage.getItem('appSettings.language');
      const resolvedLanguage = resolveDesktopLanguageCode(savedLanguage || i18n.resolvedLanguage || i18n.language);

      if (savedLanguage) {
        await i18n.changeLanguage(resolvedLanguage);
      }

      await syncMainProcessLanguage(resolvedLanguage);
      updateDocumentLanguage(resolvedLanguage);
      dispatch(setCurrentLanguage(resolvedLanguage));
      return resolvedLanguage;
    } catch (error) {
      console.error('Failed to load initial language:', error);
      throw error;
    }
  }
);

/**
 * Initialize i18n on app startup
 * This should be dispatched when the app starts
 */
export const initializeI18n = loadInitialLanguage;
