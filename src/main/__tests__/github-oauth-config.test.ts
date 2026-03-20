import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ConfigManager,
  defaultGitHubOAuthConfig,
  normalizeGitHubOAuthConfig,
  validateGitHubOAuthConfig,
  type AppConfig,
} from '../config.js';

function createMemoryStore(initial: Partial<AppConfig> = {}) {
  const store = {
    server: { host: 'localhost', port: 36546 },
    remoteMode: { enabled: false, url: '' },
    githubOAuth: { ...defaultGitHubOAuthConfig },
    startOnStartup: false,
    minimizeToTray: true,
    checkForUpdates: true,
    settings: { language: 'zh-CN' },
    ...initial,
  } as AppConfig;

  return {
    get: (key: keyof AppConfig) => store[key],
    set: (key: keyof AppConfig, value: AppConfig[keyof AppConfig]) => {
      store[key] = value as never;
    },
    clear: () => {
      store.githubOAuth = { ...defaultGitHubOAuthConfig };
    },
    delete: (key: keyof AppConfig) => {
      delete (store as Partial<AppConfig>)[key];
    },
    get store() {
      return store;
    },
  };
}

describe('github oauth config persistence', () => {
  it('normalizes and persists trimmed GitHub OAuth credentials', () => {
    const memoryStore = createMemoryStore();
    const manager = new ConfigManager(memoryStore as any);

    const saved = manager.setGitHubOAuthConfig({
      clientId: ' client-id ',
      clientSecret: ' secret-value ',
      lastUpdated: '2026-03-20T10:00:00.000Z',
    });

    assert.deepEqual(saved, {
      clientId: 'client-id',
      clientSecret: 'secret-value',
      lastUpdated: '2026-03-20T10:00:00.000Z',
    });
    assert.deepEqual(manager.getGitHubOAuthConfig(), saved);
  });

  it('clears persisted credentials back to safe defaults', () => {
    const memoryStore = createMemoryStore({
      githubOAuth: {
        clientId: 'client-id',
        clientSecret: 'secret-value',
        lastUpdated: '2026-03-20T10:00:00.000Z',
      },
    });
    const manager = new ConfigManager(memoryStore as any);

    const cleared = manager.clearGitHubOAuthConfig();

    assert.deepEqual(cleared, defaultGitHubOAuthConfig);
    assert.deepEqual(manager.getGitHubOAuthConfig(), defaultGitHubOAuthConfig);
  });
});

describe('github oauth validation', () => {
  it('normalizes missing values to empty strings', () => {
    assert.deepEqual(normalizeGitHubOAuthConfig({ clientId: ' ', clientSecret: '\n' }), defaultGitHubOAuthConfig);
  });

  it('requires both client id and client secret', () => {
    assert.equal(
      validateGitHubOAuthConfig({
        clientId: '',
        clientSecret: 'secret',
        lastUpdated: null,
      }),
      'GitHub Client ID is required.'
    );

    assert.equal(
      validateGitHubOAuthConfig({
        clientId: 'client-id',
        clientSecret: '',
        lastUpdated: null,
      }),
      'GitHub Client Secret is required.'
    );
  });
});
