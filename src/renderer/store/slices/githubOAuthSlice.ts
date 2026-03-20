import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface GitHubOAuthConfigPayload {
  clientId: string;
  clientSecret: string;
  lastUpdated: string | null;
  isConfigured: boolean;
  requiresRestart: boolean;
}

export interface GitHubOAuthState extends GitHubOAuthConfigPayload {
  savedClientId: string;
  savedClientSecret: string;
  isLoading: boolean;
  isSaving: boolean;
  isClearing: boolean;
  isInitialized: boolean;
  isSecretVisible: boolean;
  saveError: string | null;
  fieldErrors: {
    clientId?: string;
    clientSecret?: string;
  };
}

const initialConfig: GitHubOAuthConfigPayload = {
  clientId: '',
  clientSecret: '',
  lastUpdated: null,
  isConfigured: false,
  requiresRestart: false,
};

const initialState: GitHubOAuthState = {
  ...initialConfig,
  savedClientId: '',
  savedClientSecret: '',
  isLoading: false,
  isSaving: false,
  isClearing: false,
  isInitialized: false,
  isSecretVisible: false,
  saveError: null,
  fieldErrors: {},
};

function validateFields(clientId: string, clientSecret: string): GitHubOAuthState['fieldErrors'] {
  const errors: GitHubOAuthState['fieldErrors'] = {};

  if (!clientId.trim()) {
    errors.clientId = 'clientIdRequired';
  }

  if (!clientSecret.trim()) {
    errors.clientSecret = 'clientSecretRequired';
  }

  return errors;
}

function applyLoadedConfig(state: GitHubOAuthState, payload: GitHubOAuthConfigPayload): void {
  state.clientId = payload.clientId;
  state.clientSecret = payload.clientSecret;
  state.savedClientId = payload.clientId;
  state.savedClientSecret = payload.clientSecret;
  state.lastUpdated = payload.lastUpdated;
  state.isConfigured = payload.isConfigured;
  state.requiresRestart = payload.requiresRestart;
  state.isSecretVisible = false;
  state.saveError = null;
  state.fieldErrors = {};
  state.isInitialized = true;
}

export const fetchGitHubOAuthConfig = createAsyncThunk<
  GitHubOAuthConfigPayload,
  void,
  { rejectValue: string }
>('githubOAuth/fetch', async (_, { rejectWithValue }) => {
  try {
    return await window.electronAPI.githubOAuth.get();
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : String(error));
  }
});

export const saveGitHubOAuthConfig = createAsyncThunk<
  GitHubOAuthConfigPayload,
  void,
  { state: { githubOAuth: GitHubOAuthState }; rejectValue: string }
>('githubOAuth/save', async (_, { getState, rejectWithValue }) => {
  const state = getState().githubOAuth;
  const fieldErrors = validateFields(state.clientId, state.clientSecret);

  if (Object.keys(fieldErrors).length > 0) {
    return rejectWithValue('validation');
  }

  try {
    const result = await window.electronAPI.githubOAuth.set({
      clientId: state.clientId.trim(),
      clientSecret: state.clientSecret.trim(),
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to save GitHub OAuth configuration');
    }

    return result.config;
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : String(error));
  }
});

export const clearGitHubOAuthConfig = createAsyncThunk<
  GitHubOAuthConfigPayload,
  void,
  { rejectValue: string }
>('githubOAuth/clear', async (_, { rejectWithValue }) => {
  try {
    const result = await window.electronAPI.githubOAuth.clear();
    if (!result.success) {
      throw new Error(result.error || 'Failed to clear GitHub OAuth configuration');
    }
    return result.config;
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : String(error));
  }
});

