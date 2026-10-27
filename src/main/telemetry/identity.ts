import { randomUUID } from 'node:crypto';
import type Store from 'electron-store';
import type { AppConfig } from '../config.js';

const INSTALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface InstallIdResolution {
  id: string | undefined;
  /** True only when this call created the ID, so an install that predates the ID is distinguishable. */
  created: boolean;
}

export function resolveInstallIdDetailed(store: Pick<Store<AppConfig>, 'get' | 'set'>): InstallIdResolution {
  try {
    const existing = store.get('anonymousInstallId');
    if (typeof existing === 'string' && INSTALL_ID_PATTERN.test(existing)) return { id: existing, created: false };
    const created = randomUUID();
    store.set('anonymousInstallId', created);
    return { id: created, created: true };
  } catch {
    return { id: undefined, created: false };
  }
}

export function resolveInstallId(store: Pick<Store<AppConfig>, 'get' | 'set'>): string | undefined {
  return resolveInstallIdDetailed(store).id;
}
