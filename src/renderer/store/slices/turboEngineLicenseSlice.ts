import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  TurboEngineEntitlementName,
  TurboEngineLicenseBridge,
  TurboEngineLicensePurchaseResult,
  TurboEngineLicenseSnapshot,
} from '../../../types/turboengine-license.js';

declare global {
  interface Window {
    electronAPI: {
      turboEngineLicense?: TurboEngineLicenseBridge;
    };
  }
}

export interface TurboEngineLicenseState {
  snapshot: TurboEngineLicenseSnapshot | null;
  lastPurchase: TurboEngineLicensePurchaseResult | null;
  isLoading: boolean;
  isStartupVerifying: boolean;
  isRefreshing: boolean;
  isPurchasing: boolean;
  error: string | null;
}

function getTurboEngineLicenseBridge(): TurboEngineLicenseBridge {
  const bridge = window.electronAPI?.turboEngineLicense;
  if (!bridge) {
    throw new Error('TurboEngine license is unavailable in this Desktop runtime.');
  }

  return bridge;
}

export const loadTurboEngineLicenseSnapshot = createAsyncThunk(
  'turboEngineLicense/loadSnapshot',
  async (_, { rejectWithValue }) => {
    try {
      return await getTurboEngineLicenseBridge().getSnapshot();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const verifyTurboEngineLicenseStartup = createAsyncThunk(
  'turboEngineLicense/verifyStartup',
  async (_, { rejectWithValue }) => {
    try {
      return await getTurboEngineLicenseBridge().verifyStartup();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const refreshTurboEngineLicenseSnapshot = createAsyncThunk(
  'turboEngineLicense/refreshSnapshot',
  async (_, { rejectWithValue }) => {
    try {
      return await getTurboEngineLicenseBridge().refresh();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const purchaseTurboEngineLicense = createAsyncThunk(
  'turboEngineLicense/purchase',
  async (_, { rejectWithValue }) => {
    try {
      return await getTurboEngineLicenseBridge().purchase();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

const initialState: TurboEngineLicenseState = {
  snapshot: null,
  lastPurchase: null,
  isLoading: false,
  isStartupVerifying: false,
  isRefreshing: false,
  isPurchasing: false,
  error: null,
};

const turboEngineLicenseSlice = createSlice({
  name: 'turboEngineLicense',
  initialState,
  reducers: {
    setTurboEngineLicenseSnapshotFromEvent(state, action: PayloadAction<TurboEngineLicenseSnapshot>) {
      state.snapshot = action.payload;
      state.error = null;
    },
    clearTurboEngineLicensePurchaseResult(state) {
      state.lastPurchase = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTurboEngineLicenseSnapshot.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadTurboEngineLicenseSnapshot.fulfilled, (state, action) => {
        state.isLoading = false;
        state.snapshot = action.payload;
      })
      .addCase(loadTurboEngineLicenseSnapshot.rejected, (state, action) => {
        state.isLoading = false;
        state.error = typeof action.payload === 'string' ? action.payload : 'load-failed';
      })
      .addCase(verifyTurboEngineLicenseStartup.pending, (state) => {
        state.isStartupVerifying = true;
        state.error = null;
      })
      .addCase(verifyTurboEngineLicenseStartup.fulfilled, (state, action) => {
        state.isStartupVerifying = false;
        state.snapshot = action.payload;
      })
      .addCase(verifyTurboEngineLicenseStartup.rejected, (state, action) => {
        state.isStartupVerifying = false;
        state.error = typeof action.payload === 'string' ? action.payload : 'verify-startup-failed';
      })
      .addCase(refreshTurboEngineLicenseSnapshot.pending, (state) => {
        state.isRefreshing = true;
        state.error = null;
      })
      .addCase(refreshTurboEngineLicenseSnapshot.fulfilled, (state, action) => {
        state.isRefreshing = false;
        state.snapshot = action.payload;
      })
      .addCase(refreshTurboEngineLicenseSnapshot.rejected, (state, action) => {
        state.isRefreshing = false;
        state.error = typeof action.payload === 'string' ? action.payload : 'refresh-failed';
      })
      .addCase(purchaseTurboEngineLicense.pending, (state) => {
        state.isPurchasing = true;
        state.error = null;
      })
      .addCase(purchaseTurboEngineLicense.fulfilled, (state, action) => {
        state.isPurchasing = false;
        state.lastPurchase = action.payload;
        state.snapshot = action.payload.snapshot;
      })
      .addCase(purchaseTurboEngineLicense.rejected, (state, action) => {
        state.isPurchasing = false;
        state.error = typeof action.payload === 'string' ? action.payload : 'purchase-failed';
      });
  },
});

export const {
  clearTurboEngineLicensePurchaseResult,
  setTurboEngineLicenseSnapshotFromEvent,
} = turboEngineLicenseSlice.actions;

export const selectTurboEngineLicenseState = (state: { turboEngineLicense: TurboEngineLicenseState }) => state.turboEngineLicense;
export const selectTurboEngineLicenseSnapshot = (state: { turboEngineLicense: TurboEngineLicenseState }) => state.turboEngineLicense.snapshot;
export const selectTurboEngineEntitlements = (state: { turboEngineLicense: TurboEngineLicenseState }) => state.turboEngineLicense.snapshot?.entitlements ?? [];
export const selectHasTurboEngineEntitlement = (
  state: { turboEngineLicense: TurboEngineLicenseState },
  entitlement: TurboEngineEntitlementName,
) => selectTurboEngineEntitlements(state).includes(entitlement);

export default turboEngineLicenseSlice.reducer;
