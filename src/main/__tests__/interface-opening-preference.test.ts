import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import type Store from 'electron-store';
import {
  ConfigManager,
  type AppConfig,
  normalizeInterfaceOpeningMethod,
} from '../config.js';
import { openPreferredInterface } from '../interface-opening-preference.js';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

function createMemoryStore(initial: Record<string, unknown> = {}): Store {
  const data = structuredClone(initial);

  return {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value;
    },
    delete: (key: string) => {
      delete data[key];
    },
    clear: () => {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    },
    get store() {
      return data;
    },
  } as unknown as Store;
}

describe('interface opening preference', () => {
  it('normalizes and persists only supported methods', () => {
    const store = createMemoryStore();
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    assert.equal(normalizeInterfaceOpeningMethod('in-app'), 'in-app');
    assert.equal(normalizeInterfaceOpeningMethod('browser'), 'browser');
    assert.equal(normalizeInterfaceOpeningMethod('other'), undefined);
    assert.equal(configManager.setInterfaceOpeningMethod('in-app'), 'in-app');
    assert.equal(configManager.getInterfaceOpeningMethod(), 'in-app');
    assert.equal(store.get('interfaceOpeningMethod'), 'in-app');
  });

  it('keeps the stored preference when an invalid method is received', () => {
    const store = createMemoryStore({ interfaceOpeningMethod: 'browser' });
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    assert.equal(configManager.setInterfaceOpeningMethod('other'), 'browser');
    assert.equal(store.get('interfaceOpeningMethod'), 'browser');
  });

  it('treats an invalid stored method as no preference', () => {
    const store = createMemoryStore({ interfaceOpeningMethod: 'other' });
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    assert.equal(configManager.getInterfaceOpeningMethod(), undefined);
  });

  it('opens the selected interface exactly once after a valid startup URL', async () => {
    const calls: string[] = [];

    await openPreferredInterface({
      url: 'http://127.0.0.1:36556',
      method: 'in-app',
      openInApp: async () => {
        calls.push('in-app');
        return true;
      },
      openInBrowser: async () => {
        calls.push('browser');
        return true;
      },
      onError: () => assert.fail('opening should not fail'),
    });

    assert.deepEqual(calls, ['in-app']);
  });

  it('opens the browser for the browser preference', async () => {
    const calls: string[] = [];

    await openPreferredInterface({
      url: 'https://example.test/service',
      method: 'browser',
      openInApp: async () => {
        calls.push('in-app');
        return true;
      },
      openInBrowser: async () => {
        calls.push('browser');
        return true;
      },
      onError: () => assert.fail('opening should not fail'),
    });

    assert.deepEqual(calls, ['browser']);
  });

  it('does not open for a missing preference or invalid URL', async () => {
    let calls = 0;
    const options = {
      openInApp: async () => {
        calls += 1;
        return true;
      },
      openInBrowser: async () => {
        calls += 1;
        return true;
      },
      onError: () => assert.fail('opening should not fail'),
    };

    await openPreferredInterface({ url: 'http://127.0.0.1:36556', method: undefined, ...options });
    await openPreferredInterface({ url: 'not a URL', method: 'browser', ...options });

    assert.equal(calls, 0);
  });

  it('keeps startup opening best-effort when an opener fails', async () => {
    const errors: string[] = [];

    await openPreferredInterface({
      url: 'http://127.0.0.1:36556',
      method: 'browser',
      openInApp: async () => true,
      openInBrowser: async () => false,
      onError: (message) => errors.push(message),
    });

    assert.deepEqual(errors, ['Failed to automatically open Hagicode using browser']);
  });

  it('wires automatic opening only into the successful active start handler', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(
      source,
      /if \(!result\.success\) \{[\s\S]*?return \{\s*success: false,[\s\S]*?\};\s*\}\s*await openPreferredInterface\(\{[\s\S]*?url: status\.url,[\s\S]*?method: configManager\?\.getInterfaceOpeningMethod\(\),/m,
    );
    assert.doesNotMatch(
      source,
      /ipcMain\.handle\('restart-web-service',[\s\S]*?openPreferredInterface/m,
    );
  });
});
