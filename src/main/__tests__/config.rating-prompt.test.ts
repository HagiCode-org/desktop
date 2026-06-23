import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Store from 'electron-store';
import { ConfigManager, type AppConfig, normalizeMsstoreRatingPromptState } from '../config.js';

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

describe('normalizeMsstoreRatingPromptState', () => {
  it('returns an empty state when input is missing', () => {
    assert.deepEqual(normalizeMsstoreRatingPromptState(undefined), {});
    assert.deepEqual(normalizeMsstoreRatingPromptState(null), {});
  });

  it('keeps a valid ISO install date trimmed', () => {
    assert.deepEqual(
      normalizeMsstoreRatingPromptState({ installDate: '  2024-01-01T00:00:00.000Z  ' }),
      { installDate: '2024-01-01T00:00:00.000Z' },
    );
  });

  it('drops a blank or dirty install date', () => {
    assert.deepEqual(normalizeMsstoreRatingPromptState({ installDate: '   ' }), {});
    assert.deepEqual(normalizeMsstoreRatingPromptState({ installDate: 'not-a-date' }), {});
  });
});

describe('ConfigManager MS Store rating prompt install date', () => {
  it('writes the install date on first launch when none exists', () => {
    const fixedDate = new Date('2024-06-01T00:00:00.000Z');
    const store = createMemoryStore();
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    const result = configManager.ensureMsstoreRatingPromptInstallDate(fixedDate);

    assert.deepEqual(result, { installDate: fixedDate.toISOString() });
    assert.deepEqual(store.get('msstoreRatingPrompt'), { installDate: fixedDate.toISOString() });
  });

  it('does not overwrite an existing install date on subsequent launches', () => {
    const original = { installDate: '2024-01-01T00:00:00.000Z' };
    const store = createMemoryStore({ msstoreRatingPrompt: original });
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    const result = configManager.ensureMsstoreRatingPromptInstallDate(new Date('2029-12-31T00:00:00.000Z'));

    assert.deepEqual(result, original);
    assert.deepEqual(store.get('msstoreRatingPrompt'), original);
  });

  it('exposes the persisted state through the getter', () => {
    const store = createMemoryStore({ msstoreRatingPrompt: { installDate: '2024-02-02T00:00:00.000Z' } });
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    assert.deepEqual(
      configManager.getMsstoreRatingPromptState(),
      { installDate: '2024-02-02T00:00:00.000Z' },
    );
  });
});
