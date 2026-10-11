import { useCallback, useSyncExternalStore } from 'react';
import {
  SIDEBAR_AUTO_COLLAPSE_BELOW_PX,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  parseSidebarCollapsePreference,
  resolveSidebarCollapsed,
  type SidebarCollapsePreference,
} from '../lib/sidebar-layout';

const listeners = new Set<() => void>();

function readStoredPreference(): SidebarCollapsePreference {
  try {
    return parseSidebarCollapsePreference(window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY));
  } catch {
    return null;
  }
}

let preference: SidebarCollapsePreference = typeof window === 'undefined' ? null : readStoredPreference();

function getSnapshot(): boolean {
  return resolveSidebarCollapsed(preference, window.innerWidth);
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Re-evaluate when the window crosses the auto-collapse width.
  const narrowWindow = window.matchMedia?.(`(max-width: ${SIDEBAR_AUTO_COLLAPSE_BELOW_PX - 1}px)`);
  narrowWindow?.addEventListener('change', listener);

  return () => {
    listeners.delete(listener);
    narrowWindow?.removeEventListener('change', listener);
  };
}

/**
 * Shared sidebar state so the shell can give the width back to the content
 * when the navigation rail collapses.
 */
export function useSidebarLayout() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleCollapsed = useCallback(() => {
    preference = !getSnapshot();

    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(preference));
    } catch {
      // Persistence is a convenience; the in-memory choice still applies.
    }

    listeners.forEach((listener) => listener());
  }, []);

  return { collapsed, toggleCollapsed };
}
