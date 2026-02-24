import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { ClaudeConfigFormState, DetectedConfig, ValidationResult, CliVerificationResult } from '../../../types/claude-config';

const initialState: ClaudeConfigFormState = {
  provider: 'zhipu',
  apiKey: '',
  endpoint: 'https://open.bigmodel.cn/api/anthropic',
  isValidating: false,
  isValid: false,
  validationError: null,
  cliStatus: null,
  showExistingConfig: false,
  useExistingConfig: false,
};

/**
 * Detect existing Claude configuration
 */
export const detectExistingConfig = createAsyncThunk(
  'claudeConfig/detectExistingConfig',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.claudeDetect();
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

/**
 * Validate API key with selected provider
 */
export const validateApiKey = createAsyncThunk(
  'claudeConfig/validateApiKey',
  async ({ provider, apiKey, endpoint }: { provider: string; apiKey: string; endpoint?: string }, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.claudeValidate(provider, apiKey, endpoint);
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

/**
 * Verify Claude CLI installation
 */
export const verifyCliInstallation = createAsyncThunk(
  'claudeConfig/verifyCliInstallation',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.claudeVerifyCli();
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

/**
 * Save Claude configuration
 */
export const saveClaudeConfig = createAsyncThunk(
  'claudeConfig/saveConfig',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { claudeConfig: ClaudeConfigFormState };
      const { provider, apiKey, endpoint, cliStatus } = state.claudeConfig;

      const config = {
        provider,
        apiKey,
        endpoint: endpoint || undefined,
        cliVersion: cliStatus?.version,
        cliAvailable: cliStatus?.installed,
        lastValidationStatus: 'success' as const,
      };

      const result = await window.electronAPI.claudeSave(config);
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const claudeConfigSlice = createSlice({
  name: 'claudeConfig',
  initialState,
  reducers: {
    setProvider: (state, action: PayloadAction<'anthropic' | 'zhipu' | 'aliyun' | 'custom'>) => {
      state.provider = action.payload;
      state.isValid = false;
      state.validationError = null;
    },
    setApiKey: (state, action: PayloadAction<string>) => {
      state.apiKey = action.payload;
      state.isValid = false;
      state.validationError = null;
    },
    setEndpoint: (state, action: PayloadAction<string>) => {
      state.endpoint = action.payload;
      state.isValid = false;
      state.validationError = null;
    },
    setShowExistingConfig: (state, action: PayloadAction<boolean>) => {
      state.showExistingConfig = action.payload;
    },
    setUseExistingConfig: (state, action: PayloadAction<boolean>) => {
      state.useExistingConfig = action.payload;
    },
    clearValidationError: (state) => {
      state.validationError = null;
    },
    resetForm: (state) => {
      return { ...initialState };
    },
  },
  extraReducers: (builder) => {
    // detectExistingConfig
    builder
      .addCase(detectExistingConfig.pending, (state) => {
        console.log('[claudeConfigSlice] detectExistingConfig pending');
      })
      .addCase(detectExistingConfig.fulfilled, (state, action) => {
        console.log('[claudeConfigSlice] detectExistingConfig fulfilled:', action.payload);
        if (action.payload.exists) {
          state.showExistingConfig = true;
          if (action.payload.provider) {
            state.provider = action.payload.provider;
          }
          if (action.payload.apiKey) {
            state.apiKey = action.payload.apiKey;
          }
          if (action.payload.endpoint) {
            state.endpoint = action.payload.endpoint;
          }
          if (action.payload.cliVersion) {
            state.cliStatus = {
              installed: true,
              version: action.payload.cliVersion,
            };
          }
        }
      })
      .addCase(detectExistingConfig.rejected, (state, action) => {
        console.error('[claudeConfigSlice] detectExistingConfig rejected:', action.payload);
      });

    // validateApiKey
    builder
      .addCase(validateApiKey.pending, (state) => {
        state.isValidating = true;
        state.validationError = null;
        console.log('[claudeConfigSlice] validateApiKey pending');
      })
      .addCase(validateApiKey.fulfilled, (state, action) => {
        state.isValidating = false;
        console.log('[claudeConfigSlice] validateApiKey fulfilled:', action.payload);
        if (action.payload.success) {
          state.isValid = true;
          state.validationError = null;
        } else {
          state.isValid = false;
          state.validationError = action.payload.error || '验证失败';
        }
      })
      .addCase(validateApiKey.rejected, (state, action) => {
        state.isValidating = false;
        state.isValid = false;
        state.validationError = action.payload as string || '验证失败';
        console.error('[claudeConfigSlice] validateApiKey rejected:', action.payload);
      });

    // verifyCliInstallation
    builder
      .addCase(verifyCliInstallation.pending, (state) => {
        console.log('[claudeConfigSlice] verifyCliInstallation pending');
      })
      .addCase(verifyCliInstallation.fulfilled, (state, action) => {
        console.log('[claudeConfigSlice] verifyCliInstallation fulfilled:', action.payload);
        state.cliStatus = action.payload;
      })
      .addCase(verifyCliInstallation.rejected, (state, action) => {
        console.error('[claudeConfigSlice] verifyCliInstallation rejected:', action.payload);
        state.cliStatus = {
          installed: false,
          error: action.payload as string || 'CLI 验证失败',
        };
      });

    // saveClaudeConfig
    builder
      .addCase(saveClaudeConfig.pending, (state) => {
        console.log('[claudeConfigSlice] saveClaudeConfig pending');
      })
      .addCase(saveClaudeConfig.fulfilled, (state, action) => {
        console.log('[claudeConfigSlice] saveClaudeConfig fulfilled:', action.payload);
        if (action.payload.success) {
          // Configuration saved successfully
        }
      })
      .addCase(saveClaudeConfig.rejected, (state, action) => {
        console.error('[claudeConfigSlice] saveClaudeConfig rejected:', action.payload);
        state.validationError = action.payload as string || '保存失败';
      });
  },
});

// Export actions
export const {
  setProvider,
  setApiKey,
  setEndpoint,
  setShowExistingConfig,
  setUseExistingConfig,
  clearValidationError,
  resetForm,
} = claudeConfigSlice.actions;

// Selectors
export const selectClaudeConfigState = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig;
export const selectProvider = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.provider;
export const selectApiKey = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.apiKey;
export const selectEndpoint = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.endpoint;
export const selectIsValidating = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.isValidating;
export const selectIsValid = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.isValid;
export const selectValidationError = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.validationError;
export const selectCliStatus = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.cliStatus;
export const selectShowExistingConfig = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.showExistingConfig;
export const selectUseExistingConfig = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.useExistingConfig;

// Computed selector: can proceed to next step
export const selectCanProceed = (state: { claudeConfig: ClaudeConfigFormState }) => {
  const { isValid, useExistingConfig } = state.claudeConfig;
  return isValid || useExistingConfig;
};

export default claudeConfigSlice.reducer;