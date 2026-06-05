import { electron } from '../../../electron-api.js';
import type { BrowserWindow } from 'electron';
import { setServerStatus, setServiceUrl } from '../../tray.js';
import type { ConfigManager } from '../../config.js';
import type { PCodeWebServiceManager } from '../../web-service-manager.js';
import {
  createDebugOptionsSettingsSnapshot,
  saveDebugOptionsSettings,
} from '../../debug-options-settings.js';
import {
  debugOptionsChannels,
  type DebugOptionsSettings,
} from '../../../types/debug-options.js';

const { ipcMain } = electron;
type WebServiceStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping';

interface DebugOptionsHandlerState {
  configManager: ConfigManager | null;
  webServiceManager: PCodeWebServiceManager | null;
  mainWindow: BrowserWindow | null;
  setServerStatusFn?: (status: WebServiceStatus, url?: string | null) => void;
  setServiceUrlFn?: (url: string | null) => void;
}

const state: DebugOptionsHandlerState = {
  configManager: null,
  webServiceManager: null,
  mainWindow: null,
};

export function registerDebugOptionsHandlers(deps: {
  configManager: ConfigManager | null;
  webServiceManager: PCodeWebServiceManager | null;
  mainWindow: BrowserWindow | null;
  setServerStatus?: (status: WebServiceStatus, url?: string | null) => void;
  setServiceUrl?: (url: string | null) => void;
}): void {
  state.configManager = deps.configManager;
  state.webServiceManager = deps.webServiceManager;
  state.mainWindow = deps.mainWindow;
  state.setServerStatusFn = deps.setServerStatus;
  state.setServiceUrlFn = deps.setServiceUrl;

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
      webServiceManager: state.webServiceManager,
    });

    if (state.webServiceManager && result.restartAttempted) {
      const status = await state.webServiceManager.getStatus();
      state.mainWindow?.webContents.send('web-service-status-changed', status);
      if (state.setServerStatusFn) {
        state.setServerStatusFn(status.status, status.url);
      } else {
        setServerStatus(status.status, status.url);
      }
      if (state.setServiceUrlFn) {
        state.setServiceUrlFn(status.url);
      } else {
        setServiceUrl(status.url);
      }
    }

    return result;
  });
}
