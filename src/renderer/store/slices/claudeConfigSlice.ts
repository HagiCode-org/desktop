import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AgentCliType } from '../../../types/agent-cli';

interface ClaudeConfigState {
  isValid: boolean;
  provider: string | null;
  source: string | null;
}

const initialState: ClaudeConfigState = {
  isValid: false,
  provider: null,
  source: null,
};

/**
 * Legacy Claude Config Slice
 * Kept for backward compatibility with LlmInstallation component
 * This slice will be removed once LlmInstallation is refactored to use AgentCliSlice
 */
const claudeConfigSlice = createSlice({
  name: 'claudeConfig',
  initialState,
  reducers: {
    setClaudeConfig: (state, action: PayloadAction<{ isValid: boolean; provider?: string | null; source?: string | null }>) => {
      state.isValid = action.payload.isValid;
      state.provider = action.payload.provider ?? null;
      state.source = action.payload.source ?? null;
    },
    resetClaudeConfig: () => initialState,
  },
});

export const { setClaudeConfig, resetClaudeConfig } = claudeConfigSlice.actions;

// Selectors
export const selectClaudeConfigState = (state: { claudeConfig: ClaudeConfigState }) => state.claudeConfig;
export const selectClaudeConfigIsValid = (state: { claudeConfig: ClaudeConfigState }) => state.claudeConfig.isValid;
export const selectClaudeConfigProvider = (state: { claudeConfig: ClaudeConfigState }) => state.claudeConfig.provider;
export const selectClaudeConfigSource = (state: { claudeConfig: ClaudeConfigState }) => state.claudeConfig.source;

export default claudeConfigSlice.reducer;
