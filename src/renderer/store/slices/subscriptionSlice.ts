import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  SubscriptionBridge,
  SubscriptionEntitlementName,
  SubscriptionPurchaseResult,
  SubscriptionSnapshot,
} from '../../../types/subscription.js';

declare global {
  interface Window {
    electronAPI: {
      subscription?: SubscriptionBridge;
    };
  }
}

export interface SubscriptionState {
  snapshot: SubscriptionSnapshot | null;
  lastPurchase: SubscriptionPurchaseResult | null;
  isLoading: boolean;
  isStartupVerifying: boolean;
  isRefreshing: boolean;
  isPurchasing: boolean;
  error: string | null;
}

function getSubscriptionBridge(): SubscriptionBridge {
  const bridge = window.electronAPI?.subscription;
  if (!bridge) {
    throw new Error('Subscription feature is unavailable in this Desktop runtime.');
  }

  return bridge;
}

export const loadSubscriptionSnapshot = createAsyncThunk(
  'subscription/loadSnapshot',
  async (_, { rejectWithValue }) => {
    try {
      return await getSubscriptionBridge().getSnapshot();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const verifySubscriptionStartup = createAsyncThunk(
  'subscription/verifyStartup',
  async (_, { rejectWithValue }) => {
    try {
      return await getSubscriptionBridge().verifyStartup();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const refreshSubscriptionSnapshot = createAsyncThunk(
  'subscription/refreshSnapshot',
  async (_, { rejectWithValue }) => {
    try {
      return await getSubscriptionBridge().refresh();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const purchaseSubscription = createAsyncThunk(
  'subscription/purchase',
  async (_, { rejectWithValue }) => {
    try {
      return await getSubscriptionBridge().purchase();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

const initialState: SubscriptionState = {
  snapshot: null,
  lastPurchase: null,
  isLoading: false,
  isStartupVerifying: false,
  isRefreshing: false,
  isPurchasing: false,
  error: null,
};

const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState,
  reducers: {
    setSubscriptionSnapshotFromEvent(state, action: PayloadAction<SubscriptionSnapshot>) {
      state.snapshot = action.payload;
      state.error = null;
    },
    clearSubscriptionPurchaseResult(state) {
      state.lastPurchase = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSubscriptionSnapshot.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadSubscriptionSnapshot.fulfilled, (state, action) => {
        state.isLoading = false;
        state.snapshot = action.payload;
      })
      .addCase(loadSubscriptionSnapshot.rejected, (state, action) => {
        state.isLoading = false;
        state.error = typeof action.payload === 'string' ? action.payload : 'load-failed';
      })
      .addCase(verifySubscriptionStartup.pending, (state) => {
        state.isStartupVerifying = true;
        state.error = null;
      })
      .addCase(verifySubscriptionStartup.fulfilled, (state, action) => {
        state.isStartupVerifying = false;
        state.snapshot = action.payload;
      })
      .addCase(verifySubscriptionStartup.rejected, (state, action) => {
        state.isStartupVerifying = false;
        state.error = typeof action.payload === 'string' ? action.payload : 'verify-startup-failed';
      })
      .addCase(refreshSubscriptionSnapshot.pending, (state) => {
        state.isRefreshing = true;
        state.error = null;
      })
      .addCase(refreshSubscriptionSnapshot.fulfilled, (state, action) => {
        state.isRefreshing = false;
        state.snapshot = action.payload;
      })
      .addCase(refreshSubscriptionSnapshot.rejected, (state, action) => {
        state.isRefreshing = false;
        state.error = typeof action.payload === 'string' ? action.payload : 'refresh-failed';
      })
      .addCase(purchaseSubscription.pending, (state) => {
        state.isPurchasing = true;
        state.error = null;
      })
      .addCase(purchaseSubscription.fulfilled, (state, action) => {
        state.isPurchasing = false;
        state.lastPurchase = action.payload;
        state.snapshot = action.payload.snapshot;
      })
      .addCase(purchaseSubscription.rejected, (state, action) => {
        state.isPurchasing = false;
        state.error = typeof action.payload === 'string' ? action.payload : 'purchase-failed';
      });
  },
});

export const {
  clearSubscriptionPurchaseResult,
  setSubscriptionSnapshotFromEvent,
} = subscriptionSlice.actions;

export const selectSubscriptionState = (state: { subscription: SubscriptionState }) => state.subscription;
export const selectSubscriptionSnapshot = (state: { subscription: SubscriptionState }) => state.subscription.snapshot;
export const selectSubscriptionEntitlements = (state: { subscription: SubscriptionState }) => state.subscription.snapshot?.entitlements ?? [];
export const selectHasSubscriptionEntitlement = (
  state: { subscription: SubscriptionState },
  entitlement: SubscriptionEntitlementName,
) => selectSubscriptionEntitlements(state).includes(entitlement);

export default subscriptionSlice.reducer;
