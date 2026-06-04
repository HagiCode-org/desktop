import { electron } from '../../../electron-api.js';
import type { BrowserWindow } from 'electron';
import { setServerStatus, setServiceUrl } from '../../tray.js';
import type { ConfigManager } from '../../config.js';
import type { PathManager } from '../../path-manager.js';
import type { PCodeWebServiceManager } from '../../web-service-manager.js';
import { createRuntimeDataPathSettingsSnapshot, saveRuntimeDataPathPreset } from '../../runtime-data-path-settings.js';
import { runtimeDataPathChannels, type RuntimeDataPathPreset } from '../../../types/runtime-data-path.js';

const { ipcMain } = electron;
type WebServiceStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping';

interface RuntimeDataPathHandlerState {
  configManager: ConfigManager | null;
  pathManager: PathManager | null;
  webServiceManager: PCodeWebServiceManager | null;
  mainWindow: BrowserWindow | null;
  setServerStatusFn?: (status: WebServiceStatus, url?: string | null) => void;
  setServiceUrlFn?: (url: string | null) => void;
}

const state: RuntimeDataPathHandlerState = {
  configManager: null,
  pathManager: null,
  webServiceManager: null,
  mainWindow: null,
};

export function registerRuntimeDataPathHandlers(deps: {
  configManager: ConfigManager | null;
  pathManager: PathManager | null;
  webServiceManager: PCodeWebServiceManager | null;
  mainWindow: BrowserWindow | null;
  setServerStatus?: (status: WebServiceStatus, url?: string | null) => void;
  setServiceUrl?: (url: string | null) => void;
}): void {
  state.configManager = deps.configManager;
  state.pathManager = deps.pathManager;
  state.webServiceManager = deps.webServiceManager;
  state.mainWindow = deps.mainWindow;
  state.setServerStatusFn = deps.setServerStatus;
  state.setServiceUrlFn = deps.setServiceUrl;

  ipcMain.handle(runtimeDataPathChannels.get, async () => {
    if (!state.configManager || !state.pathManager) {
      throw new Error('Runtime data path handlers are not initialized');
    }

    return createRuntimeDataPathSettingsSnapshot(state.configManager, state.pathManager);
  });

  ipcMain.handle(runtimeDataPathChannels.set, async (_event, preset: RuntimeDataPathPreset) => {
    if (!state.configManager || !state.pathManager) {
      throw new Error('Runtime data path handlers are not initialized');
    }

    const result = await saveRuntimeDataPathPreset({
      preset,
      configManager: state.configManager,
      pathManager: state.pathManager,
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
