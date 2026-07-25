import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDebugOptionsSettingsSnapshot,
  saveDebugOptionsSettings,
} from '../debug-options-settings.js';

describe('debug-options-settings logic', () => {
  it('includes msstore install raw date and computed age in snapshot', () => {
    const now = Date.now();
    const installDate = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    const snapshot = createDebugOptionsSettingsSnapshot({
      getDebugOptionsSettings: () => ({
        useIgnoreScriptsForManagedNpm: false,
        skipPurchaseSimulateSuccess: false,
      }),
      setDebugOptionsSettings: () => ({
        useIgnoreScriptsForManagedNpm: false,
        skipPurchaseSimulateSuccess: false,
      }),
      getMsstoreRatingPromptState: () => ({ installDate }),
      setMsstoreRatingPromptState: () => ({ installDate }),
    });

    assert.equal(snapshot.msstoreInstallDateRaw, installDate);
    assert.equal(typeof snapshot.msstoreInstallAgeDays, 'number');
    assert.equal(snapshot.skipPurchaseSimulateSuccess, false);
  });

  it('persists msstore install raw date when saving debug options', async () => {
    let storedInstallDate = '2024-01-01T00:00:00.000Z';
    let storedDebug = {
      useIgnoreScriptsForManagedNpm: false,
      skipPurchaseSimulateSuccess: false,
    };

    const result = await saveDebugOptionsSettings({
      settings: {
        useIgnoreScriptsForManagedNpm: true,
        skipPurchaseSimulateSuccess: true,
        msstoreInstallDateRaw: '2024-06-01T00:00:00.000Z',
      },
      configManager: {
        getDebugOptionsSettings: () => ({ ...storedDebug }),
        setDebugOptionsSettings: (next) => {
          storedDebug = {
            useIgnoreScriptsForManagedNpm: next.useIgnoreScriptsForManagedNpm ?? false,
            skipPurchaseSimulateSuccess: next.skipPurchaseSimulateSuccess ?? false,
          };
          return { ...storedDebug };
        },
        getMsstoreRatingPromptState: () => ({ installDate: storedInstallDate }),
        setMsstoreRatingPromptState: (next) => {
          storedInstallDate = next.installDate ?? storedInstallDate;
          return { installDate: storedInstallDate };
        },
      },
    });

    assert.equal(result.status, 'saved');
    assert.equal(storedInstallDate, '2024-06-01T00:00:00.000Z');
    assert.equal(result.nextSettings.msstoreInstallDateRaw, '2024-06-01T00:00:00.000Z');
    assert.equal(result.nextSettings.skipPurchaseSimulateSuccess, true);
    assert.equal(storedDebug.skipPurchaseSimulateSuccess, true);
  });

  it('treats skipPurchaseSimulateSuccess as part of equality for unchanged saves', async () => {
    const result = await saveDebugOptionsSettings({
      settings: {
        useIgnoreScriptsForManagedNpm: false,
        skipPurchaseSimulateSuccess: false,
        msstoreInstallDateRaw: '2024-01-01T00:00:00.000Z',
      },
      configManager: {
        getDebugOptionsSettings: () => ({
          useIgnoreScriptsForManagedNpm: false,
          skipPurchaseSimulateSuccess: false,
        }),
        setDebugOptionsSettings: () => {
          throw new Error('should not save when unchanged');
        },
        getMsstoreRatingPromptState: () => ({ installDate: '2024-01-01T00:00:00.000Z' }),
        setMsstoreRatingPromptState: () => ({ installDate: '2024-01-01T00:00:00.000Z' }),
      },
    });

    assert.equal(result.status, 'unchanged');
  });
});
