import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  MsstoreDonationItemBridge,
  MsstoreDonationItemPurchaseResult,
  MsstoreDonationItemState,
} from '../../../types/msstore-donation-item.js';

declare global {
  interface Window {
    electronAPI: {
      msstoreDonationItem?: MsstoreDonationItemBridge;
    };
  }
}

export interface MsstoreDonationItemSliceState {
  state: MsstoreDonationItemState | null;
  lastPurchase: MsstoreDonationItemPurchaseResult | null;
  isLoading: boolean;
  isPurchasing: boolean;
  isDismissing: boolean;
  error: string | null;
}

function getBridge(): MsstoreDonationItemBridge {
  const bridge = window.electronAPI?.msstoreDonationItem;
  if (!bridge) {
    throw new Error('MS Store donation item feature is unavailable in this Desktop runtime.');
  }

  return bridge;
}

export const loadMsstoreDonationItemState = createAsyncThunk(
  'msstoreDonationItem/loadState',
  async (_, { rejectWithValue }) => {
    try {
      return await getBridge().getState();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const purchaseMsstoreDonationItem = createAsyncThunk(
  'msstoreDonationItem/purchase',
  async (_, { rejectWithValue }) => {
    try {
      return await getBridge().purchase();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const dismissMsstoreDonationItem = createAsyncThunk(
  'msstoreDonationItem/dismiss',
  async (_, { rejectWithValue }) => {
    try {
      return await getBridge().dismiss();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

const initialState: MsstoreDonationItemSliceState = {
  state: null,
  lastPurchase: null,
  isLoading: false,
  isPurchasing: false,
  isDismissing: false,
  error: null,
};

const msstoreDonationItemSlice = createSlice({
  name: 'msstoreDonationItem',
  initialState,
  reducers: {
    setMsstoreDonationItemState: (state, action: PayloadAction<MsstoreDonationItemState>) => {
      state.state = action.payload;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadMsstoreDonationItemState.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadMsstoreDonationItemState.fulfilled, (state, action) => {
        state.isLoading = false;
        state.state = action.payload;
      })
      .addCase(loadMsstoreDonationItemState.rejected, (state, action) => {
        state.isLoading = false;
        state.error = typeof action.payload === 'string'
          ? action.payload
          : action.error.message ?? 'Failed to load MS Store donation item state.';
      })
      .addCase(purchaseMsstoreDonationItem.pending, (state) => {
        state.isPurchasing = true;
        state.error = null;
      })
      .addCase(purchaseMsstoreDonationItem.fulfilled, (state, action) => {
        state.isPurchasing = false;
        state.lastPurchase = action.payload;
        state.state = {
          purchaseCount: action.payload.purchaseCount,
          dismissedAt: state.state?.dismissedAt,
        };
      })
      .addCase(purchaseMsstoreDonationItem.rejected, (state, action) => {
        state.isPurchasing = false;
        state.error = typeof action.payload === 'string'
          ? action.payload
          : action.error.message ?? 'Failed to purchase MS Store donation item.';
      })
      .addCase(dismissMsstoreDonationItem.pending, (state) => {
        state.isDismissing = true;
        state.error = null;
      })
      .addCase(dismissMsstoreDonationItem.fulfilled, (state, action) => {
        state.isDismissing = false;
        state.state = action.payload;
      })
      .addCase(dismissMsstoreDonationItem.rejected, (state, action) => {
        state.isDismissing = false;
        state.error = typeof action.payload === 'string'
          ? action.payload
          : action.error.message ?? 'Failed to dismiss MS Store donation item.';
      });
  },
});

export const { setMsstoreDonationItemState } = msstoreDonationItemSlice.actions;

export const selectMsstoreDonationItemState = (state: { msstoreDonationItem: MsstoreDonationItemSliceState }) => state.msstoreDonationItem;

export default msstoreDonationItemSlice.reducer;
