import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ViewType = 'system' | 'web' | 'version';

export interface ViewState {
  currentView: ViewType;
  isViewSwitching: boolean;
  webServiceUrl: string | null;
  previousView: ViewType | null;
}

const initialState: ViewState = {
  currentView: 'system',
  isViewSwitching: false,
  webServiceUrl: null,
  previousView: null,
};

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    switchView: (state, action: PayloadAction<ViewType>) => {
      // Store current view as previous before switching
      if (state.currentView !== action.payload) {
        state.previousView = state.currentView;
        state.currentView = action.payload;
      }
    },
    updateWebServiceUrl: (state, action: PayloadAction<string>) => {
      state.webServiceUrl = action.payload;
    },
    setViewSwitching: (state, action: PayloadAction<boolean>) => {
      state.isViewSwitching = action.payload;
    },
    resetView: (state) => {
      state.currentView = 'system';
      state.previousView = null;
      state.isViewSwitching = false;
      state.webServiceUrl = null;
    },
  },
});

export const { switchView, updateWebServiceUrl, setViewSwitching, resetView } = viewSlice.actions;
export default viewSlice.reducer;
