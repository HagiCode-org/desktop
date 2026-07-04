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
      }),
      setDebugOptionsSettings: () => ({
        useIgnoreScriptsForManagedNpm: false,
      }),
      getMsstoreRatingPromptState: () => ({ installDate }),
      setMsstoreRatingPromptState: () => ({ installDate }),
    });

    assert.equal(snapshot.msstoreInstallDateRaw, installDate);
    assert.equal(typeof snapshot.msstoreInstallAgeDays, 'number');
  });

  it('persists msstore install raw date when saving debug options', async () => {
    let storedInstallDate = '2024-01-01T00:00:00.000Z';

    const result = await saveDebugOptionsSettings({
      settings: {
        useIgnoreScriptsForManagedNpm: true,
        msstoreInstallDateRaw: '2024-06-01T00:00:00.000Z',
      },
      configManager: {
        getDebugOptionsSettings: () => ({ useIgnoreScriptsForManagedNpm: false }),
        setDebugOptionsSettings: (next) => ({ useIgnoreScriptsForManagedNpm: next.useIgnoreScriptsForManagedNpm ?? false }),
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
  });
});
