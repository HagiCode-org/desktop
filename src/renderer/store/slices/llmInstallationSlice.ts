import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { ClaudeProvider, ConfigSource } from '../../../../types/claude-config';

/**
 * Region type
 */
export type Region = 'CN' | 'INTERNATIONAL';

/**
 * Installation step
 */
export type InstallationStep = 'idle' | 'preparing' | 'calling-api' | 'confirmation' | 'installing' | 'completed' | 'error';

/**
 * LLM Installation state interface
 */
export interface LlmInstallationState {
  currentStep: InstallationStep;
  region: Region;
  // Claude configuration detection state
  claudeConfigDetected: boolean;
  claudeConfigSource: ConfigSource | null;
  claudeProvider: ClaudeProvider | null;
  // Prompt state
  promptLoaded: boolean;
  promptContent: string | null;
  promptVersion: string | null;
  // API call state
  isCallingAPI: boolean;
  callCompleted: boolean;
  error: string | null;
  manifestPath: string | null;
}

/**
 * Initial state
 */
const initialState: LlmInstallationState = {
  currentStep: 'idle',
  region: 'INTERNATIONAL',
  claudeConfigDetected: false,
  claudeConfigSource: null,
  claudeProvider: null,
  promptLoaded: false,
  promptContent: null,
  promptVersion: null,
  isCallingAPI: false,
  callCompleted: false,
  error: null,
  manifestPath: null,
};

/**
 * Async thunks
 */

// Load LLM prompt from manifest
export const loadLlmPrompt = createAsyncThunk(
  'llmInstallation/loadPrompt',
  async (manifestPath: string, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.llmLoadPrompt(manifestPath);
      if (!result.success) {
        return rejectWithValue(result.error || 'Failed to load prompt');
      }
      return {
        content: result.prompt.content,
        version: result.prompt.version,
        region: result.prompt.region,
      };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Call Claude API
export const callClaudeApi = createAsyncThunk(
  'llmInstallation/callApi',
  async (prompt: string, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.llmCallApi(prompt);
      if (!result.success) {
        return rejectWithValue(result.error || 'API call failed');
      }
      return { messageId: result.messageId };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Detect Claude configuration
export const detectClaudeConfig = createAsyncThunk(
  'llmInstallation/detectConfig',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.llmDetectConfig();
      return {
        detected: result.exists,
        source: result.source,
        provider: result.provider || null,
      };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Get region
export const getRegion = createAsyncThunk(
  'llmInstallation/getRegion',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.llmGetRegion();
      return result.region as Region;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

/**
 * LLM Installation Slice
 */
export const llmInstallationSlice = createSlice({
  name: 'llmInstallation',
  initialState,
  reducers: {
    setStep: (state, action: PayloadAction<InstallationStep>) => {
      state.currentStep = action.payload;
    },
    setRegion: (state, action: PayloadAction<Region>) => {
      state.region = action.payload;
    },
    resetState: () => initialState,
    clearError: (state) => {
      state.error = null;
    },
    setManifestPath: (state, action: PayloadAction<string>) => {
      state.manifestPath = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Load prompt
    builder.addCase(loadLlmPrompt.pending, (state) => {
      state.isCallingAPI = true;
      state.error = null;
    });
    builder.addCase(loadLlmPrompt.fulfilled, (state, action) => {
      state.isCallingAPI = false;
      state.promptLoaded = true;
      state.promptContent = action.payload.content;
      state.promptVersion = action.payload.version;
      state.region = action.payload.region;
      state.currentStep = 'preparing';
    });
    builder.addCase(loadLlmPrompt.rejected, (state, action) => {
      state.isCallingAPI = false;
      state.error = action.payload as string;
      state.currentStep = 'error';
    });

    // Call API
    builder.addCase(callClaudeApi.pending, (state) => {
      state.isCallingAPI = true;
      state.error = null;
    });
    builder.addCase(callClaudeApi.fulfilled, (state) => {
      state.isCallingAPI = false;
      state.callCompleted = true;
      state.currentStep = 'confirmation';
    });
    builder.addCase(callClaudeApi.rejected, (state, action) => {
      state.isCallingAPI = false;
      state.error = action.payload as string;
      state.currentStep = 'error';
    });

    // Detect Claude configuration
    builder.addCase(detectClaudeConfig.fulfilled, (state, action) => {
      state.claudeConfigDetected = action.payload.detected;
      state.claudeConfigSource = action.payload.source;
      state.claudeProvider = action.payload.provider;
    });
    builder.addCase(detectClaudeConfig.rejected, (state) => {
      state.claudeConfigDetected = false;
      state.claudeConfigSource = null;
      state.claudeProvider = null;
    });

    // Get region
    builder.addCase(getRegion.fulfilled, (state, action) => {
      if (action.payload) {
        state.region = action.payload;
      }
    });
  },
});

export const {
  setStep,
  setRegion,
  resetState,
  clearError,
  setManifestPath,
} = llmInstallationSlice.actions;

export default llmInstallationSlice.reducer;

/**
 * Selectors
 */
export const selectCurrentStep = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.currentStep;

export const selectRegion = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.region;

export const selectClaudeConfigDetected = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.claudeConfigDetected;

export const selectClaudeConfigSource = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.claudeConfigSource;

export const selectClaudeProvider = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.claudeProvider;

export const selectPromptLoaded = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.promptLoaded;

export const selectPromptContent = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.promptContent;

export const selectPromptVersion = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.promptVersion;

export const selectIsCallingAPI = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.isCallingAPI;

export const selectCallCompleted = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.callCompleted;

export const selectError = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.error;

export const selectManifestPath = (state: { llmInstallation: LlmInstallationState }) =>
  state.llmInstallation.manifestPath;
