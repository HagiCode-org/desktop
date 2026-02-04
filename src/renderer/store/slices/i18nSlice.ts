import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { availableLanguages } from '@/i18n/config';

/**
 * Language interface
 */
export interface Language {
  code: string;        // ISO 639-1 language code + ISO 3166-1 country code
  name: string;        // English name (for display)
  nativeName: string;  // Native language name (for display)
  flag?: string;       // Emoji flag (optional)
}

/**
 * i18n State interface
 */
export interface I18nState {
  currentLanguage: string;           // Current language code
  availableLanguages: Language[];    // Available languages list
  isLoading: boolean;                // Loading state
  error: string | null;              // Error message
}

/**
 * Initial state
 */
const initialState: I18nState = {
  currentLanguage: 'zh-CN',
  availableLanguages: availableLanguages as Language[],
  isLoading: false,
  error: null,
};

/**
 * i18n Slice
 */
export const i18nSlice = createSlice({
  name: 'i18n',
  initialState,
  reducers: {
    setCurrentLanguage: (state, action: PayloadAction<string>) => {
      state.currentLanguage = action.payload;
    },
    setAvailableLanguages: (state, action: PayloadAction<Language[]>) => {
      state.availableLanguages = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setCurrentLanguage,
  setAvailableLanguages,
  setLoading,
  setError,
} = i18nSlice.actions;

export default i18nSlice.reducer;

/**
 * Selectors
 */
export const selectCurrentLanguage = (state: { i18n: I18nState }) =>
  state.i18n.currentLanguage;

export const selectAvailableLanguages = (state: { i18n: I18nState }) =>
  state.i18n.availableLanguages;

export const selectIsLoading = (state: { i18n: I18nState }) =>
  state.i18n.isLoading;

export const selectError = (state: { i18n: I18nState }) =>
  state.i18n.error;
