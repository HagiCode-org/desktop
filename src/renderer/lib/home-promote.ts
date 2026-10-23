export const HOME_PROMOTE_ROTATE_INTERVAL_MS = 8000;
export const HOME_PROMOTE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export interface HomePromoteRotateState {
  count: number;
  hovered: boolean;
  focused: boolean;
  paused: boolean;
  reducedMotion: boolean;
  documentVisible: boolean;
}

export function getNextIndex(index: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return 0;
  return (((index + direction) % count) + count) % count;
}

/** Stable pick of one of `count` fallback covers for an item id, so a card keeps its cover across refreshes. */
export function pickFallbackCoverIndex(id: string, count: number): number {
  if (count <= 0) return 0;
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return hash % count;
}

export function shouldAutoRotate(state: HomePromoteRotateState): boolean {
  return state.count > 1
    && !state.hovered
    && !state.focused
    && !state.paused
    && !state.reducedMotion
    && state.documentVisible;
}
