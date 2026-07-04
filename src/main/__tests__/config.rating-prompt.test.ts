import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Store from 'electron-store';
import {
  ConfigManager,
  type AppConfig,
  normalizeMsstoreDonationItemState,
  normalizeMsstoreRatingPromptState,
} from '../config.js';

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

describe('normalizeMsstoreDonationItemState', () => {
  it('returns default state when input is missing', () => {
    assert.deepEqual(normalizeMsstoreDonationItemState(undefined), { purchaseCount: 0 });
    assert.deepEqual(normalizeMsstoreDonationItemState(null), { purchaseCount: 0 });
  });

  it('keeps non-negative integer purchaseCount and trims valid dismissedAt', () => {
    assert.deepEqual(
      normalizeMsstoreDonationItemState({ purchaseCount: 12, dismissedAt: ' 2024-01-01T00:00:00.000Z ' }),
      { purchaseCount: 12, dismissedAt: '2024-01-01T00:00:00.000Z' },
    );
  });

  it('drops invalid values and falls back to defaults', () => {
    assert.deepEqual(normalizeMsstoreDonationItemState({ purchaseCount: -1 }), { purchaseCount: 0 });
    assert.deepEqual(normalizeMsstoreDonationItemState({ purchaseCount: 1.5 }), { purchaseCount: 0 });
    assert.deepEqual(
      normalizeMsstoreDonationItemState({ purchaseCount: 3, dismissedAt: 'not-a-date' }),
      { purchaseCount: 3 },
    );
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
});

describe('ConfigManager MS Store donation item state', () => {
  it('hydrates and normalizes dirty donation state', () => {
    const store = createMemoryStore({
      msstoreDonationItem: {
        purchaseCount: -1,
        dismissedAt: 'not-a-date',
      },
    });
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    const state = configManager.getMsstoreDonationItemState();

    assert.deepEqual(state, { purchaseCount: 0 });
    assert.deepEqual(store.get('msstoreDonationItem'), { purchaseCount: 0 });
  });

  it('increments purchaseCount and persists across reads', () => {
    const store = createMemoryStore({
      msstoreDonationItem: {
        purchaseCount: 2,
      },
    });
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    const afterIncrement = configManager.incrementMsstoreDonationItemPurchaseCount();
    const reloaded = configManager.getMsstoreDonationItemState();

    assert.equal(afterIncrement.purchaseCount, 3);
    assert.equal(reloaded.purchaseCount, 3);
    assert.deepEqual(store.get('msstoreDonationItem'), { purchaseCount: 3 });
  });

  it('stores dismissedAt via setMsstoreDonationItemState', () => {
    const store = createMemoryStore();
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    const next = configManager.setMsstoreDonationItemState({
      purchaseCount: 4,
      dismissedAt: '2024-06-02T00:00:00.000Z',
    });

    assert.deepEqual(next, {
      purchaseCount: 4,
      dismissedAt: '2024-06-02T00:00:00.000Z',
    });
    assert.deepEqual(store.get('msstoreDonationItem'), next);
  });
});

describe('ConfigManager MS Store rating prompt state hydration', () => {
  it('normalizes and persists dirty stored values', () => {
    const store = createMemoryStore({ msstoreRatingPrompt: { installDate: '  not-a-date  ' } });
    const configManager = new ConfigManager(store as unknown as Store<AppConfig>);

    assert.deepEqual(
      configManager.getMsstoreRatingPromptState(),
      {},
    );
    assert.deepEqual(store.get('msstoreRatingPrompt'), {});
  });
});
