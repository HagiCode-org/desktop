import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { PCodeWebServiceManager, type ProcessInfo, type WebServiceConfig } from '../../web-service-manager.js';
import { VersionManager } from '../../version-manager.js';
import { ConfigManager } from '../../config.js';
import { manifestReader } from '../../manifest-reader.js';
import { setServerStatus, setServiceUrl } from '../../tray.js';

// Module state
interface WebServiceHandlerState {
  webServiceManager: PCodeWebServiceManager | null;
  versionManager: VersionManager | null;
  mainWindow: BrowserWindow | null;
  configManager: ConfigManager | null;
  setServerStatusFn?: (status: string, url?: string | null) => void;
  setServiceUrlFn?: (url: string | null) => void;
}

const state: WebServiceHandlerState = {
  webServiceManager: null,
  versionManager: null,
  mainWindow: null,
  configManager: null,
};

/**
 * Initialize web service handlers with dependencies
 */
export function initWebServiceHandlers(
  webServiceManager: PCodeWebServiceManager | null,
  versionManager: VersionManager | null,
  mainWindow: BrowserWindow | null,
  configManager: ConfigManager | null,
  setServerStatusFn?: (status: string, url?: string | null) => void,
  setServiceUrlFn?: (url: string | null) => void
): void {
  state.webServiceManager = webServiceManager;
  state.versionManager = versionManager;
  state.mainWindow = mainWindow;
  state.configManager = configManager;
  state.setServerStatusFn = setServerStatusFn;
  state.setServiceUrlFn = setServiceUrlFn;
}

/**
 * Register web service control IPC handlers
 */
export function registerWebServiceHandlers(deps: {
  webServiceManager: PCodeWebServiceManager | null;
  versionManager: VersionManager | null;
  mainWindow: BrowserWindow | null;
  configManager: ConfigManager | null;
  setServerStatus?: (status: string, url?: string | null) => void;
  setServiceUrl?: (url: string | null) => void;
}): void {
  state.webServiceManager = deps.webServiceManager;
  state.versionManager = deps.versionManager;
  state.mainWindow = deps.mainWindow;
  state.configManager = deps.configManager;
  state.setServerStatusFn = deps.setServerStatus;
  state.setServiceUrlFn = deps.setServiceUrl;

  // Get web service status handler
  ipcMain.handle('get-web-service-status', async () => {
    if (!state.webServiceManager) {
      return {
        status: 'stopped',
        pid: null,
        uptime: 0,
        startTime: null,
        url: null,
        restartCount: 0,
      } as ProcessInfo;
    }
    try {
      return await state.webServiceManager.getStatus();
    } catch (error) {
      console.error('Failed to get web service status:', error);
      return {
        status: 'error',
        pid: null,
        uptime: 0,
        startTime: null,
        url: null,
        restartCount: 0,
      } as ProcessInfo;
    }
  });

  // Start web service handler
  ipcMain.handle('start-web-service', async (_, force?: boolean) => {
    if (!state.webServiceManager) {
      return {
        success: false,
        error: { type: 'manager-not-initialized', details: 'Web service manager not initialized' }
      };
    }

    if (!state.versionManager) {
      return {
        success: false,
        error: { type: 'version-manager-not-initialized', details: 'Version manager not initialized' }
      };
    }

    try {
      const activeVersion = await state.versionManager.getActiveVersion();

      if (!activeVersion) {
        log.warn('[WebServiceHandlers] No active version found, cannot start web service');
        return {
          success: false,
          error: { type: 'no-active-version', details: 'No active version found. Please install and activate a version first.' }
        };
      }

      state.webServiceManager.setActiveVersion(activeVersion.id);

      const manifest = await manifestReader.readManifest(activeVersion.installedPath);
      if (manifest) {
        const entryPoint = manifestReader.parseEntryPoint(manifest);
        state.webServiceManager.setEntryPoint(entryPoint);
      } else {
        log.warn('[WebServiceHandlers] No manifest found, entryPoint may not be available');
        state.webServiceManager.setEntryPoint(null);
      }

      log.info('[WebServiceHandlers] Starting web service with version:', activeVersion.id, 'at path:', activeVersion.installedPath);

      const result = await state.webServiceManager.start();

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

      return { success: result };
    } catch (error) {
      log.error('Failed to start web service:', error);
      return {
        success: false,
        error: {
          type: 'unknown',
          details: error instanceof Error ? error.message : String(error)
        }
      };
    }
  });

  // Stop web service handler
  ipcMain.handle('stop-web-service', async () => {
    if (!state.webServiceManager) {
      return false;
    }
    try {
      const result = await state.webServiceManager.stop();
      const status = await state.webServiceManager.getStatus();
      state.mainWindow?.webContents.send('web-service-status-changed', status);

      if (state.setServerStatusFn) {
        state.setServerStatusFn(status.status);
      } else {
        setServerStatus(status.status);
      }
      if (state.setServiceUrlFn) {
        state.setServiceUrlFn(null);
      } else {
        setServiceUrl(null);
      }

      return result;
    } catch (error) {
      console.error('Failed to stop web service:', error);
      return false;
    }
  });

  // Restart web service handler
  ipcMain.handle('restart-web-service', async () => {
    if (!state.webServiceManager) {
      return false;
    }
    try {
      const result = await state.webServiceManager.restart();
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

      return result;
    } catch (error) {
      console.error('Failed to restart web service:', error);
      return false;
    }
  });

  // Get web service version handler
  ipcMain.handle('get-web-service-version', async () => {
    if (!state.webServiceManager) {
      return 'unknown';
    }
    try {
      return await state.webServiceManager.getVersion();
    } catch (error) {
      console.error('Failed to get web service version:', error);
      return 'unknown';
    }
  });

  // Get web service URL handler
  ipcMain.handle('get-web-service-url', async () => {
    if (!state.webServiceManager) {
      return null;
    }
    try {
      const status = await state.webServiceManager.getStatus();
      return status.url;
    } catch (error) {
      console.error('Failed to get web service URL:', error);
      return null;
    }
  });

  // Check web service port handler
  ipcMain.handle('check-web-service-port', async () => {
    if (!state.webServiceManager) {
      return {
        port: 5000,
        available: false,
        error: 'Web service manager not initialized'
      };
    }
    try {
      const available = await state.webServiceManager.checkPortAvailable();
      const status = await state.webServiceManager.getStatus();
      const port = status.url ? parseInt(status.url.split(':').pop() || '5000') : 5000;
      return {
        port,
        available,
        error: null
      };
    } catch (error) {
      console.error('Failed to check port:', error);
      return {
        port: 5000,
        available: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Set web service config handler
  ipcMain.handle('set-web-service-config', async (_, config: Partial<WebServiceConfig>) => {
    if (!state.webServiceManager) {
      return { success: false, error: 'Web service manager not initialized' };
    }
    try {
      await state.webServiceManager.updateConfig(config);
      return { success: true, error: null };
    } catch (error) {
      console.error('Failed to update web service config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] Web service handlers registered');
}
