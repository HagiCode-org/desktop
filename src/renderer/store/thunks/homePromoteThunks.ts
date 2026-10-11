import { createAsyncThunk } from '@reduxjs/toolkit';
import type { PromoteItem } from '../../../types/promote.js';
import type { HomePromoteSliceState } from '../slices/homePromoteSlice';

export interface HomePromoteLoadResult {
  items: PromoteItem[];
  imagesByKey: Record<string, string>;
  language: string;
  loadedAt: number;
}

export const loadHomePromoteItems = createAsyncThunk<
  HomePromoteLoadResult | null,
  string,
  { state: { homePromote: HomePromoteSliceState } }
>('homePromote/loadItems', async (language, { getState }) => {
  const bridge = window.electronAPI?.promote;
  if (!bridge) return null;

  const { items } = await bridge.getItems({ language });
  const cachedImages = getState().homePromote.imagesByKey;
  const keys = [...new Set(items.flatMap((item) => (item.image ? [item.image.key] : [])))];

  const resolved = await Promise.all(keys.map(async (key) => {
    const cached = cachedImages[key];
    if (cached) return { key, dataUrl: cached };
    try {
      const { dataUrl } = await bridge.getImage({ key });
      return { key, dataUrl };
    } catch {
      return { key, dataUrl: null };
    }
  }));

  const imagesByKey: Record<string, string> = {};
  for (const { key, dataUrl } of resolved) {
    if (dataUrl) imagesByKey[key] = dataUrl;
  }

  return { items, imagesByKey, language, loadedAt: Date.now() };
});