const githubOAuthSlice = createSlice({
  name: 'githubOAuth',
  initialState,
  reducers: {
    setClientId: (state, action: PayloadAction<string>) => {
      state.clientId = action.payload;
      delete state.fieldErrors.clientId;
      state.saveError = null;
    },
    setClientSecret: (state, action: PayloadAction<string>) => {
      state.clientSecret = action.payload;
      delete state.fieldErrors.clientSecret;
      state.saveError = null;
    },
    resetGitHubOAuthForm: (state) => {
      state.clientId = state.savedClientId;
      state.clientSecret = state.savedClientSecret;
      state.isSecretVisible = false;
      state.saveError = null;
      state.fieldErrors = {};
    },
    toggleSecretVisibility: (state) => {
      state.isSecretVisible = !state.isSecretVisible;
    },
    clearGitHubOAuthErrors: (state) => {
      state.saveError = null;
      state.fieldErrors = {};
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchGitHubOAuthConfig.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(fetchGitHubOAuthConfig.fulfilled, (state, action) => {
      state.isLoading = false;
      applyLoadedConfig(state, action.payload);
    });
    builder.addCase(fetchGitHubOAuthConfig.rejected, (state, action) => {
      state.isLoading = false;
      state.isInitialized = true;
      state.saveError = action.payload || 'Failed to load GitHub OAuth configuration';
    });

    builder.addCase(saveGitHubOAuthConfig.pending, (state) => {
      state.isSaving = true;
      state.saveError = null;
      state.fieldErrors = validateFields(state.clientId, state.clientSecret);
    });
    builder.addCase(saveGitHubOAuthConfig.fulfilled, (state, action) => {
      state.isSaving = false;
      applyLoadedConfig(state, action.payload);
    });
    builder.addCase(saveGitHubOAuthConfig.rejected, (state, action) => {
      state.isSaving = false;
      const fieldErrors = validateFields(state.clientId, state.clientSecret);
      state.fieldErrors = fieldErrors;
      state.saveError = action.payload === 'validation'
        ? null
        : action.payload || 'Failed to save GitHub OAuth configuration';
    });

    builder.addCase(clearGitHubOAuthConfig.pending, (state) => {
      state.isClearing = true;
      state.saveError = null;
      state.fieldErrors = {};
    });
    builder.addCase(clearGitHubOAuthConfig.fulfilled, (state, action) => {
      state.isClearing = false;
      applyLoadedConfig(state, action.payload);
    });
    builder.addCase(clearGitHubOAuthConfig.rejected, (state, action) => {
      state.isClearing = false;
      state.saveError = action.payload || 'Failed to clear GitHub OAuth configuration';
    });
  },
});

export const {
  setClientId,
  setClientSecret,
  resetGitHubOAuthForm,
  toggleSecretVisibility,
  clearGitHubOAuthErrors,
} = githubOAuthSlice.actions;

export const selectGitHubOAuthState = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth;
export const selectGitHubOAuthClientId = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.clientId;
export const selectGitHubOAuthClientSecret = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.clientSecret;
export const selectGitHubOAuthIsLoading = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.isLoading;
export const selectGitHubOAuthIsSaving = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.isSaving;
export const selectGitHubOAuthIsClearing = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.isClearing;
export const selectGitHubOAuthIsSecretVisible = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.isSecretVisible;
export const selectGitHubOAuthRequiresRestart = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.requiresRestart;
export const selectGitHubOAuthLastUpdated = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.lastUpdated;
export const selectGitHubOAuthSaveError = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.saveError;
export const selectGitHubOAuthFieldErrors = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.fieldErrors;
export const selectGitHubOAuthIsConfigured = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.isConfigured;
export const selectGitHubOAuthIsInitialized = (state: { githubOAuth: GitHubOAuthState }) => state.githubOAuth.isInitialized;
export const selectGitHubOAuthIsDirty = (state: { githubOAuth: GitHubOAuthState }) =>
  state.githubOAuth.clientId !== state.githubOAuth.savedClientId
  || state.githubOAuth.clientSecret !== state.githubOAuth.savedClientSecret;

export default githubOAuthSlice.reducer;
