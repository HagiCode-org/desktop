import { useEffect, useState } from 'react';
import type { DesktopVersionInfoPayload } from '../../types/version-info';

export const UNKNOWN_BUILD_VALUE = 'unknown';
const SHORT_COMMIT_LENGTH = 7;

export type DesktopBuildInfoState =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | {
      status: 'ready';
      desktopVersion: string;
      buildBranch: string;
      buildCommit: string;
    };

/** Shortens a full commit hash for display; the `unknown` placeholder is returned unchanged. */
export function shortBuildCommit(buildCommit: string): string {
  return buildCommit === UNKNOWN_BUILD_VALUE ? buildCommit : buildCommit.slice(0, SHORT_COMMIT_LENGTH);
}

/**
 * Reads the build payload once through the preload bridge. A missing bridge method,
 * a rejected request, or a throw while reading the payload all resolve to `unavailable`.
 */
export async function loadDesktopBuildInfo(readVersionInfo: unknown): Promise<DesktopBuildInfoState> {
  if (typeof readVersionInfo !== 'function') {
    return { status: 'unavailable' };
  }

  try {
    const payload = await (readVersionInfo as () => Promise<DesktopVersionInfoPayload>)();
    return {
      status: 'ready',
      desktopVersion: payload.desktopVersion,
      buildBranch: typeof payload.buildBranch === 'string' ? payload.buildBranch : UNKNOWN_BUILD_VALUE,
      buildCommit: typeof payload.buildCommit === 'string' ? payload.buildCommit : UNKNOWN_BUILD_VALUE,
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export function useDesktopBuildInfo(): DesktopBuildInfoState {
  const [state, setState] = useState<DesktopBuildInfoState>({ status: 'pending' });

  useEffect(() => {
    let cancelled = false;

    void loadDesktopBuildInfo(window.electronAPI?.getVersionInfo).then((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
