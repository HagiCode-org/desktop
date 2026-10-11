import { createSlice } from '@reduxjs/toolkit';
import type { PromoteItem } from '../../../types/promote.js';
import { loadHomePromoteItems } from '../thunks/homePromoteThunks.js';

export interface HomePromoteSliceState {
  items: PromoteItem[];
  language: string | null;
  loadedAt: number | null;
  loading: boolean;
  imagesByKey: Record<string, string>;
}

const initialState: HomePromoteSliceState = {
  items: [],
  language: null,
  loadedAt: null,
  loading: false,
  imagesByKey: {},
};

const homePromoteSlice = createSlice({
  name: 'homePromote',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadHomePromoteItems.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadHomePromoteItems.fulfilled, (state, action) => {
        state.loading = false;
        if (!action.payload) return;
        state.items = action.payload.items;
        state.imagesByKey = action.payload.imagesByKey;
        state.language = action.payload.language;
        state.loadedAt = action.payload.loadedAt;
      })
      .addCase(loadHomePromoteItems.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const selectHomePromoteItems = (state: { homePromote: HomePromoteSliceState }) => state.homePromote.items;

export const selectHomePromoteImagesByKey = (state: { homePromote: HomePromoteSliceState }) => state.homePromote.imagesByKey;

export const selectHomePromoteLoading = (state: { homePromote: HomePromoteSliceState }) => state.homePromote.loading;

export default homePromoteSlice.reducer;
