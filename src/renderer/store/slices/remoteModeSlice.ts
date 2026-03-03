import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';

/**
 * Remote mode configuration interface
 */
export interface RemoteModeConfig {
  enabled: boolean;
  url: string;
}

/**
 * Remote mode state
 */
export interface RemoteModeState {
  enabled: boolean;
  url: string;
  isValid: boolean;
  isConnecting: boolean;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;
}

const initialState: RemoteModeState = {
  enabled: false,
  url: '',
  isValid: true,
  isConnecting: false,
  isLoading: false,
  isSaving: false,
  saveError: null,
};

// Thunks
export const fetchRemoteMode = createAsyncThunk(
  'remoteMode/fetchRemoteMode',
  async (_, { rejectWithValue }) => {
    try {
      const config = await window.electronAPI.remoteMode.get();
      return config;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const validateRemoteUrl = createAsyncThunk(
  'remoteMode/validateUrl',
  async (url: string, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.remoteMode.validateUrl(url);
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

const remoteModeSlice = createSlice({
  name: 'remoteMode',
  initialState,
  reducers: {
    setRemoteModeEnabled: (state, action: PayloadAction<boolean>) => {
      state.enabled = action.payload;
    },
    setRemoteModeUrl: (state, action: PayloadAction<string>) => {
      state.url = action.payload;
      // Reset validation when URL changes
      state.isValid = false;
    },
    setRemoteModeValid: (state, action: PayloadAction<boolean>) => {
      state.isValid = action.payload;
    },
    setConnecting: (state, action: PayloadAction<boolean>) => {
      state.isConnecting = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
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
    // fetchRemoteMode
    builder.addCase(fetchRemoteMode.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(fetchRemoteMode.fulfilled, (state, action) => {
      state.isLoading = false;
      state.enabled = action.payload.enabled;
      state.url = action.payload.url;
    });
    builder.addCase(fetchRemoteMode.rejected, (state) => {
      state.isLoading = false;
    });
    // validateRemoteUrl
    builder.addCase(validateRemoteUrl.pending, (state) => {
      state.isValid = false;
    });
    builder.addCase(validateRemoteUrl.fulfilled, (state, action) => {
      state.isValid = action.payload.isValid;
    });
    builder.addCase(validateRemoteUrl.rejected, (state) => {
      state.isValid = false;
    });
  },
});

export const saveRemoteMode = createAsyncThunk(
  'remoteMode/saveRemoteMode',
  async ({ enabled, url }: RemoteModeConfig, { dispatch, rejectWithValue }) => {
    try {
      dispatch(remoteModeSlice.actions.setSaving(true));

      const result = await window.electronAPI.remoteMode.set(enabled, url);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save remote mode configuration');
      }

      // Reload remote mode to update UI state
      await dispatch(fetchRemoteMode());

      // Clear saving state after successful save
      dispatch(remoteModeSlice.actions.setSaving(false));

      return { enabled, url };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dispatch(remoteModeSlice.actions.setSaveError(errorMessage));
      dispatch(remoteModeSlice.actions.setSaving(false));
      return rejectWithValue(errorMessage);
    }
  }
);

export const {
  setRemoteModeEnabled,
  setRemoteModeUrl,
  setRemoteModeValid,
  setConnecting,
  setLoading,
  setSaving,
  setSaveError,
  clearErrors,
} = remoteModeSlice.actions;

// Selectors
export const selectRemoteModeEnabled = (state: { remoteMode: RemoteModeState }) =>
  state.remoteMode.enabled;

export const selectRemoteModeUrl = (state: { remoteMode: RemoteModeState }) =>
  state.remoteMode.url;

export const selectRemoteModeIsValid = (state: { remoteMode: RemoteModeState }) =>
  state.remoteMode.isValid;

export const selectRemoteModeIsConnecting = (state: { remoteMode: RemoteModeState }) =>
  state.remoteMode.isConnecting;

export const selectRemoteModeIsLoading = (state: { remoteMode: RemoteModeState }) =>
  state.remoteMode.isLoading;

export const selectRemoteModeIsSaving = (state: { remoteMode: RemoteModeState }) =>
  state.remoteMode.isSaving;

export const selectRemoteModeSaveError = (state: { remoteMode: RemoteModeState }) =>
  state.remoteMode.saveError;

export default remoteModeSlice.reducer;