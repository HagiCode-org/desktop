import { randomUUID } from 'node:crypto';
import type Store from 'electron-store';
import type { AppConfig } from '../config.js';

const INSTALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function resolveInstallId(store: Pick<Store<AppConfig>, 'get' | 'set'>): string | undefined {
  try {
    const existing = store.get('anonymousInstallId');
    if (typeof existing === 'string' && INSTALL_ID_PATTERN.test(existing)) return existing;
    const created = randomUUID();
    store.set('anonymousInstallId', created);
    return created;
  } catch {
    return undefined;
  }
}
