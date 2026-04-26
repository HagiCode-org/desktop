import { createAsyncThunk } from '@reduxjs/toolkit';
import { setCurrentLanguage } from '../slices/i18nSlice';
import i18n from '@/i18n';

async function syncMainProcessLanguage(language: string): Promise<void> {
  const result = await (window.electronAPI as typeof window.electronAPI & {
    languageChanged: (nextLanguage: string) => Promise<{ success: boolean; error?: string }>;
  }).languageChanged(language);
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to synchronize language with main process');
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
      // Call i18next to change language
      await i18n.changeLanguage(language);
      await syncMainProcessLanguage(language);

      // Update Redux state
      dispatch(setCurrentLanguage(language));

      // Persist to localStorage
      try {
        localStorage.setItem('appSettings.language', language);
      } catch (error) {
        console.warn('Failed to save language preference:', error);
      }

      return language;
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
      const resolvedLanguage = savedLanguage || i18n.resolvedLanguage || i18n.language;

      if (savedLanguage) {
        await i18n.changeLanguage(savedLanguage);
      }

      await syncMainProcessLanguage(resolvedLanguage);
      dispatch(setCurrentLanguage(resolvedLanguage));
      return savedLanguage ?? resolvedLanguage;
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
