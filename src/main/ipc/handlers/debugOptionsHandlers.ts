import { electron } from '../../../electron-api.js';
import type { ConfigManager } from '../../config.js';
import {
  createDebugOptionsSettingsSnapshot,
  saveDebugOptionsSettings,
} from '../../debug-options-settings.js';
import {
  debugOptionsChannels,
  type DebugOptionsSettings,
} from '../../../types/debug-options.js';

const { ipcMain } = electron;

interface DebugOptionsHandlerState {
  configManager: ConfigManager | null;
}

const state: DebugOptionsHandlerState = {
  configManager: null,
};

export function registerDebugOptionsHandlers(deps: {
  configManager: ConfigManager | null;
}): void {
  state.configManager = deps.configManager;

  ipcMain.handle(debugOptionsChannels.get, async () => {
    if (!state.configManager) {
      throw new Error('Debug options handlers are not initialized');
    }

    return createDebugOptionsSettingsSnapshot(state.configManager);
  });

  ipcMain.handle(debugOptionsChannels.set, async (_event, settings: DebugOptionsSettings) => {
    if (!state.configManager) {
      throw new Error('Debug options handlers are not initialized');
    }

    const result = await saveDebugOptionsSettings({
      settings,
      configManager: state.configManager,
    });

    return result;
  });
}
