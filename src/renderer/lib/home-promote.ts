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

export function shouldAutoRotate(state: HomePromoteRotateState): boolean {
  return state.count > 1
    && !state.hovered
    && !state.focused
    && !state.paused
    && !state.reducedMotion
    && state.documentVisible;
}
