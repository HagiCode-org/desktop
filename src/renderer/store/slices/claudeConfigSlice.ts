import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { ClaudeConfigFormState, DetectedConfig, ValidationResult, CliVerificationResult } from '../../../types/claude-config';
import type { PresetIndex, ProviderPreset, LoadingState } from '../../../types/preset';

// Preset state
interface PresetState {
  data: PresetIndex | null;
  status: LoadingState;
  lastUpdated: string | null;
  error: string | null;
  source: 'cache' | 'remote' | 'bundle' | 'fallback' | null;
}

const initialState: ClaudeConfigFormState = {
  provider: 'zai',
  apiKey: '',
  endpoint: 'https://open.bigmodel.cn/api/anthropic',
  isValidating: false,
  isValid: false,
  validationError: null,
  cliStatus: null,
  showExistingConfig: false,
  useExistingConfig: false,
  hasChanges: false,
  modelHaiku: '',
  modelSonnet: '',
  modelOpus: '',
  presets: {
    data: null,
    status: 'idle',
    lastUpdated: null,
    error: null,
    source: null,
  },
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
      const { provider, apiKey, endpoint, cliStatus, modelHaiku, modelSonnet, modelOpus } = state.claudeConfig;

      const config = {
        provider,
        apiKey,
        endpoint: endpoint || undefined,
        cliVersion: cliStatus?.version,
        cliAvailable: cliStatus?.installed,
        lastValidationStatus: 'success' as const,
        modelHaiku: modelHaiku || undefined,
        modelSonnet: modelSonnet || undefined,
        modelOpus: modelOpus || undefined,
      };

      const result = await window.electronAPI.claudeSave(config);
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

/**
 * Fetch presets from remote source
 */
export const fetchPreset = createAsyncThunk(
  'claudeConfig/fetchPreset',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.presetFetch();
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

/**
 * Refresh presets from remote source
 */
export const refreshPreset = createAsyncThunk(
  'claudeConfig/refreshPreset',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.presetRefresh();
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

/**
 * Clear preset cache
 */
export const clearPresetCache = createAsyncThunk(
  'claudeConfig/clearPresetCache',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.presetClearCache();
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
    setProvider: (state, action: PayloadAction<'anthropic' | 'zai' | 'aliyun' | 'minimax' | 'custom'>) => {
      state.provider = action.payload;
      state.isValid = false;
      state.validationError = null;
      state.hasChanges = true;
    },
    setApiKey: (state, action: PayloadAction<string>) => {
      state.apiKey = action.payload;
      state.isValid = false;
      state.validationError = null;
      state.hasChanges = true;
    },
    setEndpoint: (state, action: PayloadAction<string>) => {
      state.endpoint = action.payload;
      state.isValid = false;
      state.validationError = null;
      state.hasChanges = true;
    },
    setModelHaiku: (state, action: PayloadAction<string>) => {
      state.modelHaiku = action.payload;
      state.hasChanges = true;
    },
    setModelSonnet: (state, action: PayloadAction<string>) => {
      state.modelSonnet = action.payload;
      state.hasChanges = true;
    },
    setModelOpus: (state, action: PayloadAction<string>) => {
      state.modelOpus = action.payload;
      state.hasChanges = true;
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
    // Preset reducers
    setPresetData: (state, action: PayloadAction<PresetIndex | null>) => {
      state.presets.data = action.payload;
      state.presets.lastUpdated = new Date().toISOString();
    },
    setPresetStatus: (state, action: PayloadAction<LoadingState>) => {
      state.presets.status = action.payload;
    },
    setPresetError: (state, action: PayloadAction<string | null>) => {
      state.presets.error = action.payload;
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
          // User hasn't made changes yet to the loaded config
          state.hasChanges = false;
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
          // Load model mappings if available
          if (action.payload.modelHaiku) {
            state.modelHaiku = action.payload.modelHaiku;
          }
          if (action.payload.modelSonnet) {
            state.modelSonnet = action.payload.modelSonnet;
          }
          if (action.payload.modelOpus) {
            state.modelOpus = action.payload.modelOpus;
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

    // fetchPreset
    builder
      .addCase(fetchPreset.pending, (state) => {
        state.presets.status = 'loading';
        state.presets.error = null;
        console.log('[claudeConfigSlice] fetchPreset pending');
      })
      .addCase(fetchPreset.fulfilled, (state, action) => {
        console.log('[claudeConfigSlice] fetchPreset fulfilled:', action.payload);
        if (action.payload.success && action.payload.data) {
          state.presets.data = action.payload.data;
          state.presets.status = 'success';
          state.presets.lastUpdated = new Date().toISOString();
          state.presets.source = action.payload.source || 'fallback';
        } else {
          state.presets.status = 'error';
          state.presets.error = action.payload.error || 'Failed to fetch presets';
          state.presets.source = 'fallback';
        }
      })
      .addCase(fetchPreset.rejected, (state, action) => {
        console.error('[claudeConfigSlice] fetchPreset rejected:', action.payload);
        state.presets.status = 'error';
        state.presets.error = action.payload as string || 'Failed to fetch presets';
      });

    // refreshPreset
    builder
      .addCase(refreshPreset.pending, (state) => {
        state.presets.status = 'loading';
        console.log('[claudeConfigSlice] refreshPreset pending');
      })
      .addCase(refreshPreset.fulfilled, (state, action) => {
        console.log('[claudeConfigSlice] refreshPreset fulfilled:', action.payload);
        if (action.payload.success && action.payload.data) {
          state.presets.data = action.payload.data;
          state.presets.status = 'success';
          state.presets.lastUpdated = new Date().toISOString();
        } else {
          state.presets.status = 'error';
          state.presets.error = action.payload.error || 'Failed to refresh presets';
        }
      })
      .addCase(refreshPreset.rejected, (state, action) => {
        console.error('[claudeConfigSlice] refreshPreset rejected:', action.payload);
        state.presets.status = 'error';
        state.presets.error = action.payload as string || 'Failed to refresh presets';
      });

    // clearPresetCache
    builder
      .addCase(clearPresetCache.pending, (state) => {
        console.log('[claudeConfigSlice] clearPresetCache pending');
      })
      .addCase(clearPresetCache.fulfilled, (state, action) => {
        console.log('[claudeConfigSlice] clearPresetCache fulfilled:', action.payload);
        if (action.payload.success) {
          state.presets.lastUpdated = new Date().toISOString();
        }
      })
      .addCase(clearPresetCache.rejected, (state, action) => {
        console.error('[claudeConfigSlice] clearPresetCache rejected:', action.payload);
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
  setModelHaiku,
  setModelSonnet,
  setModelOpus,
  setShowExistingConfig,
  setUseExistingConfig,
  clearValidationError,
  resetForm,
  setPresetData,
  setPresetStatus,
  setPresetError,
} = claudeConfigSlice.actions;

// Selectors
export const selectClaudeConfigState = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig;
export const selectProvider = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.provider;
export const selectApiKey = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.apiKey;
export const selectEndpoint = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.endpoint;
export const selectModelHaiku = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.modelHaiku;
export const selectModelSonnet = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.modelSonnet;
export const selectModelOpus = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.modelOpus;
export const selectIsValidating = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.isValidating;
export const selectIsValid = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.isValid;
export const selectValidationError = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.validationError;
export const selectCliStatus = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.cliStatus;
export const selectShowExistingConfig = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.showExistingConfig;
export const selectUseExistingConfig = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.useExistingConfig;
export const selectHasChanges = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.hasChanges;

// Computed selector: can proceed to next step
export const selectCanProceed = (state: { claudeConfig: ClaudeConfigFormState }) => {
  const { isValid, useExistingConfig, hasChanges, showExistingConfig } = state.claudeConfig;
  // If there's existing config and user hasn't made changes, can proceed without validation
  if (showExistingConfig && !hasChanges) {
    return true;
  }
  // Otherwise, need valid config or user has made changes
  return isValid || useExistingConfig;
};

// Computed selector: form is complete (all required fields filled)
export const selectIsFormComplete = (state: { claudeConfig: ClaudeConfigFormState }) => {
  const { apiKey, modelHaiku, modelSonnet, modelOpus } = state.claudeConfig;
  return Boolean(
    apiKey && apiKey.trim() !== '' &&
    modelHaiku && modelHaiku.trim() !== '' &&
    modelSonnet && modelSonnet.trim() !== '' &&
    modelOpus && modelOpus.trim() !== ''
  );
};

// Preset selectors
export const selectPreset = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.presets.data;
export const selectPresetStatus = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.presets.status;
export const selectPresetError = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.presets.error;
export const selectPresetLastUpdated = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.presets.lastUpdated;
export const selectPresetSource = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.presets.source;
export const selectIsPresetLoading = (state: { claudeConfig: ClaudeConfigFormState }) => state.claudeConfig.presets.status === 'loading';
export const selectRecommendedProviders = (state: { claudeConfig: ClaudeConfigFormState }) => {
  if (!state.claudeConfig.presets.data?.types?.['claude-code']?.providers) {
    return [];
  }
  return Object.entries(state.claudeConfig.presets.data.types['claude-code'].providers)
    .filter(([_, provider]) => state.claudeConfig.presets.data.types['claude-code'].providers[provider]?.recommended)
    .map(([providerId, _]) => ({
      providerId,
      ...state.claudeConfig.presets.data.types['claude-code'].providers[providerId],
    }))
    .filter(Boolean);
};
export const selectProviderById = (state: { claudeConfig: ClaudeConfigFormState }, providerId: string) => {
  return state.claudeConfig.presets.data?.types?.['claude-code']?.providers?.[providerId] || null;
};

export default claudeConfigSlice.reducer;