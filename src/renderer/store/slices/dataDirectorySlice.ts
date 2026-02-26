import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  message: string;
  warnings?: string[];
}

/**
 * Storage information interface
 */
export interface StorageInfo {
  used: number; // bytes
  total: number; // bytes
  available: number; // bytes
  usedPercentage: number; // 0-100
}

/**
 * Data directory state
 */
export interface DataDirectoryState {
  path: string;
  isValid: boolean;
  validationMessage: string;
  validationWarnings?: string[];
  storageInfo: StorageInfo | null;
  isLoading: boolean;
  isLoadingStorage: boolean;
  isSaving: boolean;
  saveError: string | null;
}

const initialState: DataDirectoryState = {
  path: '',
  isValid: true,
  validationMessage: '',
  validationWarnings: undefined,
  storageInfo: null,
  isLoading: false,
  isLoadingStorage: false,
  isSaving: false,
  saveError: null,
};

// Thunks
export const fetchDataDirectory = createAsyncThunk(
  'dataDirectory/fetchDataDirectory',
  async (_, { rejectWithValue }) => {
    try {
      const path = await window.electronAPI.dataDirectory.get();
      return { path };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const validatePath = createAsyncThunk(
  'dataDirectory/validatePath',
  async (path: string, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.dataDirectory.validate(path);
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

const dataDirectorySlice = createSlice({
  name: 'dataDirectory',
  initialState,
  reducers: {
    setPath: (state, action: PayloadAction<string>) => {
      state.path = action.payload;
      // Reset validation when path changes
      state.isValid = false;
      state.validationMessage = '';
      state.validationWarnings = undefined;
    },
    setValidation: (state, action: PayloadAction<ValidationResult>) => {
      state.isValid = action.payload.isValid;
      state.validationMessage = action.payload.message;
      state.validationWarnings = action.payload.warnings;
    },
    setStorageInfo: (state, action: PayloadAction<StorageInfo | null>) => {
      state.storageInfo = action.payload;
      state.isLoadingStorage = false;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setLoadingStorage: (state, action: PayloadAction<boolean>) => {
      state.isLoadingStorage = action.payload;
    },
    setSaving: (state, action: PayloadAction<boolean>) => {
      state.isSaving = action.payload;
      state.saveError = null;
    },
    setSaveError: (state, action: PayloadAction<string | null>) => {
      state.saveError = action.payload;
      state.isSaving = false;
    },
    clearErrors: (state) => {
      state.saveError = null;
    },
  },
  extraReducers: (builder) => {
    // fetchDataDirectory
    builder.addCase(fetchDataDirectory.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(fetchDataDirectory.fulfilled, (state, action) => {
      state.isLoading = false;
      state.path = action.payload.path;
    });
    builder.addCase(fetchDataDirectory.rejected, (state) => {
      state.isLoading = false;
    });
    // validatePath
    builder.addCase(validatePath.pending, (state) => {
      state.isValid = false;
      state.validationMessage = '';
      state.validationWarnings = undefined;
    });
    builder.addCase(validatePath.fulfilled, (state, action) => {
      if (action.payload) {
        state.isValid = action.payload.isValid;
        state.validationMessage = action.payload.message;
        state.validationWarnings = action.payload.warnings;
      }
    });
    builder.addCase(validatePath.rejected, (state) => {
      state.isValid = false;
      state.validationMessage = 'Validation failed';
    });
  },
});

export const saveDataDirectory = createAsyncThunk(
  'dataDirectory/saveDataDirectory',
  async (path: string, { dispatch, rejectWithValue }) => {
    try {
      dispatch(dataDirectorySlice.actions.setSaving(true));

      const result = await window.electronAPI.dataDirectory.set(path);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save data directory');
      }

      // Reload data directory to update UI state
      await dispatch(fetchDataDirectory());

      // Clear saving state after successful save
      dispatch(dataDirectorySlice.actions.setSaving(false));

      return { path };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dispatch(dataDirectorySlice.actions.setSaveError(errorMessage));
      dispatch(dataDirectorySlice.actions.setSaving(false));
      return rejectWithValue(errorMessage);
    }
  }
);

export const fetchStorageInfo = createAsyncThunk(
  'dataDirectory/fetchStorageInfo',
  async (_, { dispatch }) => {
    try {
      dispatch(dataDirectorySlice.actions.setLoadingStorage(true));

      // Get current path for storage info
      const currentPath = await window.electronAPI.dataDirectory.get();
      const storageInfo = await window.electronAPI.dataDirectory.getStorageInfo(currentPath);

      dispatch(dataDirectorySlice.actions.setStorageInfo(storageInfo));
      return storageInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dispatch(dataDirectorySlice.actions.setSaveError(errorMessage));
      throw error;
    }
  }
);

export const restoreDefaultDataDirectory = createAsyncThunk(
  'dataDirectory/restoreDefault',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      dispatch(dataDirectorySlice.actions.setSaving(true));

      const result = await window.electronAPI.dataDirectory.restoreDefault();

      if (!result.success) {
        throw new Error(result.error || 'Failed to restore default data directory');
      }

      // Reload data directory to update UI state
      const newPath = await window.electronAPI.dataDirectory.get();
      dispatch(dataDirectorySlice.actions.setPath(newPath));
      dispatch(dataDirectorySlice.actions.setValidation({
        isValid: true,
        message: 'Default path restored',
      }));

      // Clear saving state after successful restore
      dispatch(dataDirectorySlice.actions.setSaving(false));

      return { path: result.path };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dispatch(dataDirectorySlice.actions.setSaveError(errorMessage));
      dispatch(dataDirectorySlice.actions.setSaving(false));
      return rejectWithValue(errorMessage);
    }
  }
);

export const {
  setPath,
  setValidation,
  setStorageInfo,
  setLoading,
  setLoadingStorage,
  setSaving,
  setSaveError,
  clearErrors,
} = dataDirectorySlice.actions;

// Selectors
export const selectDataDirectoryPath = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.path;

export const selectDataDirectoryIsValid = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.isValid;

export const selectDataDirectoryValidationMessage = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.validationMessage;

export const selectDataDirectoryValidationWarnings = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.validationWarnings;

export const selectDataDirectoryStorageInfo = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.storageInfo;

export const selectDataDirectoryIsLoading = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.isLoading;

export const selectDataDirectoryIsLoadingStorage = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.isLoadingStorage;

export const selectDataDirectoryIsSaving = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.isSaving;

export const selectDataDirectorySaveError = (state: { dataDirectory: DataDirectoryState }) =>
  state.dataDirectory.saveError;

export default dataDirectorySlice.reducer;
