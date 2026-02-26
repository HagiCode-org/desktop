import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AgentCliType, CliDetectionResult } from '../../../types/agent-cli';

interface AgentCliState {
  selectedCliType: AgentCliType | null;
  isSkipped: boolean;
  cliDetected: boolean;
  isDetecting: boolean;
  error: string | null;
}

const initialState: AgentCliState = {
  selectedCliType: null,
  isSkipped: false,
  cliDetected: false,
  isDetecting: false,
  error: null,
};

const agentCliSlice = createSlice({
  name: 'agentCli',
  initialState,
  reducers: {
    selectAgentCli: (state, action: PayloadAction<AgentCliType>) => {
      state.selectedCliType = action.payload;
      state.isSkipped = false;
      state.error = null;
    },
    skipAgentCli: (state) => {
      state.selectedCliType = null;
      state.isSkipped = true;
    },
    setDetectionResult: (state, action: PayloadAction<CliDetectionResult>) => {
      state.cliDetected = action.payload.detected;
      state.isDetecting = false;
    },
    startDetection: (state) => {
      state.isDetecting = true;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isDetecting = false;
    },
    resetAgentCliState: () => initialState,
  },
});

export const {
  selectAgentCli,
  skipAgentCli,
  setDetectionResult,
  startDetection,
  setError,
  resetAgentCliState,
} = agentCliSlice.actions;

export default agentCliSlice.reducer;

// Selectors
export const selectAgentCliState = (state: { agentCli: AgentCliState }) => state.agentCli;
export const selectSelectedCliType = (state: { agentCli: AgentCliState }) => state.agentCli.selectedCliType;
export const selectIsSkipped = (state: { agentCli: AgentCliState }) => state.agentCli.isSkipped;
export const selectCliDetected = (state: { agentCli: AgentCliState }) => state.agentCli.cliDetected;
export const selectIsDetecting = (state: { agentCli: AgentCliState }) => state.agentCli.isDetecting;
export const selectAgentCliError = (state: { agentCli: AgentCliState }) => state.agentCli.error;

// Computed selector: can proceed to next step
export const selectCanProceed = (state: { agentCli: AgentCliState }) => {
  const { selectedCliType, isSkipped } = state.agentCli;
  return selectedCliType !== null || isSkipped;
};
